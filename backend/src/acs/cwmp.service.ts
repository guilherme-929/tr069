import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import { ScriptsService } from '../scripts/scripts.service';
import { ConfigService } from '../system-config/config.service';
import { DevicesService } from '../devices/devices.service';

@Injectable()
export class CwmpService {
  private readonly logger = new Logger(CwmpService.name);
  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
  });

  private readonly builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    format: true,
    suppressEmptyNode: true,
  });

  private cachedTenantId: string | null = null;
  private lastSerial: string | null = null;

  constructor(
    private prisma: PrismaService,
    private ws: WebsocketGateway,
    private scriptsService: ScriptsService,
    private configService: ConfigService,
    @Inject(forwardRef(() => DevicesService)) private devicesService: DevicesService,
  ) {}

  private async resolveTenantId(): Promise<string> {
    if (this.cachedTenantId) return this.cachedTenantId;
    const tenant = await this.prisma.tenant.findFirst({ where: { slug: 'default-isp' } })
      || await this.prisma.tenant.findFirst();
    if (!tenant) throw new Error('No tenant found in database. Run seed first.');
    this.cachedTenantId = tenant.id;
    return tenant.id;
  }

  async handleCwmp(xmlString: string, serial?: string, getSession?: () => any, clientIp?: string): Promise<string> {
    if (!xmlString || !xmlString.trim()) {
      // Empty POST from the CPE — it's asking the ACS for the next command.
      // Deliver a pending task if there is one (covers CPEs that don't accept
      // multiple envelopes in the Inform response, and CGNAT scenarios where
      // Connection Requests can't reach the device).
      if (this.lastSerial) {
        const device = await this.prisma.device.findUnique({ where: { serial: this.lastSerial } });
        if (device) {
          const pending = await this.prisma.task.count({ where: { deviceId: device.id, status: 'PENDING' } });
          if (pending > 0) {
            return this.buildNextCommandResponse(device);
          }
        }
      }
      return this.buildEmptySoapEnvelope();
    }

    if (serial) this.lastSerial = serial;

    try {
      const parsed = this.parser.parse(xmlString);
      const envelope = parsed['soap:Envelope'] || parsed['soapenv:Envelope'] || parsed['SOAP-ENV:Envelope'] || parsed['Envelope'];
      const body = envelope?.['soap:Body'] || envelope?.['soapenv:Body'] || envelope?.['SOAP-ENV:Body'] || envelope?.['Body'];

      if (!body) {
        return this.buildFaultResponse('Client', 'No SOAP body found');
      }

      const bodyKeys = Object.keys(body);

      if (body['cwmp:Inform'] || body['Inform']) {
        return await this.handleInform(body, serial, clientIp);
      }

      if (body['cwmp:TransferComplete'] || body['TransferComplete']) {
        return await this.handleTransferComplete(body);
      }

      if (body['cwmp:AutonomousTransferComplete'] || body['AutonomousTransferComplete']) {
        return await this.handleAutonomousTransferComplete(body);
      }

      if (body['cwmp:GetRPCMethods'] || body['GetRPCMethods']) {
        return this.buildGetRPCMethodsResponse();
      }

      if (body['cwmp:GetParameterValuesResponse'] || body['GetParameterValuesResponse']) {
        return await this.handleGetParameterValuesResponse(body);
      }

      if (body['cwmp:SetParameterValuesResponse'] || body['SetParameterValuesResponse']) {
        return await this.handleSetParameterValuesResponse(body);
      }

      if (body['cwmp:GetParameterNamesResponse'] || body['GetParameterNamesResponse']) {
        return await this.handleGetParameterNamesResponse(body);
      }

      if (body['cwmp:DownloadResponse'] || body['DownloadResponse']) {
        return await this.handleDownloadResponse(body);
      }

      if (body['cwmp:UploadResponse'] || body['UploadResponse']) {
        return await this.handleUploadResponse(body);
      }

      if (body['cwmp:RebootResponse'] || body['RebootResponse']) {
        return await this.handleRebootResponse(body);
      }

      if (body['cwmp:FactoryResetResponse'] || body['FactoryResetResponse']) {
        return await this.handleFactoryResetResponse(body);
      }

      if (body['SOAP-ENV:Fault'] || body['soap:Fault'] || body['Fault']) {
        const faultDetail = JSON.stringify(body['SOAP-ENV:Fault'] || body['soap:Fault'] || body['Fault']).slice(0, 500);
        this.logger.warn(`CPE returned Fault: ${faultDetail}`);
        if (this.lastSerial) {
          const device = await this.prisma.device.findUnique({ where: { serial: this.lastSerial } });
          if (device) {
            const failedTasks = await this.prisma.task.findMany({
              where: { deviceId: device.id, status: 'IN_PROGRESS' },
              select: { id: true, type: true, payload: true, maxAttempts: true },
            });
            for (const ft of failedTasks) {
              this.logger.warn(`[FAULT-DETAIL] Device=${device.serial} Task=${ft.id} Type=${ft.type} Payload=${JSON.stringify(ft.payload).slice(0, 300)}`);
            }
            await this.prisma.task.updateMany({
              where: { deviceId: device.id, status: 'IN_PROGRESS' },
              data: { status: 'FAILED', error: `CPE returned SOAP Fault: ${faultDetail.slice(0, 200)}` },
            });
            await this.prisma.event.create({
              data: {
                deviceId: device.id,
                code: 'SOAP_FAULT',
                message: `CPE returned Fault: ${faultDetail.slice(0, 200)}`,
                data: { fault: faultDetail, failedTasks: failedTasks.map(t => ({ id: t.id, type: t.type })) } as any,
                tenantId: device.tenantId,
              },
            });

            // If Fault 9814 (parse error), cancel all remaining PENDING tasks
            // of the same type to break the provisioning loop.
            // The XML generated is likely malformed for this CPE model, so
            // retrying will only keep failing and accumulating tasks.
            const isFault9814 = faultDetail.includes('9814') || faultDetail.includes('Parse xml');
            if (isFault9814) {
              const faultedTypes = [...new Set(failedTasks.map(t => t.type))];
              for (const ft of faultedTypes) {
                const cancelled = await this.prisma.task.updateMany({
                  where: { deviceId: device.id, status: 'PENDING', type: ft },
                  data: { status: 'CANCELLED', error: `Cancelled due to Fault 9814 on type ${ft}` },
                });
                if (cancelled.count > 0) {
                  this.logger.warn(`[FAULT-9814] Cancelled ${cancelled.count} pending ${ft} tasks for ${device.serial}`);
                }
              }
            }

            // If Fault 9005 (invalid parameter name), retry with split batches
            // to isolate the bad parameter. For GPV tasks, split names array
            // in half; for SPV/Provision tasks, split parameter keys.
            // When isolated to a single parameter, persist as unsupported
            // no DeviceModel — equivalente ao que o GenieACS faz ao nunca
            // reconsultar um path que já se provou inválido para aquele modelo.
            const isFault9005 = faultDetail.includes('9005') || faultDetail.includes('Invalid parameter name');
            if (isFault9005) {
              for (const ft of failedTasks) {
                const payload = (ft.payload || {}) as any;
                if (ft.type === 'GetParameterValues' && Array.isArray(payload.names)) {
                  if (payload.names.length > 1) {
                    const half = Math.ceil(payload.names.length / 2);
                    const split1 = payload.names.slice(0, half);
                    const split2 = payload.names.slice(half);
                    this.logger.warn(`[FAULT-9005] Splitting GPV task ${ft.id}: ${payload.names.length} names -> ${split1.length} + ${split2.length}`);
                    for (const chunk of [split1, split2]) {
                      await this.prisma.task.create({
                        data: {
                          deviceId: device.id,
                          type: 'GetParameterValues',
                          status: 'PENDING',
                          payload: { names: chunk },
                          tenantId: device.tenantId,
                        },
                      });
                    }
                  } else if (payload.names.length === 1) {
                    // Path isolado como culpado — persiste como unsupported
                    await this.markPathUnsupported(device.modelId, payload.names[0]);
                  }
                }
                if (ft.type === 'SetParameterValues' || ft.type === 'Provision') {
                  // Normalize to { path: value } format regardless of payload structure
                  let paramMap: Record<string, string> = {};
                  if (payload.parameters) {
                    paramMap = { ...payload.parameters };
                  } else if (payload.params && Array.isArray(payload.params)) {
                    // createSetParamTask uses payload.params: [{ name, value }]
                    for (const p of payload.params) {
                      if (p.name) paramMap[p.name] = String(p.value ?? '');
                    }
                  }

                  const paramKeys = Object.keys(paramMap);
                  if (paramKeys.length > 1) {
                    const half = Math.ceil(paramKeys.length / 2);
                    const split1 = paramKeys.slice(0, half);
                    const split2 = paramKeys.slice(half);
                    this.logger.warn(`[FAULT-9005] Splitting ${ft.type} task ${ft.id}: ${paramKeys.length} params -> ${split1.length} + ${split2.length}`);
                    for (const chunk of [split1, split2]) {
                      const chunkParams: Record<string, string> = {};
                      for (const k of chunk) chunkParams[k] = paramMap[k];
                      await this.prisma.task.create({
                        data: {
                          deviceId: device.id,
                          type: ft.type, // preserve original type (Provision or SetParameterValues)
                          status: 'PENDING',
                          payload: { parameters: chunkParams },
                          maxAttempts: ft.maxAttempts || 3,
                          tenantId: device.tenantId,
                        },
                      });
                    }
                  } else if (paramKeys.length === 1) {
                    await this.markPathUnsupported(device.modelId, paramKeys[0]);
                    this.logger.warn(`[FAULT-9005] Path "${paramKeys[0]}" marked as unsupported for model ${device.modelId || 'unknown'}`);
                  }
                }
              }
            }
          }
        }
        return this.buildEmptySoapEnvelope();
      }

      this.logger.warn(`Unhandled CWMP method: ${bodyKeys.join(', ')}`);
      return this.buildEmptySoapEnvelope();
    } catch (error) {
      this.logger.error('Error handling CWMP:', error);
      return this.buildFaultResponse('Server', 'Internal server error');
    }
  }

  private async handleInform(data: any, serialFromAuth?: string, clientIp?: string): Promise<string> {
    const inform = data?.['cwmp:Inform'] || data?.Inform;
    if (!inform) return this.buildFaultResponse('Client', 'Invalid Inform message');

    const deviceId = inform.DeviceId || {};
    const serial = serialFromAuth || deviceId?.SerialNumber || '';
    const mac = deviceId?.MACAddress || '';
    const manufacturer = deviceId?.Manufacturer || '';
    const oui = deviceId?.OUI || '';
    const modelName = deviceId?.ProductClass || '';
    const eventCodes = inform.Event?.EventStruct || [];
    const parameters = inform.ParameterList?.ParameterValueStruct || [];
    const events = Array.isArray(eventCodes) ? eventCodes : [eventCodes];
    const eventCodeStr = events.map((e: any) => e?.EventCode || '').join(' ');

    if (!serial) {
      this.logger.warn('Inform received without serial number');
      return this.buildFaultResponse('Client', 'Missing serial number');
    }

    // Debounce BOOT events: ignore BOOT if last BOOT was < 60s ago
    if (eventCodeStr.includes('1 BOOT') || eventCodeStr.includes('BOOT')) {
      const recentBoot = await this.prisma.event.findFirst({
        where: { deviceId: serial, code: { contains: 'BOOT' } },
        orderBy: { createdAt: 'desc' },
      });
      if (recentBoot) {
        const elapsed = Date.now() - new Date(recentBoot.createdAt).getTime();
        if (elapsed < 60000) {
          this.logger.warn(`[BOOT-DEBOUNCE] Ignoring BOOT from ${serial} — last BOOT was ${Math.round(elapsed/1000)}s ago`);
        }
      }
    }

    let device = await this.prisma.device.findUnique({ where: { serial } });

    const paramMap: Record<string, string> = {};
    const paramList = Array.isArray(parameters) ? parameters : [parameters];
    for (const p of paramList) {
      if (p.Name) {
        paramMap[p.Name] = (p.Value && typeof p.Value === 'object' && !('#text' in p.Value)) ? '(hidden)' : (p.Value?.['#text'] ?? p.Value ?? '');
      }
    }

    const cleanClientIp = clientIp ? clientIp.replace(/^.*:/, '') : '';
    const privateIpRegex = /^(0\.0\.0\.0|\[::\]|localhost|127\.0\.0\.1|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\.)/;
    
    const reportedIp = inform.DeviceId?.IPAddress
      || paramMap['Device.IP.Interface.1.IPv4Address']
      || paramMap['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress']
      || paramMap['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress']
      || '';

    const ipAddress = (reportedIp && !privateIpRegex.test(reportedIp)) ? reportedIp : (cleanClientIp || reportedIp || '');
    const wanIp = cleanClientIp || reportedIp || '';

    const firmwareVersion = paramMap['Device.DeviceInfo.SoftwareVersion']
      || paramMap['InternetGatewayDevice.DeviceInfo.SoftwareVersion']
      || '';
    const hardwareVersion = paramMap['Device.DeviceInfo.HardwareVersion']
      || paramMap['InternetGatewayDevice.DeviceInfo.HardwareVersion']
      || '';
    const uptime = parseInt(
      paramMap['Device.DeviceInfo.UpTime'] || paramMap['InternetGatewayDevice.DeviceInfo.UpTime'] || '0', 10
    );

    let connectionRequestUrl = paramMap['InternetGatewayDevice.ManagementServer.ConnectionRequestURL']
      || paramMap['Device.ManagementServer.ConnectionRequestURL']
      || '';

    // Prefer vWAN1_IP (public IP from CPE) over CGNAT/internal IPs for ConnectionRequestURL
    // CPEs behind CGNAT often report the CGNAT IP in their ConnectionRequestURL, which ACS cannot reach.
    const wan1Ip = paramMap['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress']
      || paramMap['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress']
      || '';
    
    if (wan1Ip && wan1Ip !== ipAddress && !privateIpRegex.test(wan1Ip)) {
      try {
        if (connectionRequestUrl) {
          const urlObj = new URL(connectionRequestUrl);
          // Replace hostname with public WAN IP when it appears to be CGNAT or internal
          if (privateIpRegex.test(urlObj.hostname) && !privateIpRegex.test(wan1Ip)) {
            urlObj.hostname = wan1Ip;
            connectionRequestUrl = urlObj.toString();
          }
        }
      } catch (e) {
        // Fallback string replacement for malformed URLs
        if (connectionRequestUrl) {
          if (connectionRequestUrl.includes('0.0.0.0')) {
            connectionRequestUrl = connectionRequestUrl.replace('0.0.0.0', wan1Ip);
          } else if (connectionRequestUrl.includes('[::]')) {
            connectionRequestUrl = connectionRequestUrl.replace('[::]', wan1Ip);
          }
        }
      }
    } else if (connectionRequestUrl && (cleanClientIp || ipAddress)) {
      const targetIp = cleanClientIp || ipAddress;
      try {
        const urlObj = new URL(connectionRequestUrl);
        if (privateIpRegex.test(urlObj.hostname) && !privateIpRegex.test(targetIp)) {
          urlObj.hostname = targetIp;
          connectionRequestUrl = urlObj.toString();
        }
      } catch (e) {
        if (connectionRequestUrl.includes('0.0.0.0')) {
          connectionRequestUrl = connectionRequestUrl.replace('0.0.0.0', targetIp);
        } else if (connectionRequestUrl.includes('[::]')) {
          connectionRequestUrl = connectionRequestUrl.replace('[::]', targetIp);
        }
      }
    }

    if (device) {
      // Associate model if device doesn't have one yet
      if (!device.modelId && manufacturer && modelName) {
        const model = await this.prisma.deviceModel.findFirst({
          where: { manufacturer, name: modelName },
        });
        if (model) device.modelId = model.id;
      }

      device = await this.prisma.device.update({
        where: { id: device.id },
        data: {
          status: 'ONLINE',
          mac: mac || device.mac,
          ipAddress: ipAddress || device.ipAddress,
          wanIp: wanIp || device.wanIp,
          manufacturer: manufacturer || device.manufacturer,
          modelName: modelName || device.modelName,
          firmwareVersion: firmwareVersion || device.firmwareVersion,
          uptime: uptime || device.uptime,
          modelId: device.modelId,
          lastInform: new Date(),
          lastContact: new Date(),
          parameters: {
            ...(device.parameters as any),
            ...paramMap,
            'Device.ManagementServer.ConnectionRequestURL': connectionRequestUrl
              || (device.parameters as any)?.['Device.ManagementServer.ConnectionRequestURL']
              || '',
            'InternetGatewayDevice.ManagementServer.ConnectionRequestURL': connectionRequestUrl
              || (device.parameters as any)?.['InternetGatewayDevice.ManagementServer.ConnectionRequestURL']
              || '',
          },
          ...(connectionRequestUrl && { connectionRequestUrl }),
        },
      });
    } else {
      let modelId: string | undefined;
      if (manufacturer && modelName) {
        const model = await this.prisma.deviceModel.findFirst({
          where: { manufacturer, name: modelName },
        });
        if (model) {
          modelId = model.id;
        } else {
          const fallback = await this.prisma.deviceModel.findFirst({
            where: { manufacturer },
            orderBy: { createdAt: 'desc' },
          });
          if (fallback) modelId = fallback.id;
        }
      }

      device = await this.prisma.device.create({
          data: {
            serial,
            mac: mac || serial,
            manufacturer,
            modelName: modelName || 'Unknown',
            modelId,
            firmwareVersion,
            hardwareVersion,
            status: 'ONLINE',
            ipAddress,
            wanIp,
            connectionRequestUrl: connectionRequestUrl || undefined,
            lastInform: new Date(),
            lastContact: new Date(),
            parameters: paramMap as any,
            tenantId: await this.resolveTenantId(),
          },
      });
    }

    await this.prisma.session.create({
      data: {
        deviceId: device.id,
        event: eventCodeStr,
        status: 'ACTIVE',
        data: { events, parameters: paramMap } as any,
        tenantId: device.tenantId,
      },
    });

    await this.prisma.event.create({
      data: {
        deviceId: device.id,
        code: eventCodeStr,
        message: `Inform received from ${serial} (${manufacturer} ${modelName})`,
        data: { events, parameters: paramMap } as any,
        tenantId: device.tenantId,
      },
    });

    this.ws.broadcast('device:inform', {
      deviceId: device.id,
      serial,
      manufacturer,
      modelName,
      status: 'ONLINE',
      event: eventCodeStr,
      timestamp: new Date(),
    });

    await this.prisma.log.create({
      data: {
        action: eventCodeStr.includes('BOOT') ? 'BOOT' : 'INFORM',
        entity: 'DEVICE',
        entityId: device.id,
        detail: `Inform from ${serial} (${manufacturer} ${modelName}) - events: ${eventCodeStr}`,
        deviceId: device.id,
        tenantId: device.tenantId,
      },
    });

    // Compute Virtual Parameters from definitions (like GenieACS VirtualParameters.*)
    try {
      await this.devicesService.computeAndStoreVirtualParameters(device.id);
    } catch (err: any) {
      this.logger.warn(`[VP] Failed to compute virtual params for ${serial}: ${err.message}`);
    }

    // Auto-provisioning: apply model defaults + fix ACS URL on first boot
    const isNewDevice = !device?.createdAt || (Date.now() - new Date(device.createdAt).getTime() < 120000);
    const provisionedAt = (device?.parameters as any)?.__provisionedAt__;
    const provisionedElapsed = provisionedAt ? Date.now() - new Date(provisionedAt).getTime() : Infinity;
    const needsProvision = (!provisionedAt || isNewDevice) && provisionedElapsed > 3600000;
    const existingProvTask = await this.prisma.task.count({
      where: { deviceId: device.id, status: { in: ['PENDING', 'IN_PROGRESS'] }, type: 'Provision' },
    });

    // Detect rapid reconnect loop: >8 events in last 5 minutes → skip provisioning
    const recentEvents = await this.prisma.event.count({
      where: {
        deviceId: device.id,
        createdAt: { gte: new Date(Date.now() - 300000) },
      },
    });
    const isRapidReconnect = !isNewDevice && recentEvents > 8;

    // Block auto-provisioning for unapproved models (Homologation gate)
    let homologationBlocked = false;
    if (needsProvision && device.modelId) {
      const model = await this.prisma.deviceModel.findUnique({ where: { id: device.modelId } });
      if (model && (model.homologationStatus === 'PENDING_REVIEW' || model.homologationStatus === 'IN_TESTING')) {
        const hasHomologTag = device.tags?.includes('homolog');
        if (!hasHomologTag) {
          homologationBlocked = true;
          this.logger.warn(`[HOMOLOG] Blocked auto-provision for ${serial} — model "${model.name}" status=${model.homologationStatus}`);
        }
      }
    }

    if (needsProvision && existingProvTask === 0 && !isRapidReconnect && !homologationBlocked) {
      const acsUrl = device.acsPublicUrlOverride
        || process.env.ACS_PUBLIC_URL
        || `http://${ipAddress || 'localhost'}:${process.env.ACS_PORT || '7547'}`;
      const expectedAcsUrl = `${acsUrl}/cwmp`;
      const informInterval = await this.configService.getValue('default', 'cwmp.inform.interval') || '300';
      const periodicInformEnable = await this.configService.getValue('default', 'device.default.periodicInformEnable') || 'true';

      // Build params from model defaults if available
      let modelParams: Record<string, string> = {};
      let deviceDataModel: string | null = null;
      if (device.modelId) {
        const model = await this.prisma.deviceModel.findUnique({ where: { id: device.modelId } });
        if (model) {
          deviceDataModel = model.dataModel;
          if (model?.defaultParameters) {
            modelParams = model.defaultParameters as Record<string, string>;
          }
        }
      }

      // Detect data model from reported parameters if model is not yet associated
      if (!deviceDataModel) {
        const reportedParams = Object.keys(paramMap);
        const hasTR181 = reportedParams.some(k => k.startsWith('Device.'));
        const hasTR098 = reportedParams.some(k => k.startsWith('InternetGatewayDevice.'));
        deviceDataModel = hasTR181 && !hasTR098 ? 'TR-181'
          : hasTR098 && !hasTR181 ? 'TR-098'
          : null;
      }

      // Filter provision params to match the device's data model namespace.
      // CPEs reject SetParameterValues for parameters from the wrong namespace
      // with SOAP Fault 9005 ("Invalid parameter name").
      const isTR181 = deviceDataModel === 'TR-181';
      const isTR098 = deviceDataModel === 'TR-098';

      const provisionParams: Record<string, string> = {
        ...Object.fromEntries(
          Object.entries(modelParams).filter(([key]) => {
            if (isTR181 && key.startsWith('InternetGatewayDevice.')) return false;
            if (isTR098 && key.startsWith('Device.')) return false;
            return true;
          }),
        ),
      };

      if (isTR181 || (!deviceDataModel)) {
        provisionParams['Device.ManagementServer.URL'] = expectedAcsUrl;
        provisionParams['Device.ManagementServer.PeriodicInformInterval'] = informInterval;
        provisionParams['Device.ManagementServer.PeriodicInformEnable'] = periodicInformEnable;
      }
      if (isTR098 || (!deviceDataModel)) {
        provisionParams['InternetGatewayDevice.ManagementServer.URL'] = expectedAcsUrl;
        provisionParams['InternetGatewayDevice.ManagementServer.PeriodicInformInterval'] = informInterval;
        provisionParams['InternetGatewayDevice.ManagementServer.PeriodicInformEnable'] = periodicInformEnable;
      }

      this.logger.log(`[PROVISION] Auto-provisioning device ${serial} (model: ${device.modelName}, dataModel: ${deviceDataModel || 'unknown'}, new: ${isNewDevice})`);

      // When data model is unknown, split params into namespace-specific tasks
      // to avoid Fault 9005 from mixed TR-098 + TR-181 params in one batch.
      const tr098Params = Object.fromEntries(
        Object.entries(provisionParams).filter(([k]) => k.startsWith('InternetGatewayDevice.'))
      );
      const tr181Params = Object.fromEntries(
        Object.entries(provisionParams).filter(([k]) => k.startsWith('Device.'))
      );
      const otherParams = Object.fromEntries(
        Object.entries(provisionParams).filter(([k]) => !k.startsWith('InternetGatewayDevice.') && !k.startsWith('Device.'))
      );

      const tasksToCreate: Record<string, string>[] = [];
      if (deviceDataModel || Object.keys(tr098Params).length === 0 || Object.keys(tr181Params).length === 0) {
        tasksToCreate.push(provisionParams);
      } else {
        // Unknown data model with params from both namespaces: split into separate tasks
        if (Object.keys(tr098Params).length > 0) {
          tasksToCreate.push({ ...otherParams, ...tr098Params });
        }
        if (Object.keys(tr181Params).length > 0) {
          tasksToCreate.push({ ...otherParams, ...tr181Params });
        }
        this.logger.log(`[PROVISION] Split into ${tasksToCreate.length} namespace-specific tasks for ${serial}`);
      }

      for (const params of tasksToCreate) {
        await this.prisma.task.create({
          data: {
            deviceId: device.id,
            type: 'Provision',
            status: 'PENDING',
            payload: { parameters: params },
            tenantId: device.tenantId,
          },
        });
      }

      // Mark as provisioned so we don't re-provision on every periodic inform
      const currentParams = (device.parameters as Record<string, any>) || {};
      await this.prisma.device.update({
        where: { id: device.id },
        data: {
          parameters: { ...currentParams, __provisionedAt__: new Date().toISOString() } as any,
        },
      });
    } else if (isRapidReconnect) {
      this.logger.warn(`[RAPID-RECONNECT] Device ${serial} skipped provisioning — ${recentEvents} events in last 5min`);
      // Create alert on first detection of rapid reconnect loop
      const existingAlert = await this.prisma.alert.findFirst({
        where: {
          deviceId: device.id,
          type: 'ACS_SESSION_LOST',
          resolved: false,
        },
      });
      if (!existingAlert) {
        await this.prisma.alert.create({
          data: {
            deviceId: device.id,
            type: 'ACS_SESSION_LOST',
            severity: 'WARNING',
            title: `Rapid reconnect: ${serial}`,
            message: `Rapid reconnect loop detected: ${recentEvents} events in 5min`,
            tenantId: device.tenantId,
          },
        });
      }
    }

    // Auto-discover parameters on first boot or when discovery is empty.
    // Also trigger on periodic inform if device is more than 2 min old and
    // still has no discovered parameters (handles CPEs that connect via
    // periodic Inform instead of BOOT — e.g. ZTE behind CGNAT).
    const params = (device.parameters as Record<string, any>) || {};
    const discovered = params.__discovered__ || {};
    const hasDiscovery = (discovered._leaves?.length || 0) > 0;
    const deviceAge = device.createdAt ? Date.now() - new Date(device.createdAt).getTime() : Infinity;
    const shouldDiscover = !hasDiscovery && (
      eventCodeStr.includes('BOOT') || deviceAge > 120000
    );
    if (shouldDiscover) {
      const existingDiscTask = await this.prisma.task.count({
        where: { deviceId: device.id, type: 'GetParameterNames', status: { in: ['PENDING', 'IN_PROGRESS'] } },
      });
      if (existingDiscTask === 0) {
        this.logger.log(`[DISCOVERY] Auto-starting parameter discovery for ${serial} (hasParams=${hasDiscovery}, age=${Math.round(deviceAge/1000)}s)`);
        const currentParams = (device.parameters as Record<string, any>) || {};
        await this.prisma.device.update({
          where: { id: device.id },
          data: {
            parameters: { ...currentParams, __discovered__: { _objects: [], _leaves: [], _values: {}, _writable: {} } } as any,
          },
        });
        await this.prisma.task.create({
          data: {
            deviceId: device.id,
            type: 'GetParameterNames',
            status: 'PENDING',
            payload: { parameterPath: '', nextLevel: true },
            tenantId: device.tenantId,
          },
        });
      }
    }

    // Execute matching GenieACS-style presets (which link to provisions)
    try {
      const channel = eventCodeStr.includes('BOOTSTRAP') ? 'bootstrap'
        : eventCodeStr.includes('BOOT') ? 'default'
        : 'inform';
      await this.scriptsService.executePresets(device.tenantId, device.id, channel, device);

      // Also execute standalone provisions (those without presets)
      const provisions = await this.scriptsService.getScriptsForChannel(device.tenantId, channel);
      for (const prov of provisions) {
        if (this.scriptsService.evaluatePrecondition(prov.precondition, device)) {
          this.logger.log(`Executing provision "${prov.name}" for device ${serial} (channel: ${channel})`);
          await this.scriptsService.executeScript(prov.id, device.id, device.tenantId);
        }
      }
    } catch (err: any) {
      this.logger.error(`Error executing presets for device ${serial}: ${err.message}`);
    }

    const pendingCount = await this.prisma.task.count({
      where: { deviceId: device.id, status: 'PENDING' },
    });

    if (pendingCount > 0) {
      this.logger.log(`Device ${serial} has ${pendingCount} pending tasks after Inform`);
    }

    return this.buildInformResponseWithTasks(device);
  }

  private async handleTransferComplete(data: any): Promise<string> {
    const tc = data?.['cwmp:TransferComplete'] || data?.TransferComplete;
    if (!tc) return this.buildEmptySoapEnvelope();

    const commandKey = tc?.CommandKey || tc?.['cwmp:CommandKey'] || '';
    const fault = tc?.Fault || tc?.['cwmp:Fault'] || { FaultCode: '0', FaultString: '' };
    const faultCode = fault?.FaultCode || fault?.['cwmp:FaultCode'] || '0';

    this.logger.log(`[CWMP-EVENT] TransferComplete: commandKey=${commandKey}, faultCode=${faultCode}, faultString=${fault?.FaultString || ''}`);

    if (commandKey) {
      await this.prisma.task.updateMany({
        where: { id: commandKey },
        data: {
          status: faultCode === '0' ? 'COMPLETED' : 'FAILED',
          result: { faultCode: faultCode, faultString: fault?.FaultString } as any,
        },
      });
    }

    // Log TRANSFER COMPLETE event if we have a device context
    if (this.lastSerial) {
      const device = await this.prisma.device.findUnique({ where: { serial: this.lastSerial } });
      if (device) {
        await this.prisma.event.create({
          data: {
            deviceId: device.id,
            code: '7 TRANSFER COMPLETE',
            message: `Transfer ${faultCode === '0' ? 'completed' : 'failed'}: commandKey=${commandKey}, fault=${faultCode} ${fault?.FaultString || ''}`,
            data: { commandKey, faultCode, faultString: fault?.FaultString } as any,
            tenantId: device.tenantId,
          },
        });

        await this.prisma.log.create({
          data: {
            action: 'TRANSFER_COMPLETE',
            entity: 'DEVICE',
            entityId: device.id,
            detail: `Transfer ${faultCode === '0' ? 'completed' : 'failed'} for ${device.serial}: commandKey=${commandKey}`,
            deviceId: device.id,
            tenantId: device.tenantId,
          },
        });
      }
    }

    return this.buildSoapResponse('TransferCompleteResponse', {});
  }

  private async handleAutonomousTransferComplete(data: any): Promise<string> {
    return this.buildSoapResponse('AutonomousTransferCompleteResponse', {});
  }

  private async handleGetParameterValuesResponse(data: any): Promise<string> {
    const response = data?.['cwmp:GetParameterValuesResponse'] || data?.GetParameterValuesResponse;
    const paramList = response?.ParameterList?.['cwmp:ParameterValueStruct']
      || response?.['cwmp:ParameterList']?.['cwmp:ParameterValueStruct']
      || response?.['cwmp:ParameterList']?.ParameterValueStruct
      || response?.ParameterList?.ParameterValueStruct
      || [];
    const params = Array.isArray(paramList) ? paramList : [paramList];

    const paramMap: Record<string, string> = {};
    for (const p of params) {
      const pName = p.Name || p['cwmp:Name'] || '';
      if (pName) {
        const pValue = (p.Value || p['cwmp:Value']);
        paramMap[pName] = (pValue && typeof pValue === 'object' && !('#text' in pValue)) ? '(hidden)' : (pValue?.['#text'] ?? pValue ?? '');
      }
    }

    this.logger.log(`[GPV-RESP] lastSerial=${this.lastSerial} names=${Object.keys(paramMap).join('|') || '(empty/Fault)'} cmdKey=${response?.CommandKey || response?.['cwmp:CommandKey'] || '-'} fault=${data?.['soap:Fault'] ? JSON.stringify(data['soap:Fault']).slice(0,200) : (data?.Fault ? JSON.stringify(data.Fault).slice(0,200) : 'none')}`);

    if (Object.keys(paramMap).length === 0 || !this.lastSerial) return this.buildEmptySoapEnvelope();

    const device = await this.prisma.device.findUnique({
      where: { serial: this.lastSerial },
    });
    if (device) {
      const currentParams = (device.parameters as Record<string, any>) || {};
      const discovered = currentParams.__discovered__ || {};

      // Update main parameters and discovery values
      const updatedParams = { ...currentParams };
      const updatedValues = { ...(discovered._values || {}), ...paramMap };

      // Put actual values in the top-level, keep discovery metadata in __discovered__
      for (const [key, val] of Object.entries(paramMap)) {
        updatedParams[key] = val;
      }

      // Store vendor-specific param values separately for provisioning decisions
      const vendorValues: Record<string, string> = {};
      for (const [key, val] of Object.entries(paramMap)) {
        if (key.includes('.X_')) vendorValues[key] = val;
      }
      const existingVendorValues = (discovered._vendorValues || {}) as Record<string, string>;
      const mergedVendorValues = { ...existingVendorValues, ...vendorValues };

      updatedParams.__discovered__ = { ...discovered, _values: updatedValues, _vendorValues: mergedVendorValues };

      let connectionRequestUrl = paramMap['InternetGatewayDevice.ManagementServer.ConnectionRequestURL']
        || paramMap['Device.ManagementServer.ConnectionRequestURL'];

      if (connectionRequestUrl) {
        const ipAddress = device.ipAddress;
        if (ipAddress) {
          const privateIpRegex = /^(0\.0\.0\.0|\[::\]|localhost|127\.0\.0\.1|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\.)/;
          try {
            const urlObj = new URL(connectionRequestUrl);
            if (privateIpRegex.test(urlObj.hostname) && !privateIpRegex.test(ipAddress)) {
              urlObj.hostname = ipAddress;
              connectionRequestUrl = urlObj.toString();
            }
          } catch (e) {
            if (connectionRequestUrl.includes('0.0.0.0')) {
              connectionRequestUrl = connectionRequestUrl.replace('0.0.0.0', ipAddress);
            } else if (connectionRequestUrl.includes('[::]')) {
              connectionRequestUrl = connectionRequestUrl.replace('[::]', ipAddress);
            }
          }
        }
      }

      await this.prisma.device.update({
        where: { id: device.id },
        data: {
          parameters: updatedParams as any,
          ...(connectionRequestUrl && { connectionRequestUrl }),
        },
      });

      // Check if discovery is complete
      const discoveredLeaves = discovered._leaves || [];
      const fetchedCount = Object.keys(updatedValues).length;

      await this.prisma.task.updateMany({
        where: { deviceId: device.id, type: 'GetParameterValues', status: 'IN_PROGRESS' },
        data: { status: 'COMPLETED', result: paramMap as any },
      });

      // Log discovery progress
      if (discoveredLeaves.length > 0) {
        await this.prisma.log.create({
          data: {
            action: 'DISCOVERY',
            entity: 'DEVICE',
            entityId: device.id,
            detail: `Discovered ${fetchedCount}/${discoveredLeaves.length} parameters for ${device.serial}`,
            deviceId: device.id,
            tenantId: device.tenantId,
          },
        });
      }
    }

    return this.buildEmptySoapEnvelope();
  }

  private async handleSetParameterValuesResponse(data: any): Promise<string> {
    const response = data?.['cwmp:SetParameterValuesResponse'] || data?.SetParameterValuesResponse;
    const paramKey = response?.ParameterKey || response?.['cwmp:ParameterKey'] || '';
    const status = response?.Status ?? response?.['cwmp:Status'] ?? 0;

    if (paramKey) {
      await this.prisma.task.updateMany({
        where: { id: paramKey },
        data: { status: status === 0 ? 'COMPLETED' : 'FAILED' },
      });
    } else {
      // Fallback: if no ParameterKey, try matching by deviceId + type + status
      // to handle CPEs that omit ParameterKey in the response
      const device = this.lastSerial
        ? await this.prisma.device.findUnique({ where: { serial: this.lastSerial } })
        : null;
      if (device) {
        await this.prisma.task.updateMany({
          where: { deviceId: device.id, type: { in: ['SetParameterValues', 'Provision'] }, status: 'IN_PROGRESS' },
          data: { status: status === 0 ? 'COMPLETED' : 'FAILED' },
        });
      }
    }

    return this.buildEmptySoapEnvelope();
  }

  private async handleGetParameterNamesResponse(data: any): Promise<string> {
    const response = data?.['cwmp:GetParameterNamesResponse'] || data?.GetParameterNamesResponse;
    if (!response || !this.lastSerial) return this.buildEmptySoapEnvelope();

    const paramList = response?.ParameterList?.['cwmp:ParameterInfoStruct']
      || response?.['cwmp:ParameterList']?.['cwmp:ParameterInfoStruct']
      || response?.['cwmp:ParameterList']?.ParameterInfoStruct
      || response?.ParameterList?.ParameterInfoStruct
      || [];
    const params = Array.isArray(paramList) ? paramList : [paramList];
    this.logger.log(`[GPN-RESP] lastSerial=${this.lastSerial} names=${params.map((p:any)=>p.Name || p['cwmp:Name'] || '').join('|').slice(0,400)}`);

    const device = await this.prisma.device.findUnique({
      where: { serial: this.lastSerial },
    });
    if (!device) return this.buildEmptySoapEnvelope();

    const currentParams = (device.parameters as Record<string, string>) || {};

    const objectsToExplore: string[] = [];
    const leafParams: string[] = [];

    for (const p of params) {
      const name = p.Name || p['cwmp:Name'] || '';
      const writable = p.Writable === true || p.Writable === 'true' || p['cwmp:Writable'] === true || p['cwmp:Writable'] === 'true';
      if (!name) continue;

      // Parameters ending with '.' are objects (containers)
      if (name.endsWith('.')) {
        objectsToExplore.push(name);
      } else {
        leafParams.push(name);
      }
    }

    // Store discovered structure inside parameters.__discovered__
    const allParams = (device.parameters as Record<string, any>) || {};
    const discovered = allParams.__discovered__ || {};
    discovered._objects = [...new Set([...(discovered._objects || []), ...objectsToExplore])];
    discovered._leaves = [...new Set([...(discovered._leaves || []), ...leafParams])];
    discovered._writable = { ...(discovered._writable || {}), ...Object.fromEntries(params.filter((p: any) => p.Writable).map((p: any) => [p.Name, true])) };

    // Extract vendor-specific (X_ prefixed) leaf params and group by vendor prefix.
    // This enables model-specific provisioning without hardcoded vendor checks.
    // Common vendor prefixes: X_TP_, X_ZTE-COM_, X_CT-COM_, X_HW_, X_SRTC-_, etc.
    const vendorLeaves = leafParams.filter((n) => n.includes('.X_'));
    const vendorGroups: Record<string, string[]> = {};
    for (const v of vendorLeaves) {
      const match = v.match(/\.(X_\w+?)\./);
      const prefix = match ? match[1] : 'X_OTHER';
      if (!vendorGroups[prefix]) vendorGroups[prefix] = [];
      vendorGroups[prefix].push(v);
    }
    const existingVendor = (discovered._vendor || {}) as Record<string, string[]>;
    for (const [prefix, paths] of Object.entries(vendorGroups)) {
      existingVendor[prefix] = [...new Set([...(existingVendor[prefix] || []), ...paths])];
    }
    discovered._vendor = existingVendor;

    // Log vendor namespaces found for debugging
    const vendorPrefixes = Object.keys(vendorGroups);
    if (vendorPrefixes.length > 0) {
      this.logger.log(`[DISCOVERY] Vendor params found for ${device.serial}: ${vendorPrefixes.join(', ')} (${vendorLeaves.length} leaves)`);
    }

    // Fetch values for discovered leaf params
    if (leafParams.length > 0) {
      // Store discovered structure first
      await this.prisma.device.update({
        where: { id: device.id },
        data: { parameters: { ...allParams, __discovered__: discovered } as any },
      });

      // Chunk into small batches to avoid Fault 9814 on strict CPEs (TP-Link etc.)
      const GPV_CHUNK_SIZE = 10;
      for (let i = 0; i < leafParams.length; i += GPV_CHUNK_SIZE) {
        const chunk = leafParams.slice(i, i + GPV_CHUNK_SIZE);
        const existingPending = await this.prisma.task.count({
          where: { deviceId: device.id, type: 'GetParameterValues', status: 'PENDING' },
        });
        if (existingPending >= 50) {
          this.logger.warn(`[DISCOVERY] Too many pending GPV tasks (${existingPending}) for ${device.serial}, skipping chunk`);
          break;
        }
        await this.prisma.task.create({
          data: {
            deviceId: device.id,
            type: 'GetParameterValues',
            status: 'PENDING',
            payload: { names: chunk },
            tenantId: device.tenantId,
          },
        });
      }
    } else {
      // No new leaf params, just update discovered structure
      await this.prisma.device.update({
        where: { id: device.id },
        data: { parameters: { ...allParams, __discovered__: discovered } as any },
      });
    }

    // Queue exploration of child objects
    if (objectsToExplore.length > 0) {
      for (const objPath of objectsToExplore) {
        await this.prisma.task.create({
          data: {
            deviceId: device.id,
            type: 'GetParameterNames',
            status: 'PENDING',
            payload: { parameterPath: objPath, nextLevel: true },
            tenantId: device.tenantId,
          },
        });
      }
    }

    // Mark the current task as completed
    await this.prisma.task.updateMany({
      where: { deviceId: device.id, type: 'GetParameterNames', status: 'IN_PROGRESS' },
      data: { status: 'COMPLETED' },
    });

    return this.buildEmptySoapEnvelope();
  }

  private async handleDownloadResponse(data: any): Promise<string> {
    return this.buildEmptySoapEnvelope();
  }

  private async handleUploadResponse(data: any): Promise<string> {
    return this.buildEmptySoapEnvelope();
  }

  private async handleRebootResponse(data: any): Promise<string> {
    return this.buildEmptySoapEnvelope();
  }

  private async handleFactoryResetResponse(data: any): Promise<string> {
    return this.buildEmptySoapEnvelope();
  }

  async handleGetParameterValues(deviceId: string, paramNames: string[]): Promise<any> {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) throw new Error('Device not found');

    const params = (device.parameters as Record<string, string>) || {};
    const result = paramNames.map((name) => ({
      Name: name,
      Value: params[name] || '',
    }));

    return this.buildSoapResponse('GetParameterValuesResponse', {
      ParameterList: { ParameterValueStruct: result },
    });
  }

  async handleSetParameterValues(
    deviceId: string,
    params: { name: string; value: string }[],
  ): Promise<any> {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) throw new Error('Device not found');

    const currentParams = (device.parameters as Record<string, string>) || {};
    for (const p of params) {
      currentParams[p.name] = p.value;
    }
    await this.prisma.device.update({
      where: { id: deviceId },
      data: { parameters: currentParams as any },
    });

    return this.buildSoapResponse('SetParameterValuesResponse', { Status: 0 });
  }

  async handleReboot(deviceId: string): Promise<any> {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) throw new Error('Device not found');

    await this.prisma.task.create({
      data: {
        deviceId,
        type: 'Reboot',
        status: 'PENDING',
        payload: { command: 'Reboot' } as any,
        tenantId: device.tenantId,
      },
    });

    this.ws.broadcast('device:command', { deviceId, command: 'Reboot', timestamp: new Date() });

    return this.buildSoapResponse('RebootResponse', {});
  }

  async handleFactoryReset(deviceId: string): Promise<any> {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) throw new Error('Device not found');

    await this.prisma.task.create({
      data: {
        deviceId,
        type: 'FactoryReset',
        status: 'PENDING',
        payload: { command: 'FactoryReset' } as any,
        tenantId: device.tenantId,
      },
    });

    return this.buildSoapResponse('FactoryResetResponse', {});
  }

  async handleDownload(deviceId: string, url: string, fileType = '1 Firmware Upgrade Image'): Promise<any> {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) throw new Error('Device not found');

    const task = await this.prisma.task.create({
      data: {
        deviceId,
        type: 'Download',
        status: 'PENDING',
        payload: { url, fileType } as any,
        tenantId: device.tenantId,
      },
    });

    return this.buildSoapResponse('DownloadResponse', {
      Status: 0,
      StartTime: new Date().toISOString(),
      CompleteTime: new Date(Date.now() + 600000).toISOString(),
      CommandKey: task.id,
    });
  }

  async handleFirmwareUpdate(deviceId: string): Promise<any> {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      include: { firmware: true, model: { include: { firmwares: { where: { status: 'LATEST' }, take: 1 } } } },
    });
    if (!device) throw new Error('Device not found');

    if (device.firmware && device.firmware.status === 'LATEST') {
      return { message: 'Device already has latest firmware', firmware: device.firmware.version };
    }

    let latestFirmware = device.model?.firmwares?.[0] || device.firmware;

    const params = (device.parameters as Record<string, string>) || {};
    const oui = device.manufacturer
      || params['DeviceID.OUI']
      || '';
    const productClass = device.modelName
      || params['DeviceID.ProductClass']
      || '';

    // If no firmware found via modelId, try matching by OUI and ProductClass
    if (!latestFirmware && oui && productClass) {
      const modelByOuiPc = await this.prisma.deviceModel.findFirst({
        where: { manufacturer: { contains: oui }, name: productClass, tenantId: device.tenantId },
        include: { firmwares: { where: { status: 'LATEST' }, take: 1 } },
      });
      if (modelByOuiPc?.firmwares?.[0]) {
        latestFirmware = modelByOuiPc.firmwares[0];
        if (!device.modelId) {
          await this.prisma.device.update({
            where: { id: deviceId },
            data: { modelId: modelByOuiPc.id },
          });
        }
      }
    }

    if (!latestFirmware) {
      throw new Error(`No firmware available for device ${device.serial} (OUI=${oui || '?'}, ProductClass=${productClass || '?'})`);
    }

    const downloadUrl = latestFirmware.filePath || `http://acs.local:7567/${latestFirmware.fileName}`;
    return this.handleDownload(deviceId, downloadUrl, '1 Firmware Upgrade Image');
  }

  async handleSetWiFiConfig(
    deviceId: string,
    params: { ssid: string; password: string; instance?: number },
  ): Promise<any> {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) throw new Error('Device not found');

    // Cap the instance at the TR-098 maximum of 8 (GenieACS scans the same
    // range; the CPE omits instances it does not implement). Instance 5 is a
    // valid 5GHz radio on many ZTE CPEs, so we must NOT clamp it to the
    // DeviceSummary "WiFi:N" value.
    const instance = Math.min(Math.max(parseInt(String(params.instance ?? 1), 10) || 1, 1), 8);

    const currentParams = (device.parameters as Record<string, string>) || {};
    const hasWLAN = Object.keys(currentParams).some((k) =>
      k.startsWith('InternetGatewayDevice.LANDevice.1.WLANConfiguration.'),
    );
    const hasTR181 = Object.keys(currentParams).some((k) => k.startsWith('Device.WiFi.'));
    const hasZTE = Object.keys(currentParams).some((k) =>
      k.startsWith('InternetGatewayDevice.LANDevice.1.WIFI.'),
    );
    const isTPLink = (device.manufacturer || '').toLowerCase().includes('tp-link')
      || Object.keys(currentParams).some((k) => k.includes('X_TP_'));
    // Default to the TR-098 WLANConfiguration.* namespace (the spec standard
    // that this ZTE fleet implements). Only use WIFI.* / Device.WiFi.* when the
    // cache already confirms the CPE exposes those namespaces, otherwise the
    // CPE rejects SetParameterValues with SOAP Fault 9005.
    // Determine namespace per-instance, not just per-device.
    // ZTE F670L exposes WLANConfiguration.5 for 5GHz but may not expose WIFI.SSID.5.
    const checkInstance = (prefix: string) =>
      Object.keys(currentParams).some((k) =>
        k.startsWith(prefix.replace('{i}', String(instance))),
      );
    const instHasWLAN = checkInstance('InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.');
    const instHasZTE = checkInstance('InternetGatewayDevice.LANDevice.1.WIFI.SSID.{i}.');
    const instHasTR181 = checkInstance('Device.WiFi.SSID.{i}.');

    let wifiParams: { name: string; value: string }[];
    if (instHasZTE) {
      wifiParams = [
        { name: `InternetGatewayDevice.LANDevice.1.WIFI.SSID.${instance}.SSID`, value: params.ssid },
        { name: `InternetGatewayDevice.LANDevice.1.WIFI.SSID.${instance}.Enable`, value: '1' },
        { name: `InternetGatewayDevice.LANDevice.1.WIFI.AccessPoint.${instance}.Security.KeyPassphrase`, value: params.password },
        { name: `InternetGatewayDevice.LANDevice.1.WIFI.AccessPoint.${instance}.SSID`, value: params.ssid },
        { name: `InternetGatewayDevice.LANDevice.1.WIFI.AccessPoint.${instance}.Enable`, value: '1' },
      ];
    } else if (instHasTR181) {
      wifiParams = [
        { name: `Device.WiFi.SSID.${instance}.SSID`, value: params.ssid },
        { name: `Device.WiFi.SSID.${instance}.Enable`, value: '1' },
        { name: `Device.WiFi.AccessPoint.${instance}.Security.KeyPassphrase`, value: params.password },
        // TP-Link CPEs (XX530v etc.) reject KeyPassphrase on some firmware
        // versions — set X_TP_PreSharedKey as the vendor-specific equivalent.
        ...(isTPLink ? [{ name: `Device.WiFi.AccessPoint.${instance}.Security.X_TP_PreSharedKey`, value: params.password }] : []),
        { name: `Device.WiFi.AccessPoint.${instance}.SSID`, value: params.ssid },
        { name: `Device.WiFi.AccessPoint.${instance}.Enable`, value: '1' },
      ];
    } else if (instHasWLAN) {
      wifiParams = [
        { name: `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${instance}.SSID`, value: params.ssid },
        { name: `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${instance}.KeyPassphrase`, value: params.password },
        { name: `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${instance}.Enable`, value: '1' },
      ];
    } else {
      // Fallback to per-device detection
      const useZTE = hasZTE;
      const useTR181 = hasTR181 && !hasZTE && !hasWLAN;
      if (useZTE) {
        wifiParams = [
          { name: `InternetGatewayDevice.LANDevice.1.WIFI.SSID.${instance}.SSID`, value: params.ssid },
          { name: `InternetGatewayDevice.LANDevice.1.WIFI.SSID.${instance}.Enable`, value: '1' },
          { name: `InternetGatewayDevice.LANDevice.1.WIFI.AccessPoint.${instance}.Security.KeyPassphrase`, value: params.password },
          { name: `InternetGatewayDevice.LANDevice.1.WIFI.AccessPoint.${instance}.SSID`, value: params.ssid },
          { name: `InternetGatewayDevice.LANDevice.1.WIFI.AccessPoint.${instance}.Enable`, value: '1' },
        ];
      } else if (useTR181) {
        wifiParams = [
          { name: `Device.WiFi.SSID.${instance}.SSID`, value: params.ssid },
          { name: `Device.WiFi.AccessPoint.${instance}.Security.KeyPassphrase`, value: params.password },
          ...(isTPLink ? [{ name: `Device.WiFi.AccessPoint.${instance}.Security.X_TP_PreSharedKey`, value: params.password }] : []),
        ];
      } else {
        wifiParams = [
          { name: `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${instance}.SSID`, value: params.ssid },
          { name: `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${instance}.KeyPassphrase`, value: params.password },
        ];
      }
    }

    const task = await this.prisma.task.create({
      data: {
        deviceId,
        type: 'SetParameterValues',
        status: 'PENDING',
        payload: { params: wifiParams },
        tenantId: device.tenantId,
        createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000), // priority: jump queue
      },
    });

    for (const p of wifiParams) {
      currentParams[p.name] = p.value;
    }
    await this.prisma.device.update({
      where: { id: deviceId },
      data: { parameters: currentParams as any },
    });

    this.ws.broadcast('device:command', { deviceId, command: 'SetWiFi', timestamp: new Date() });

    await this.prisma.log.create({
      data: {
        action: 'WIFI_CONFIG',
        entity: 'DEVICE',
        entityId: deviceId,
        detail: `WiFi config queued for ${device.serial}`,
        tenantId: device.tenantId,
      },
    });

    return { task, message: 'WiFi configuration queued. Will be applied on next CPE connection.' };
  }

  async handleSetWiFiEnable(
    deviceId: string,
    params: { enabled: boolean; instance: number },
  ): Promise<any> {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) throw new Error('Device not found');

    const instance = Math.min(Math.max(parseInt(String(params.instance ?? 1), 10) || 1, 1), 8);
    const value = params.enabled ? '1' : '0';

    const currentParams = (device.parameters as Record<string, string>) || {};
    const checkInstance = (prefix: string) =>
      Object.keys(currentParams).some((k) =>
        k.startsWith(prefix.replace('{i}', String(instance))),
      );
    const instHasWLAN = checkInstance('InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.');
    const instHasZTE = checkInstance('InternetGatewayDevice.LANDevice.1.WIFI.SSID.{i}.');
    const instHasTR181 = checkInstance('Device.WiFi.SSID.{i}.');
    const isTPLink = (device.manufacturer || '').toLowerCase().includes('tp-link')
      || Object.keys(currentParams).some((k) => k.includes('X_TP_'));

    let wifiParams: { name: string; value: string }[];
    if (instHasZTE) {
      wifiParams = [
        { name: `InternetGatewayDevice.LANDevice.1.WIFI.SSID.${instance}.Enable`, value },
        { name: `InternetGatewayDevice.LANDevice.1.WIFI.AccessPoint.${instance}.Enable`, value },
      ];
    } else if (instHasTR181) {
      wifiParams = [
        { name: `Device.WiFi.SSID.${instance}.Enable`, value },
        { name: `Device.WiFi.AccessPoint.${instance}.Enable`, value },
      ];
    } else if (instHasWLAN) {
      wifiParams = [
        { name: `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${instance}.Enable`, value },
      ];
    } else {
      wifiParams = [
        { name: `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${instance}.Enable`, value },
      ];
    }

    const task = await this.prisma.task.create({
      data: {
        deviceId,
        type: 'SetParameterValues',
        status: 'PENDING',
        payload: { params: wifiParams },
        tenantId: device.tenantId,
        createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      },
    });

    for (const p of wifiParams) {
      currentParams[p.name] = p.value;
    }
    await this.prisma.device.update({
      where: { id: deviceId },
      data: { parameters: currentParams as any },
    });

    this.ws.broadcast('device:command', { deviceId, command: 'SetWiFi', timestamp: new Date() });

    await this.prisma.log.create({
      data: {
        action: 'WIFI_ENABLE',
        entity: 'DEVICE',
        entityId: deviceId,
        detail: `WiFi ${params.enabled ? 'enabled' : 'disabled'} for ${device.serial}`,
        tenantId: device.tenantId,
      },
    });

    return { task, message: `WiFi ${params.enabled ? 'enabled' : 'disabled'} queued.` };
  }

  async handleReadWiFiConfig(deviceId: string): Promise<any> {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) throw new Error('Device not found');

    // Carrega DeviceModel para filtrar paths que já falharam (Fault 9005 persistente)
    const model = device.modelId
      ? await this.prisma.deviceModel.findUnique({ where: { id: device.modelId } })
      : null;
    const unsupported = new Set((model?.unsupportedParameters as string[]) || []);
    const filterUnsupported = (paths: string[]) => paths.filter((p) => !unsupported.has(p));

    // Rate limit: max 20 pending tasks per device to avoid queue overload
    const pendingTaskCount = await this.prisma.task.count({
      where: { deviceId, status: { in: ['PENDING', 'IN_PROGRESS'] } },
    });
    if (pendingTaskCount >= 20) {
      this.logger.warn(`[WIFI] Rate limit hit for ${device.serial} — ${pendingTaskCount} tasks already pending`);
      return {
        tasks: [],
        instances: 0,
        message: `Device already has ${pendingTaskCount} pending tasks. Try again later.`,
        source: 'rate_limited',
      };
    }

    const params = (device.parameters as Record<string, string>) || {};

    // Determine which WiFi instances this CPE actually exposes.
    // Check discovered leaves AND cached params for a complete picture.
    const discovered = (params.__discovered__ as any) || {};
    const leaves: string[] = discovered._leaves || [];
    const discoveredInstances = new Set<number>();
    const instanceRe = /WLANConfiguration\.(\d+)\.|\.WIFI\.SSID\.(\d+)\.|\.WiFi\.SSID\.(\d+)\./;
    for (const leaf of leaves) {
      const m = leaf.match(instanceRe);
      if (m) {
        const inst = parseInt(m[1] || m[2] || m[3], 10);
        if (inst > 0) discoveredInstances.add(inst);
      }
    }
    // Also check cached params for instances that aren't in discovery yet
    const cachedInstanceRe = /WLANConfiguration\.(\d+)\.|\.WIFI\.SSID\.(\d+)\.|\.WiFi\.SSID\.(\d+)\./;
    for (const key of Object.keys(params)) {
      const m = key.match(cachedInstanceRe);
      if (m) {
        const inst = parseInt(m[1] || m[2] || m[3], 10);
        if (inst > 0) discoveredInstances.add(inst);
      }
    }
    let instances: number[];
    if (discoveredInstances.size > 0) {
      instances = Array.from(discoveredInstances).sort((a, b) => a - b);
    } else {
      instances = Array.from({ length: 8 }, (_, i) => i + 1);
    }

    // Detect namespace from both cached params AND discovered leaves.
    // This prevents wrong namespace detection when discovery is incomplete.
    // TP-Link CPEs expose both TR-098 (WLANConfiguration) and TR-181
    // (Device.WiFi.) namespaces but the actual WiFi is under TR-181.
    // Priority: TR-181 > TR-098 > ZTE-specific.
    // Namespaces are MUTUALLY EXCLUSIVE — never query both in the same session.
    const allKnownKeys = [
      ...Object.keys(params),
      ...(leaves || []),
      ...Object.keys(discovered._values || {}),
    ];
    const hasWLAN = allKnownKeys.some((k) =>
      k.startsWith('InternetGatewayDevice.LANDevice.1.WLANConfiguration.'),
    );
    const hasTR181 = allKnownKeys.some((k) => k.startsWith('Device.WiFi.'));
    const hasZTE = allKnownKeys.some((k) =>
      k.startsWith('InternetGatewayDevice.LANDevice.1.WIFI.'),
    );

    // Detect TP-Link by manufacturer or X_TP_ vendor params
    const isTPLink = (device.manufacturer || '').toLowerCase().includes('tp-link')
      || allKnownKeys.some((k) => k.includes('X_TP_'));

    // When both TR-181 and TR-098 are detected, count SSID instances to
    // determine which namespace actually exposes the WiFi interfaces.
    // TP-Link has 16 SSID instances under TR-181 vs ~2 under TR-098.
    const tr181SSIDCount = leaves.filter((l) =>
      l.startsWith('Device.WiFi.SSID.') && l.endsWith('.SSID')
    ).length;
    const tr098SSIDCount = leaves.filter((l) =>
      l.startsWith('InternetGatewayDevice.LANDevice.1.WLANConfiguration.') && l.endsWith('.SSID')
    ).length;
    const prefersTR181 = isTPLink
      || (hasTR181 && tr181SSIDCount > tr098SSIDCount)
      || (hasTR181 && !hasWLAN);

    // When no WiFi namespace is detected from discovery/cache, fall back to
    // TR-181 Device.WiFi.* paths as the most common standard. This covers
    // CPEs like TP-Link that don't expose WiFi in GetParameterNames but may
    // still respond to GetParameterValues for standard data model paths.
    const noneDetected = !hasWLAN && !hasZTE && !hasTR181 && instances.length > 0;
    const useTR181 = prefersTR181 || noneDetected;
    const useWLAN = hasWLAN && !useTR181;
    const useZTE = !useWLAN && !useTR181 && hasZTE;

    // Build the essential paths per instance (standard CWMP params that all
    // TR-098 CPEs support). These are safe to query and rarely fault.
    const essentialPathsByInstance: Record<number, string[]> = {};
    // Vendor-specific paths (X_ZTE-COM_*) that may fault on some firmware.
    const vendorPathsByInstance: Record<number, string[]> = {};
    // Associated device entries (MAC, IP, name).
    const hostPathsByInstance: Record<number, string[]> = {};

    const isZTE = (device.manufacturer || '').toLowerCase().includes('zte')
      || allKnownKeys.some((k) => k.includes('X_ZTE-COM_'));

    for (const i of instances) {
      essentialPathsByInstance[i] = [];
      vendorPathsByInstance[i] = [];
      hostPathsByInstance[i] = [];

      if (useZTE) {
        essentialPathsByInstance[i].push(
          `InternetGatewayDevice.LANDevice.1.WIFI.SSID.${i}.SSID`,
          `InternetGatewayDevice.LANDevice.1.WIFI.SSID.${i}.Enable`,
          `InternetGatewayDevice.LANDevice.1.WIFI.SSID.${i}.Status`,
          `InternetGatewayDevice.LANDevice.1.WIFI.AccessPoint.${i}.SSID`,
          `InternetGatewayDevice.LANDevice.1.WIFI.AccessPoint.${i}.Enable`,
          `InternetGatewayDevice.LANDevice.1.WIFI.AccessPoint.${i}.Security.KeyPassphrase`,
        );
        vendorPathsByInstance[i].push(
          `InternetGatewayDevice.LANDevice.1.WIFI.SSID.${i}.X_ZTE-COM_OperatingFrequencyBand`,
        );
      }
      if (useWLAN) {
        essentialPathsByInstance[i].push(
          `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.SSID`,
          `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.KeyPassphrase`,
          `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.Enable`,
          `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.Channel`,
          `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.Status`,
          `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.Standard`,
          `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.TotalAssociations`,
        );
        // Vendor-specific paths ONLY for ZTE — outros fabricantes retornam Fault 9005
        if (isZTE) {
          vendorPathsByInstance[i].push(
            `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.X_ZTE-COM_OperatingFrequencyBand`,
            `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.X_ZTE-COM_WLAN_SupportedFrequencyBands`,
          );
        }
        // Limita o número de hosts ao TotalAssociations conhecido (se disponível)
        // em vez de sempre pedir 16 — reduz dramaticamente Faults 9005
        const knownTotal = parseInt(
          params[`InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.TotalAssociations`] || '',
          10,
        );
        const maxHosts = Number.isFinite(knownTotal) && knownTotal > 0 ? knownTotal : 4;
        for (let c = 1; c <= maxHosts; c++) {
          hostPathsByInstance[i].push(
            `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.AssociatedDevice.${c}.AssociatedDeviceMACAddress`,
            `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.AssociatedDevice.${c}.AssociatedDeviceIPAddress`,
            ...(isZTE ? [`InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.AssociatedDevice.${c}.X_ZTE-COM_AssociatedDeviceName`] : []),
          );
        }
      }
      if (useTR181 && i <= 4) {
        essentialPathsByInstance[i].push(
          `Device.WiFi.SSID.${i}.SSID`,
          `Device.WiFi.SSID.${i}.Enable`,
          `Device.WiFi.AccessPoint.${i}.Security.KeyPassphrase`,
          `Device.WiFi.AccessPoint.${i}.AssociatedDeviceNumberOfEntries`,
        );
        // TP-Link vendor-specific WiFi password path
        if (isTPLink) {
          vendorPathsByInstance[i].push(
            `Device.WiFi.AccessPoint.${i}.Security.X_TP_PreSharedKey`,
          );
        }
      } else if (useTR181 && i > 4) {
        // Skip additional instances to avoid oversized GetParameterValues.
        // TP-Link XX530v exposes 16 SSIDs but we only need the main ones.
        this.logger.debug(`[WIFI] Skipping TR-181 instance ${i} — only reading 1-4`);
      }
    }

    // For TR-181 with many instances, limit to the first 4 to avoid oversized requests
    if (useTR181 && instances.length > 4) {
      this.logger.log(`[WIFI] Limiting TR-181 instances from ${instances.length} to 4 for device ${device.serial}`);
    }

    // Check cache completeness using only essential paths (SSID, KeyPassphrase,
    // Enable, Channel, Status). Vendor-specific paths are not required.
    const knownInstances = new Set<number>();
    for (const i of instances) {
      const ssid = params[`InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.SSID`]
        || params[`Device.WiFi.SSID.${i}.SSID`]
        || params[`InternetGatewayDevice.LANDevice.1.WIFI.SSID.${i}.SSID`]
        || params[`InternetGatewayDevice.LANDevice.1.WIFI.AccessPoint.${i}.SSID`];
      if (ssid !== undefined) knownInstances.add(i);
    }

    const existingParams: Record<string, string> = {};
    const allPaths = [
      ...Object.values(essentialPathsByInstance).flat(),
      ...Object.values(vendorPathsByInstance).flat(),
      ...Object.values(hostPathsByInstance).flat(),
    ];
    for (const path of allPaths) {
      const v = params[path];
      if (v === undefined || v === '') continue;
      existingParams[path] = v;
    }

    let cacheComplete = knownInstances.size > 0;
    if (cacheComplete) {
      for (const idx of knownInstances) {
        const ssid = existingParams[`InternetGatewayDevice.LANDevice.1.WLANConfiguration.${idx}.SSID`]
          || existingParams[`Device.WiFi.SSID.${idx}.SSID`]
          || existingParams[`InternetGatewayDevice.LANDevice.1.WIFI.SSID.${idx}.SSID`]
          || existingParams[`InternetGatewayDevice.LANDevice.1.WIFI.AccessPoint.${idx}.SSID`];
        const ch = existingParams[`InternetGatewayDevice.LANDevice.1.WLANConfiguration.${idx}.Channel`]
          || existingParams[`InternetGatewayDevice.LANDevice.1.WIFI.SSID.${idx}.Channel`];
        const en = existingParams[`InternetGatewayDevice.LANDevice.1.WLANConfiguration.${idx}.Enable`]
          || existingParams[`Device.WiFi.SSID.${idx}.Enable`]
          || existingParams[`InternetGatewayDevice.LANDevice.1.WIFI.SSID.${idx}.Enable`];
        const assoc = existingParams[`InternetGatewayDevice.LANDevice.1.WLANConfiguration.${idx}.TotalAssociations`];
        const missing = !ssid || ch === undefined || en === undefined
          || (en === '1' && assoc === undefined);
        if (missing) {
          cacheComplete = false;
          break;
        }
      }
    }

    if (cacheComplete) {
      return { params: existingParams, source: 'cache' };
    }

    // Queue tasks per-instance to avoid one faulty instance killing the whole
    // request. Essential params first, then vendor-specific, then hosts.
    // Max 25 param names per task to avoid oversized XML (prevents Fault 9814).
    const MAX_PARAMS_PER_TASK = 25;
    const createdTasks: any[] = [];
    let taskCount = 0;

    const chunkArray = <T>(arr: T[], size: number): T[][] => {
      const result: T[][] = [];
      for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
      return result;
    };

    for (const instance of instances) {
      // Filtra paths que já são conhecidos como unsupported para este modelo
      const essential = filterUnsupported(essentialPathsByInstance[instance] || []);
      const vendor = filterUnsupported(vendorPathsByInstance[instance] || []);
      const hosts = filterUnsupported(hostPathsByInstance[instance] || []);

      // Only skip instance if ALL essential params are already cached
      const hasAllEssential = essential.every((p) => params[p] !== undefined && params[p] !== '');

      if (essential.length > 0 && !hasAllEssential && taskCount < 10) {
        for (const chunk of chunkArray(essential, MAX_PARAMS_PER_TASK)) {
          const task = await this.prisma.task.create({
            data: {
              deviceId,
              type: 'GetParameterValues',
              status: 'PENDING',
              payload: { names: chunk },
              tenantId: device.tenantId,
            },
          });
          createdTasks.push(task);
          taskCount++;
        }
      }

      // Vendor-specific paths in separate tasks (these are the most likely
      // to cause SOAP Faults on CPEs with limited firmware support).
      if (vendor.length > 0 && taskCount < 15) {
        const vendorParamsAlreadyCached = vendor.every((p) => params[p] !== undefined && params[p] !== '');
        if (!vendorParamsAlreadyCached) {
          for (const chunk of chunkArray(vendor, MAX_PARAMS_PER_TASK)) {
            const task = await this.prisma.task.create({
              data: {
                deviceId,
                type: 'GetParameterValues',
                status: 'PENDING',
                payload: { names: chunk },
                tenantId: device.tenantId,
              },
            });
            createdTasks.push(task);
            taskCount++;
          }
        }
      }

      // Associated hosts in separate tasks
      if (hosts.length > 0 && taskCount < 20) {
        for (const chunk of chunkArray(hosts, MAX_PARAMS_PER_TASK)) {
          const hostTask = await this.prisma.task.create({
            data: {
              deviceId,
              type: 'GetParameterValues',
              status: 'PENDING',
              payload: { names: chunk },
              tenantId: device.tenantId,
            },
          });
          createdTasks.push(hostTask);
          taskCount++;
        }
      }
    }

    // If no tasks were queued and no WiFi namespace was detected, try to
    // discover the Device.WiFi.* subtree via targeted GetParameterNames.
    // Some CPEs (notably TP-Link) don't expose WiFi in the initial broad
    // discovery but respond to a focused scan.
    if (taskCount === 0 && !hasWLAN && !hasZTE && !hasTR181) {
      const discTask = await this.prisma.task.create({
        data: {
          deviceId,
          type: 'GetParameterNames',
          status: 'PENDING',
          payload: { parameterPath: 'Device.WiFi.', nextLevel: true },
          tenantId: device.tenantId,
        },
      });
      createdTasks.push(discTask);
      taskCount++;
      this.logger.log(`[WIFI_READ] Queued targeted discovery Device.WiFi. for ${device.serial}`);
    }

    await this.prisma.log.create({
      data: {
        action: 'WIFI_READ',
        entity: 'DEVICE',
        entityId: deviceId,
        detail: `Reading WiFi config from ${device.serial} (${createdTasks.length} tasks queued, ${instances.length} instances)`,
        tenantId: device.tenantId,
      },
    });

    return {
      tasks: createdTasks,
      instances: instances.length,
      message: `Fetching WiFi parameters from CPE... (${createdTasks.length} tasks queued)`,
      source: 'pending',
    };
  }

  async handleGetConnectedDevices(deviceId: string): Promise<any> {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) throw new Error('Device not found');

    const params = (device.parameters as Record<string, any>) || {};

    const str = (v: any): string => {
      if (typeof v === 'string') return v;
      if (v && typeof v === 'object') {
        // CPE XML values often arrive as {@xsi:type: "xsd:string", $: "actual-value"}
        return (v as any).$ || (v as any)._value || (v as any).value || String(v);
      }
      return '';
    };

    const connectedDevices: any[] = [];

    // Detect namespace from cached params to determine where to look
    const hasWLAN = Object.keys(params).some((k) =>
      k.startsWith('InternetGatewayDevice.LANDevice.1.WLANConfiguration.'),
    );
    const hasTR181_AP = Object.keys(params).some((k) =>
      k.startsWith('Device.WiFi.AccessPoint.'),
    );

    // Para cada WLANConfiguration (TR-098) — até 8 instâncias
    for (let wlan = 1; wlan <= 8; wlan++) {
      let devIndex = 1;
      while (true) {
        const basePath = `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${wlan}.AssociatedDevice.${devIndex}`;
        const mac = str(params[`${basePath}.AssociatedDeviceMACAddress`]);
        if (!mac) break;

        connectedDevices.push({
          interface: `WLAN.${wlan}`,
          mac,
          name: str(params[`${basePath}.X_ZTE-COM_AssociatedDeviceName`]),
          ip: str(params[`${basePath}.AssociatedDeviceIPAddress`]),
          rssi: parseInt(str(params[`${basePath}.AssociatedDeviceRssi`])) || 0,
          snr: parseInt(str(params[`${basePath}.X_ZTE-COM_WLAN_SNR`])) || 0,
          noise: parseInt(str(params[`${basePath}.X_ZTE-COM_WLAN_Noise`])) || 0,
          bandwidth: str(params[`${basePath}.AssociatedDeviceBandWidth`]),
          txRate: parseInt(str(params[`${basePath}.X_ZTE-COM_TXRate`])) || 0,
          rxRate: parseInt(str(params[`${basePath}.X_ZTE-COM_RXRate`])) || 0,
          bytesReceived: parseInt(str(params[`${basePath}.X_ZTE-COM_WLAN_BytesReceived`])) || 0,
          bytesSend: parseInt(str(params[`${basePath}.X_ZTE-COM_WLAN_BytesSend`])) || 0,
          stayTime: str(params[`${basePath}.X_ZTE-COM_StayTime`]),
          radio: str(params[`${basePath}.X_ZTE-COM_WLAN_Radio`]),
          clientMode: str(params[`${basePath}.X_ZTE-COM_WLAN_ClientMode`]),
          clientChannelWidth: str(params[`${basePath}.X_ZTE-COM_WLAN_ClientChannelWidth`]),
          signalStrength: parseInt(str(params[`${basePath}.X_ZTE-COM_SignalStrength`])) || 0,
        });
        devIndex++;
      }
    }

    // Para cada AccessPoint (TR-181) — até 16 instâncias (TP-Link XX530v etc.)
    for (let ap = 1; ap <= 16; ap++) {
      let devIndex = 1;
      while (true) {
        const basePath = `Device.WiFi.AccessPoint.${ap}.AssociatedDevice.${devIndex}`;
        const mac = str(params[`${basePath}.AssociatedDeviceMACAddress`]);
        if (!mac) break;

        connectedDevices.push({
          interface: `AP.${ap}`,
          mac,
          name: str(params[`${basePath}.X_TP_HostName`]) || str(params[`${basePath}.X_ZTE-COM_AssociatedDeviceName`]),
          ip: str(params[`${basePath}.AssociatedDeviceIPAddress`]),
          rssi: parseInt(str(params[`${basePath}.AssociatedDeviceRSSI`]) || str(params[`${basePath}.AssociatedDeviceRssi`])) || 0,
          snr: 0,
          noise: 0,
          bandwidth: str(params[`${basePath}.AssociatedDeviceBandwidth`] || params[`${basePath}.AssociatedDeviceBandWidth`]),
          txRate: parseInt(str(params[`${basePath}.X_TP_TXRate`] || params[`${basePath}.X_TP_TxRate`] || params[`${basePath}.X_ZTE-COM_TXRate`])) || 0,
          rxRate: parseInt(str(params[`${basePath}.X_TP_RXRate`] || params[`${basePath}.X_TP_RxRate`] || params[`${basePath}.X_ZTE-COM_RXRate`])) || 0,
          bytesReceived: 0,
          bytesSend: 0,
          stayTime: str(params[`${basePath}.AssociatedDeviceLastDataTransmitTime`] || params[`${basePath}.X_ZTE-COM_StayTime`]),
          radio: str(params[`${basePath}.AssociatedDeviceOperatingFrequencyBand`]),
          clientMode: '',
          clientChannelWidth: '',
          signalStrength: 0,
        });
        devIndex++;
      }
    }

    return connectedDevices;
  }

  async handleDiscover(deviceId: string): Promise<any> {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) throw new Error('Device not found');

    // Reset discovered state within parameters
    const currentParams = (device.parameters as Record<string, any>) || {};
    await this.prisma.device.update({
      where: { id: deviceId },
      data: {
        parameters: { ...currentParams, __discovered__: { _objects: [], _leaves: [], _values: {}, _writable: {} } } as any,
      },
    });

    // Start recursive discovery from root
    const task = await this.prisma.task.create({
      data: {
        deviceId,
        type: 'GetParameterNames',
        status: 'PENDING',
        payload: { parameterPath: '', nextLevel: true },
        tenantId: device.tenantId,
      },
    });

    await this.prisma.log.create({
      data: {
        action: 'DISCOVERY',
        entity: 'DEVICE',
        entityId: deviceId,
        detail: `Full parameter discovery started for ${device.serial}`,
        deviceId,
        tenantId: device.tenantId,
      },
    });

    return { task, message: 'Full parameter discovery queued. Will process on next CPE connection.' };
  }

  async handleFetchAllParams(deviceId: string, paramNames: string[] = ['Device.', 'InternetGatewayDevice.']): Promise<any> {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) throw new Error('Device not found');

    const task = await this.prisma.task.create({
      data: {
        deviceId,
        type: 'GetParameterValues',
        status: 'PENDING',
        payload: { names: paramNames },
        tenantId: device.tenantId,
      },
    });

    await this.prisma.log.create({
      data: {
        action: 'FETCH_PARAMS',
        entity: 'DEVICE',
        entityId: deviceId,
        detail: `Fetching all params (${paramNames.join(', ')}) for ${device.serial}`,
        deviceId,
        tenantId: device.tenantId,
      },
    });

    return { task, message: `Fetching ${paramNames.length} parameter trees from CPE...` };
  }

  async handleGetDiscoveryStatus(deviceId: string): Promise<any> {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) throw new Error('Device not found');

    const allParams = (device.parameters as Record<string, any>) || {};
    const discovered = allParams.__discovered__ || {};
    const objects = discovered._objects || [];
    const leaves = discovered._leaves || [];
    const values = discovered._values || {};
    const writable = discovered._writable || {};

    const fetchedCount = Object.keys(values).length;
    const totalParams = leaves.length;

    const pendingTasks = await this.prisma.task.count({
      where: { deviceId, type: { in: ['GetParameterNames', 'GetParameterValues'] }, status: { in: ['PENDING', 'IN_PROGRESS'] } },
    });

    // Extract WiFi-related parameters from discovered values. Match the
    // exact TR-098/TR-181 paths instead of a substring search — the old
    // "includes('radi')" filter used to pull in RADIUS keys and other
    // unrelated params, polluting the WiFi tab in the UI.
    const IGD_WLAN_PREFIX = 'InternetGatewayDevice.LANDevice.';
    const TR181_WIFI_PREFIX = 'Device.WiFi.';
    const wifiParams = Object.fromEntries(
      Object.entries(values).filter(([key]) => {
        if (key.startsWith(IGD_WLAN_PREFIX) && key.includes('.WLANConfiguration.')) return true;
        if (key.startsWith(TR181_WIFI_PREFIX)) return true;
        return false;
      }),
    );

    return {
      status: pendingTasks > 0 ? 'scanning' : (totalParams > 0 ? 'complete' : 'idle'),
      objects: objects.length,
      leaves: totalParams,
      fetched: fetchedCount,
      pendingTasks,
      progress: totalParams > 0 ? Math.round((fetchedCount / totalParams) * 100) : 0,
      parameters: values,
      writable,
      wifiParams,
    };
  }

  async handleUpload(deviceId: string, fileType: string): Promise<any> {
    return this.buildSoapResponse('UploadResponse', {
      Status: 0,
      StartTime: new Date().toISOString(),
      CompleteTime: new Date(Date.now() + 600000).toISOString(),
    });
  }

  async buildCwmpCommand(task: any, deviceId: string): Promise<string> {
    const wrap = (xml: string) => `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`;
    switch (task.type) {
      case 'Reboot':
        return wrap(this.builder.build(this.buildSoapResponse('Reboot', { 'cwmp:CommandKey': task.id })));
      case 'FactoryReset':
        return wrap(this.builder.build(this.buildSoapResponse('FactoryReset', { 'cwmp:CommandKey': task.id })));
      case 'Download': {
        const payload = task.payload as any;
        return wrap(this.builder.build(
          this.buildSoapResponse('Download', {
            'cwmp:CommandKey': task.id,
            'cwmp:FileType': payload?.fileType || '1 Firmware Upgrade Image',
            'cwmp:URL': payload?.url || '',
            'cwmp:Username': '',
            'cwmp:Password': '',
            'cwmp:FileSize': 0,
            'cwmp:TargetFileName': '',
            'cwmp:DelaySeconds': 0,
            'cwmp:SuccessURL': '',
            'cwmp:FailureURL': '',
          }),
        ));
      }
      case 'GetParameterNames': {
        const payload = task.payload as any;
        const paramPath = payload?.parameterPath || '';
        const nextLevel = payload?.nextLevel ?? true;
        return wrap(this.builder.build(
          this.buildSoapResponse('GetParameterNames', {
            'cwmp:ParameterPath': paramPath,
            'cwmp:NextLevel': nextLevel,
          }),
        ));
      }
      case 'GetParameterValues': {
        const payload = task.payload as any;
        const names = payload?.names || ['Device.DeviceInfo.*'];
        const gpvXml = wrap(this.builder.build(
          this.buildSoapResponse('GetParameterValues', {
            'cwmp:ParameterNames': {
              '@_soap-enc:arrayType': `xsd:string[${names.length}]`,
              string: names,
            },
          }),
        ));
        this.logger.log(`[GPV-SEND] task=${task.id} count=${names.length} first=${names[0]} last=${names[names.length-1]}`);
        return gpvXml;
      }
      case 'SetParameterValues':
      case 'Provision': {
        const payload = task.payload as any;
        let params = payload?.parameters
          ? Object.entries(payload.parameters as Record<string, string>).map(([name, value]) => ({ name, value }))
          : (payload?.params || []);
        if (params.length === 0) return this.buildEmptySoapEnvelope();

        // Detect mixed namespaces and split into separate tasks to avoid Fault 9005
        const hasTR181 = params.some((p: any) => p.name.startsWith('Device.'));
        const hasTR098 = params.some((p: any) => p.name.startsWith('InternetGatewayDevice.'));
        if (hasTR181 && hasTR098) {
          const tr181Batch = params.filter((p: any) => p.name.startsWith('Device.'));
          const tr098Batch = params.filter((p: any) => p.name.startsWith('InternetGatewayDevice.'));
          const otherBatch = params.filter((p: any) => !p.name.startsWith('Device.') && !p.name.startsWith('InternetGatewayDevice.'));

          // Keep only one namespace in this task, queue the rest as new tasks
          const keepBatch = tr181Batch.length >= tr098Batch.length ? tr181Batch : tr098Batch;
          const requeueBatch = tr181Batch.length >= tr098Batch.length ? tr098Batch : tr181Batch;
          params = [...otherBatch, ...keepBatch];

          if (requeueBatch.length > 0) {
            const requeueParams: Record<string, string> = {};
            for (const p of requeueBatch) requeueParams[(p as any).name] = (p as any).value;
            await this.prisma.task.create({
              data: {
                deviceId: task.deviceId,
                type: task.type,
                status: 'PENDING',
                payload: { parameters: requeueParams },
                tenantId: task.tenantId,
                maxAttempts: task.maxAttempts || 3,
              },
            });
            this.logger.log(`[SPV-NAMESPACE] Split ${requeueBatch.length} params into separate task for device ${task.deviceId}`);
          }
        }

        const maxSpvBatch = 10;
        const batch = params.slice(0, maxSpvBatch);
        if (params.length > maxSpvBatch) {
          this.logger.warn(`[SPV] Truncating SetParameterValues from ${params.length} to ${maxSpvBatch} params to avoid Fault 9814`);
        }
        return wrap(this.builder.build(
          this.buildSoapResponse('SetParameterValues', {
            'cwmp:ParameterList': {
              '@_soap-enc:arrayType': `cwmp:ParameterValueStruct[${batch.length}]`,
              'cwmp:ParameterValueStruct': batch.map((p: any) => ({
                'cwmp:Name': p.name,
                'cwmp:Value': { '#text': p.value, '@_xsi:type': 'xsd:string' },
              })),
            },
            'cwmp:ParameterKey': task.id,
          }),
        ));
      }
      default:
        return this.buildEmptySoapEnvelope();
    }
  }

  buildEmptySoapEnvelope(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cwmp="urn:dslforum-org:cwmp-1-0">
  <soap:Header>
    <cwmp:ID soap:mustUnderstand="1">0</cwmp:ID>
  </soap:Header>
  <soap:Body />
</soap:Envelope>`;
  }

  private async getNextPendingTask(deviceId: string): Promise<any | null> {
    // A new Inform means a fresh CWMP session. Any task left IN_PROGRESS from a
    // previous session was never answered (e.g. CPE ignored the command or the
    // session dropped). Reset it to PENDING so it can be retried now.
    await this.prisma.task.updateMany({
      where: { deviceId, status: 'IN_PROGRESS' },
      data: { status: 'PENDING' },
    });

    const task = await this.prisma.task.findFirst({
      where: { deviceId, status: 'PENDING' },
      orderBy: [{ createdAt: 'asc' }],
    });
    if (!task) return null;
    // Mark as IN_PROGRESS so we don't re-send it on the next Inform before the
    // CPE has a chance to reply.
    await this.prisma.task.update({
      where: { id: task.id },
      data: { status: 'IN_PROGRESS' },
    });
    return task;
  }

  private buildInformResponse(device: any, hasPendingTasks: boolean): string {
    const responseObj = this.buildSoapResponse('InformResponse', {
      MaxEnvelopes: hasPendingTasks ? 2 : 1,
    });
    return `<?xml version="1.0" encoding="UTF-8"?>\n${this.builder.build(responseObj)}`;
  }

  /**
   * Builds the next queued command (GetParameterValues / GetParameterNames /
   * SetParameterValues / Reboot / ...) as a standalone SOAP envelope.
   * Used in response to an empty POST from the CPE asking for commands.
   * TR-069: after InformResponse, CPE sends empty POST, ACS replies with command.
   */
  private async buildNextCommandResponse(device: any): Promise<string> {
    const task = await this.getNextPendingTask(device.id);
    if (!task) {
      return this.buildEmptySoapEnvelope();
    }

    // Log command delivery for debugging via API
    await this.prisma.log.create({
      data: {
        action: 'CMD_SEND',
        entity: 'DEVICE',
        entityId: device.id,
        detail: `Sending ${task.type} (task=${task.id}) to ${device.serial}`,
        deviceId: device.id,
        tenantId: device.tenantId,
      },
    });

    const commandXml = await this.buildCwmpCommand(task, device.id);
    const commandBody = commandXml.replace(/^<\?xml[^>]*>\s*/, '');
    return `<?xml version="1.0" encoding="UTF-8"?>\n${commandBody}`;
  }

  /**
   * Builds InformResponse (without attached command) for the initial Inform.
   * MaxEnvelopes=2 signals the CPE that more envelopes will follow in the
   * session. The actual command is delivered on the next empty POST.
   */
  private async buildInformResponseWithTasks(device: any): Promise<string> {
    const pendingCount = await this.prisma.task.count({
      where: { deviceId: device.id, status: 'PENDING' },
    });
    return this.buildInformResponse(device, pendingCount > 0);
  }

  private buildGetRPCMethodsResponse(): string {
    const responseObj = this.buildSoapResponse('GetRPCMethodsResponse', {
      MethodList: {
        string: [
          'GetRPCMethods',
          'SetParameterValues',
          'GetParameterValues',
          'GetParameterNames',
          'SetParameterAttributes',
          'GetParameterAttributes',
          'AddObject',
          'DeleteObject',
          'Reboot',
          'FactoryReset',
          'Download',
          'Upload',
          'ScheduleInform',
          'SetVouchers',
          'GetAllQueuedTransfers',
        ],
      },
    });
    return `<?xml version="1.0" encoding="UTF-8"?>\n${this.builder.build(responseObj)}`;
  }

  private buildFaultResponse(faultCode: string, faultString: string): string {
    const responseObj = this.buildSoapResponse('Fault', {
      FaultCode: faultCode,
      FaultString: faultString,
    });
    return `<?xml version="1.0" encoding="UTF-8"?>\n${this.builder.build(responseObj)}`;
  }

  private buildSoapResponse(action: string, body: any): any {
    return {
      'soap:Envelope': {
        '@_xmlns:soap': 'http://schemas.xmlsoap.org/soap/envelope/',
        '@_xmlns:cwmp': 'urn:dslforum-org:cwmp-1-0',
        '@_xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
        '@_xmlns:xsd': 'http://www.w3.org/2001/XMLSchema',
        '@_xmlns:soap-enc': 'http://schemas.xmlsoap.org/soap/encoding/',
        '@_soap:encodingStyle': 'http://schemas.xmlsoap.org/soap/encoding/',
        'soap:Header': {
          'cwmp:ID': { '@_soap:mustUnderstand': '1', '#text': Date.now().toString() },
        },
        'soap:Body': {
          [`cwmp:${action}`]: body,
        },
      },
    };
  }

  /**
   * Persiste um path como unsupported no DeviceModel para que nunca mais
   * seja consultado para nenhum device daquele modelo.
   * Equivalente funcional ao que o GenieACS faz ao ignorar parâmetros
   * que retornaram Fault 9005.
   */
  private async markPathUnsupported(modelId: string | null, path: string): Promise<void> {
    if (!modelId) return;
    const model = await this.prisma.deviceModel.findUnique({ where: { id: modelId } });
    if (!model) return;
    const current = new Set((model.unsupportedParameters as string[]) || []);
    if (current.has(path)) return;
    current.add(path);
    await this.prisma.deviceModel.update({
      where: { id: modelId },
      data: { unsupportedParameters: Array.from(current) },
    });
    this.logger.warn(`[FAULT-9005] Path "${path}" marcado como unsupported permanentemente no modelo ${model.name}`);
  }
}
