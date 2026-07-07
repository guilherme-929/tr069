import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import { ScriptsService } from '../scripts/scripts.service';
import { ConfigService } from '../system-config/config.service';

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
        this.logger.warn(`CPE returned Fault: ${JSON.stringify(body['SOAP-ENV:Fault'] || body['soap:Fault'] || body['Fault']).slice(0, 200)}`);
        if (this.lastSerial) {
          const device = await this.prisma.device.findUnique({ where: { serial: this.lastSerial } });
          if (device) {
            await this.prisma.task.updateMany({
              where: { deviceId: device.id, status: 'IN_PROGRESS' },
              data: { status: 'FAILED', error: 'CPE returned SOAP Fault' },
            });
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

    let device = await this.prisma.device.findUnique({ where: { serial } });

    const paramMap: Record<string, string> = {};
    const paramList = Array.isArray(parameters) ? parameters : [parameters];
    for (const p of paramList) {
      if (p.Name) {
        paramMap[p.Name] = p.Value?.['#text'] ?? p.Value ?? '';
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

    if (connectionRequestUrl && (cleanClientIp || ipAddress)) {
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
        if (model) modelId = model.id;
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

    const acsUrl = process.env.ACS_PUBLIC_URL || `http://${ipAddress || 'localhost'}:${process.env.ACS_PORT || '7547'}`;
    const expectedAcsUrl = `${acsUrl}/cwmp`;
    const currentAcsUrl = paramMap['Device.ManagementServer.URL']
      || paramMap['InternetGatewayDevice.ManagementServer.URL']
      || paramMap['ManagementServer.URL']
      || '';

    if (currentAcsUrl && currentAcsUrl !== expectedAcsUrl && currentAcsUrl !== '0.0.0.0') {
      const existingActive = await this.prisma.task.count({
        where: { deviceId: device.id, status: { in: ['PENDING', 'IN_PROGRESS'] }, type: 'Provision' },
      });
      if (existingActive === 0) {
        const informInterval = await this.configService.getValue('default', 'cwmp.inform.interval') || '300';
        const periodicInformEnable = await this.configService.getValue('default', 'device.default.periodicInformEnable') || 'true';
        this.logger.log(`Auto-provisioning device ${serial} — ACS URL mismatch: "${currentAcsUrl}" !== "${expectedAcsUrl}"`);
        await this.prisma.task.create({
          data: {
            deviceId: device.id,
            type: 'Provision',
            status: 'PENDING',
            payload: {
              parameters: {
                'Device.ManagementServer.URL': expectedAcsUrl,
                'Device.ManagementServer.PeriodicInformInterval': informInterval,
                'Device.ManagementServer.PeriodicInformEnable': periodicInformEnable,
                'InternetGatewayDevice.ManagementServer.URL': expectedAcsUrl,
                'InternetGatewayDevice.ManagementServer.PeriodicInformInterval': informInterval,
                'InternetGatewayDevice.ManagementServer.PeriodicInformEnable': periodicInformEnable,
              },
            },
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

    const commandKey = tc?.CommandKey || '';
    const fault = tc?.Fault || { FaultCode: '0', FaultString: '' };
    const faultCode = fault?.FaultCode || '0';

    this.logger.log(`TransferComplete: commandKey=${commandKey}, faultCode=${faultCode}`);

    if (commandKey) {
      await this.prisma.task.updateMany({
        where: { id: commandKey },
        data: {
          status: faultCode === '0' ? 'COMPLETED' : 'FAILED',
          result: { faultCode: faultCode, faultString: fault?.FaultString } as any,
        },
      });
    }

    return this.buildSoapResponse('TransferCompleteResponse', {});
  }

  private async handleAutonomousTransferComplete(data: any): Promise<string> {
    return this.buildSoapResponse('AutonomousTransferCompleteResponse', {});
  }

  private async handleGetParameterValuesResponse(data: any): Promise<string> {
    const response = data?.['cwmp:GetParameterValuesResponse'] || data?.GetParameterValuesResponse;
    const paramList = response?.ParameterList?.ParameterValueStruct || [];
    const params = Array.isArray(paramList) ? paramList : [paramList];

    const paramMap: Record<string, string> = {};
    for (const p of params) {
      if (p.Name) {
        paramMap[p.Name] = p.Value?.['#text'] ?? p.Value ?? '';
      }
    }

    this.logger.log(`[GPV-RESP] lastSerial=${this.lastSerial} names=${Object.keys(paramMap).join('|') || '(empty/Fault)'} cmdKey=${response?.CommandKey || '-'} fault=${data?.['soap:Fault'] ? JSON.stringify(data['soap:Fault']).slice(0,200) : (data?.Fault ? JSON.stringify(data.Fault).slice(0,200) : 'none')}`);

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
      updatedParams.__discovered__ = { ...discovered, _values: updatedValues };

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
    const paramKey = response?.ParameterKey || '';
    const status = response?.Status ?? 0;

    if (paramKey) {
      await this.prisma.task.updateMany({
        where: { id: paramKey },
        data: { status: status === 0 ? 'COMPLETED' : 'FAILED' },
      });
    }

    return this.buildEmptySoapEnvelope();
  }

  private async handleGetParameterNamesResponse(data: any): Promise<string> {
    const response = data?.['cwmp:GetParameterNamesResponse'] || data?.GetParameterNamesResponse;
    if (!response || !this.lastSerial) return this.buildEmptySoapEnvelope();

    const paramList = response?.ParameterList?.ParameterInfoStruct || [];
    const params = Array.isArray(paramList) ? paramList : [paramList];
    this.logger.log(`[GPN-RESP] lastSerial=${this.lastSerial} names=${params.map((p:any)=>p.Name).join('|').slice(0,400)}`);

    const device = await this.prisma.device.findUnique({
      where: { serial: this.lastSerial },
    });
    if (!device) return this.buildEmptySoapEnvelope();

    const currentParams = (device.parameters as Record<string, string>) || {};

    const objectsToExplore: string[] = [];
    const leafParams: string[] = [];

    for (const p of params) {
      const name = p.Name || '';
      const writable = p.Writable === true || p.Writable === 'true';
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

    // Fetch values for discovered leaf params
    if (leafParams.length > 0) {
      // Store discovered structure first
      await this.prisma.device.update({
        where: { id: device.id },
        data: { parameters: { ...allParams, __discovered__: discovered } as any },
      });

      // Queue GetParameterValues for these params - use refreshObject approach
      // for large sets, but for now do batched GetParameterValues
      await this.prisma.task.create({
        data: {
          deviceId: device.id,
          type: 'GetParameterValues',
          status: 'PENDING',
          payload: { names: leafParams },
          tenantId: device.tenantId,
        },
      });
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

    const latestFirmware = device.model?.firmwares?.[0] || device.firmware;
    if (!latestFirmware) throw new Error('No firmware available for update');

    const downloadUrl = latestFirmware.filePath || `http://acs.local:7567/${latestFirmware.fileName}`;
    return this.handleDownload(deviceId, downloadUrl, '1 Firmware Upgrade Image');
  }

  async handleSetWiFiConfig(
    deviceId: string,
    params: { ssid: string; password: string; instance?: number },
  ): Promise<any> {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) throw new Error('Device not found');

    const instance = Math.min(Math.max(parseInt(String(params.instance ?? 1), 10) || 1, 1), 8);

    const currentParams = (device.parameters as Record<string, string>) || {};
    const hasWLAN = Object.keys(currentParams).some((k) =>
      k.startsWith('InternetGatewayDevice.LANDevice.1.WLANConfiguration.'),
    );
    const hasTR181 = Object.keys(currentParams).some((k) => k.startsWith('Device.WiFi.'));
    const hasZTE = Object.keys(currentParams).some((k) =>
      k.startsWith('InternetGatewayDevice.LANDevice.1.WIFI.'),
    );
    const useZTE = hasZTE || (!hasWLAN && !hasTR181);

    let wifiParams: { name: string; value: string }[];
    if (useZTE) {
      wifiParams = [
        { name: `InternetGatewayDevice.LANDevice.1.WIFI.SSID.${instance}.SSID`, value: params.ssid },
        { name: `InternetGatewayDevice.LANDevice.1.WIFI.SSID.${instance}.Enable`, value: '1' },
        { name: `InternetGatewayDevice.LANDevice.1.WIFI.AccessPoint.${instance}.Security.KeyPassphrase`, value: params.password },
        { name: `InternetGatewayDevice.LANDevice.1.WIFI.AccessPoint.${instance}.SSID`, value: params.ssid },
        { name: `InternetGatewayDevice.LANDevice.1.WIFI.AccessPoint.${instance}.Enable`, value: '1' },
      ];
    } else if (hasTR181) {
      wifiParams = [
        { name: `Device.WiFi.SSID.${instance}.SSID`, value: params.ssid },
        { name: `Device.WiFi.AccessPoint.${instance}.Security.KeyPassphrase`, value: params.password },
      ];
    } else {
      wifiParams = [
        { name: `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${instance}.SSID`, value: params.ssid },
        { name: `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${instance}.KeyPassphrase`, value: params.password },
      ];
    }

    const task = await this.prisma.task.create({
      data: {
        deviceId,
        type: 'SetParameterValues',
        status: 'PENDING',
        payload: { params: wifiParams },
        tenantId: device.tenantId,
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

  async handleReadWiFiConfig(deviceId: string): Promise<any> {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) throw new Error('Device not found');

    const params = (device.parameters as Record<string, string>) || {};

    // Detect which WiFi namespace this CPE actually exposes. ZTE CPEs (e.g.
    // F670L) report WiFi under InternetGatewayDevice.LANDevice.1.WIFI.* and
    // DO NOT implement WLANConfiguration.* nor Device.WiFi.* (TR-181). When a
    // GetParameterValues request mixes an unsupported path the CPE returns a
    // SOAP Fault for the WHOLE request, so we must not mix namespaces. We
    // probe the cached parameters to decide which namespace to query.
    const hasWLAN = Object.keys(params).some((k) =>
      k.startsWith('InternetGatewayDevice.LANDevice.1.WLANConfiguration.'),
    );
    const hasTR181 = Object.keys(params).some((k) => k.startsWith('Device.WiFi.'));
    const hasZTE = Object.keys(params).some((k) =>
      k.startsWith('InternetGatewayDevice.LANDevice.1.WIFI.'),
    );

    // Default to the ZTE WIFI.* namespace (most common for these devices).
    // Only add WLANConfiguration.* / Device.WiFi.* if the CPE has already
    // reported params under that namespace, to avoid SOAP Faults.
    const useWLAN = hasWLAN && !hasZTE;
    const useTR181 = hasTR181 && !hasZTE;
    const useZTE = hasZTE || (!hasWLAN && !hasTR181);

    const wifiPaths: string[] = [];
    for (let i = 1; i <= 8; i++) {
      if (useZTE) {
        // ZTE (TR-098 variant) — uses InternetGatewayDevice.LANDevice.1.WIFI.*
        // SSID/KeyPassphrase live under WIFI.SSID.{i} and WIFI.AccessPoint.{i}.
        wifiPaths.push(
          `InternetGatewayDevice.LANDevice.1.WIFI.SSID.${i}.SSID`,
          `InternetGatewayDevice.LANDevice.1.WIFI.SSID.${i}.Enable`,
          `InternetGatewayDevice.LANDevice.1.WIFI.SSID.${i}.Status`,
          `InternetGatewayDevice.LANDevice.1.WIFI.SSID.${i}.X_ZTE-COM_OperatingFrequencyBand`,
          `InternetGatewayDevice.LANDevice.1.WIFI.AccessPoint.${i}.SSID`,
          `InternetGatewayDevice.LANDevice.1.WIFI.AccessPoint.${i}.Enable`,
          `InternetGatewayDevice.LANDevice.1.WIFI.AccessPoint.${i}.Security.KeyPassphrase`,
        );
      }
      if (useWLAN) {
        wifiPaths.push(
          `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.SSID`,
          `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.KeyPassphrase`,
          `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.Enable`,
          `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.Channel`,
          `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.Status`,
          `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.Standard`,
          `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.BandWidth`,
          `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.TotalAssociations`,
          `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.X_ZTE-COM_OperatingFrequencyBand`,
          `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.X_ZTE-COM_WLAN_SupportedFrequencyBands`,
        );
      }
      if (useTR181) {
        // TR-181 paths — iterate all instances so 5GHz / guest SSIDs show up.
        wifiPaths.push(
          `Device.WiFi.SSID.${i}.SSID`,
          `Device.WiFi.SSID.${i}.Enable`,
          `Device.WiFi.AccessPoint.${i}.Security.KeyPassphrase`,
        );
      }
    }

    // We consider the cache "complete" only when we already have the most
    // important fields for every instance we know about. If any instance is
    // missing its SSID/KeyPassphrase we must go back to the CPE — returning a
    // partial cache (e.g. only `Enable` or `Channel` populated) used to make
    // the UI render blank WLAN cards.
    const knownInstances = new Set<number>();
    for (let i = 1; i <= 8; i++) {
      const ssid = params[`InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.SSID`]
        || params[`Device.WiFi.SSID.${i}.SSID`]
        || params[`InternetGatewayDevice.LANDevice.1.WIFI.SSID.${i}.SSID`]
        || params[`InternetGatewayDevice.LANDevice.1.WIFI.AccessPoint.${i}.SSID`];
      if (ssid !== undefined) knownInstances.add(i);
    }

    let cacheComplete = knownInstances.size > 0;
    const existingParams: Record<string, string> = {};
    for (const path of wifiPaths) {
      const v = params[path];
      if (v === undefined || v === '') continue;
      existingParams[path] = v;
    }

    if (cacheComplete) {
      for (const idx of knownInstances) {
        const ssid = existingParams[`InternetGatewayDevice.LANDevice.1.WLANConfiguration.${idx}.SSID`]
          || existingParams[`Device.WiFi.SSID.${idx}.SSID`]
          || existingParams[`InternetGatewayDevice.LANDevice.1.WIFI.SSID.${idx}.SSID`]
          || existingParams[`InternetGatewayDevice.LANDevice.1.WIFI.AccessPoint.${idx}.SSID`];
        const pwd = existingParams[`InternetGatewayDevice.LANDevice.1.WLANConfiguration.${idx}.KeyPassphrase`]
          || existingParams[`Device.WiFi.AccessPoint.${idx}.Security.KeyPassphrase`]
          || existingParams[`InternetGatewayDevice.LANDevice.1.WIFI.AccessPoint.${idx}.Security.KeyPassphrase`];
        if (!ssid || !pwd) {
          cacheComplete = false;
          break;
        }
      }
    }

    if (cacheComplete) {
      return { params: existingParams, source: 'cache' };
    }

    const task = await this.prisma.task.create({
      data: {
        deviceId,
        type: 'GetParameterValues',
        status: 'PENDING',
        payload: { names: wifiPaths },
        tenantId: device.tenantId,
      },
    });

    await this.prisma.log.create({
      data: {
        action: 'WIFI_READ',
        entity: 'DEVICE',
        entityId: deviceId,
        detail: `Reading WiFi config from ${device.serial}`,
        tenantId: device.tenantId,
      },
    });

    return { task, message: 'Fetching WiFi parameters from CPE...', source: 'pending' };
  }

  async handleGetConnectedDevices(deviceId: string): Promise<any> {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) throw new Error('Device not found');

    const params = (device.parameters as Record<string, string>) || {};
    const connectedDevices: any[] = [];

    // TR-098 (WLANConfiguration) + ZTE WIFI.AssociatedDevice variants
    const readAssociated = (wlan: number, devIndex: number) => {
      const igd = `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${wlan}.AssociatedDevice.${devIndex}`;
      const zte = `InternetGatewayDevice.LANDevice.1.WIFI.AssociatedDevice.${devIndex}`;
      const mac = params[`${zte}.AssociatedDeviceMACAddress`]
        || params[`${zte}.MACAddress`]
        || params[`${igd}.AssociatedDeviceMACAddress`]
        || params[`${igd}.X_ZTE-COM_MACAddress`];
      if (!mac) return null;
      return {
        wlan,
        mac,
        name: params[`${zte}.X_ZTE-COM_AssociatedDeviceName`]
          || params[`${igd}.X_ZTE-COM_AssociatedDeviceName`] || '',
        ip: params[`${zte}.AssociatedDeviceIPAddress`]
          || params[`${igd}.AssociatedDeviceIPAddress`] || '',
        rssi: parseInt(params[`${zte}.AssociatedDeviceRssi`]
          || params[`${igd}.AssociatedDeviceRssi`] || '0'),
        snr: parseInt(params[`${zte}.X_ZTE-COM_WLAN_SNR`]
          || params[`${igd}.X_ZTE-COM_WLAN_SNR`] || '0'),
        noise: parseInt(params[`${zte}.X_ZTE-COM_WLAN_Noise`]
          || params[`${igd}.X_ZTE-COM_WLAN_Noise`] || '0'),
        bandwidth: params[`${zte}.AssociatedDeviceBandWidth`]
          || params[`${igd}.AssociatedDeviceBandWidth`] || '',
        txRate: parseInt(params[`${zte}.X_ZTE-COM_TXRate`]
          || params[`${zte}.AssociatedDeviceRate`]
          || params[`${igd}.X_ZTE-COM_TXRate`]
          || params[`${igd}.AssociatedDeviceRate`] || '0'),
        rxRate: parseInt(params[`${zte}.X_ZTE-COM_RXRate`]
          || params[`${igd}.X_ZTE-COM_RXRate`] || '0'),
        bytesReceived: parseInt(params[`${zte}.X_ZTE-COM_WLAN_BytesReceived`]
          || params[`${igd}.X_ZTE-COM_WLAN_BytesReceived`] || '0'),
        bytesSent: parseInt(params[`${zte}.X_ZTE-COM_WLAN_BytesSend`]
          || params[`${igd}.X_ZTE-COM_WLAN_BytesSend`] || '0'),
        stayTime: params[`${zte}.X_ZTE-COM_StayTime`]
          || params[`${igd}.X_ZTE-COM_StayTime`] || '0',
        radio: params[`${zte}.X_ZTE-COM_WLAN_Radio`]
          || params[`${igd}.X_ZTE-COM_WLAN_Radio`] || '',
        clientMode: params[`${zte}.X_ZTE-COM_WLAN_ClientMode`]
          || params[`${igd}.X_ZTE-COM_WLAN_ClientMode`] || '',
        clientChannelWidth: params[`${zte}.X_ZTE-COM_WLAN_ClientChannelWidth`]
          || params[`${igd}.X_ZTE-COM_WLAN_ClientChannelWidth`] || '',
        signalStrength: parseInt(params[`${zte}.X_ZTE-COM_SignalStrength`]
          || params[`${zte}.X_ZTE-COM_WLAN_RSSI`]
          || params[`${igd}.X_ZTE-COM_SignalStrength`]
          || params[`${igd}.X_ZTE-COM_WLAN_RSSI`] || '0'),
      };
    };

    for (let wlan = 1; wlan <= 8; wlan++) {
      let devIndex = 1;
      while (true) {
        const cd = readAssociated(wlan, devIndex);
        if (!cd) break;
        connectedDevices.push(cd);
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
        return wrap(this.builder.build(this.buildSoapResponse('Reboot', { CommandKey: task.id })));
      case 'FactoryReset':
        return wrap(this.builder.build(this.buildSoapResponse('FactoryReset', { CommandKey: task.id })));
      case 'Download': {
        const payload = task.payload as any;
        return wrap(this.builder.build(
          this.buildSoapResponse('Download', {
            CommandKey: task.id,
            FileType: payload?.fileType || '1 Firmware Upgrade Image',
            URL: payload?.url || '',
            Username: '',
            Password: '',
            FileSize: 0,
            TargetFileName: '',
            DelaySeconds: 0,
            SuccessURL: '',
            FailureURL: '',
          }),
        ));
      }
      case 'GetParameterNames': {
        const payload = task.payload as any;
        const paramPath = payload?.parameterPath || '';
        const nextLevel = payload?.nextLevel ?? true;
        return wrap(this.builder.build(
          this.buildSoapResponse('GetParameterNames', {
            ParameterPath: paramPath,
            NextLevel: nextLevel,
          }),
        ));
      }
      case 'GetParameterValues': {
        const payload = task.payload as any;
        const names = payload?.names || ['Device.DeviceInfo.*'];
        this.logger.log(`[GPV-SEND] task=${task.id} names=${JSON.stringify(names).slice(0,300)}`);
        return wrap(this.builder.build(
          this.buildSoapResponse('GetParameterValues', {
            ParameterNames: { string: names },
          }),
        ));
      }
      case 'SetParameterValues':
      case 'Provision': {
        const payload = task.payload as any;
        const params = payload?.parameters
          ? Object.entries(payload.parameters as Record<string, string>).map(([name, value]) => ({ name, value }))
          : (payload?.params || []);
        if (params.length === 0) return this.buildEmptySoapEnvelope();
        return wrap(this.builder.build(
          this.buildSoapResponse('SetParameterValues', {
            ParameterList: {
              ParameterValueStruct: params.map((p: any) => ({
                Name: p.name,
                Value: { '#text': p.value, '@_xsi:type': 'xsd:string' },
              })),
            },
            ParameterKey: task.id,
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
}
