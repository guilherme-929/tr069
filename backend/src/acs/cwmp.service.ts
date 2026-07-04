import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';

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
  ) {}

  private async resolveTenantId(): Promise<string> {
    if (this.cachedTenantId) return this.cachedTenantId;
    const tenant = await this.prisma.tenant.findFirst({ where: { slug: 'default-isp' } })
      || await this.prisma.tenant.findFirst();
    if (!tenant) throw new Error('No tenant found in database. Run seed first.');
    this.cachedTenantId = tenant.id;
    return tenant.id;
  }

  async handleCwmp(xmlString: string, serial?: string, getSession?: () => any): Promise<string> {
    if (!xmlString || !xmlString.trim()) {
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
        return await this.handleInform(body, serial);
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

      this.logger.warn(`Unhandled CWMP method: ${bodyKeys.join(', ')}`);
      return this.buildEmptySoapEnvelope();
    } catch (error) {
      this.logger.error('Error handling CWMP:', error);
      return this.buildFaultResponse('Server', 'Internal server error');
    }
  }

  private async handleInform(data: any, serialFromAuth?: string): Promise<string> {
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

    const ipAddress = inform.DeviceId?.IPAddress
      || paramMap['Device.IP.Interface.1.IPv4Address']
      || paramMap['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress']
      || paramMap['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress']
      || '';
    const firmwareVersion = paramMap['Device.DeviceInfo.SoftwareVersion']
      || paramMap['InternetGatewayDevice.DeviceInfo.SoftwareVersion']
      || '';
    const hardwareVersion = paramMap['Device.DeviceInfo.HardwareVersion']
      || paramMap['InternetGatewayDevice.DeviceInfo.HardwareVersion']
      || '';
    const uptime = parseInt(
      paramMap['Device.DeviceInfo.UpTime'] || paramMap['InternetGatewayDevice.DeviceInfo.UpTime'] || '0', 10
    );
    const connectionRequestUrl = paramMap['InternetGatewayDevice.ManagementServer.ConnectionRequestURL']
      || paramMap['Device.ManagementServer.ConnectionRequestURL']
      || '';

    if (device) {
      device = await this.prisma.device.update({
        where: { id: device.id },
        data: {
          status: 'ONLINE',
          mac: mac || device.mac,
          ipAddress: ipAddress || device.ipAddress,
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

    const pendingCount = await this.prisma.task.count({
      where: { deviceId: device.id, status: 'PENDING' },
    });

    if (pendingCount > 0) {
      this.logger.log(`Device ${serial} has ${pendingCount} pending tasks after Inform`);
    }

    return this.buildInformResponse(device, pendingCount > 0);
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

      await this.prisma.device.update({
        where: { id: device.id },
        data: { parameters: updatedParams as any },
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

  async handleSetWiFiConfig(deviceId: string, params: { ssid: string; password: string }): Promise<any> {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) throw new Error('Device not found');

    const wifiParams = [
      { name: 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID', value: params.ssid },
      { name: 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase', value: params.password },
      { name: 'Device.WiFi.SSID.1.SSID', value: params.ssid },
      { name: 'Device.WiFi.AccessPoint.1.Security.KeyPassphrase', value: params.password },
    ];

    const task = await this.prisma.task.create({
      data: {
        deviceId,
        type: 'SetParameterValues',
        status: 'PENDING',
        payload: { params: wifiParams },
        tenantId: device.tenantId,
      },
    });

    const currentParams = (device.parameters as Record<string, string>) || {};
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

    const wifiPaths: string[] = [];
    for (let i = 1; i <= 8; i++) {
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
    wifiPaths.push(
      'Device.WiFi.SSID.1.SSID',
      'Device.WiFi.AccessPoint.1.Security.KeyPassphrase',
    );

    const existingParams = wifiPaths.reduce((acc, path) => {
      if (params[path] !== undefined && params[path] !== '') acc[path] = params[path];
      return acc;
    }, {} as Record<string, string>);

    if (Object.keys(existingParams).length > 0) {
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

    for (let wlan = 1; wlan <= 8; wlan++) {
      let devIndex = 1;
      while (true) {
        const base = `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${wlan}.AssociatedDevice.${devIndex}`;
        const mac = params[`${base}.AssociatedDeviceMACAddress`]
          || params[`${base}.X_ZTE-COM_MACAddress`];
        if (!mac) break;

        connectedDevices.push({
          wlan,
          mac,
          name: params[`${base}.X_ZTE-COM_AssociatedDeviceName`] || '',
          ip: params[`${base}.AssociatedDeviceIPAddress`] || '',
          rssi: parseInt(params[`${base}.AssociatedDeviceRssi`] || '0'),
          snr: parseInt(params[`${base}.X_ZTE-COM_WLAN_SNR`] || '0'),
          noise: parseInt(params[`${base}.X_ZTE-COM_WLAN_Noise`] || '0'),
          bandwidth: params[`${base}.AssociatedDeviceBandWidth`] || '',
          txRate: parseInt(params[`${base}.X_ZTE-COM_TXRate`] || params[`${base}.AssociatedDeviceRate`] || '0'),
          rxRate: parseInt(params[`${base}.X_ZTE-COM_RXRate`] || '0'),
          bytesReceived: parseInt(params[`${base}.X_ZTE-COM_WLAN_BytesReceived`] || '0'),
          bytesSent: parseInt(params[`${base}.X_ZTE-COM_WLAN_BytesSend`] || '0'),
          stayTime: params[`${base}.X_ZTE-COM_StayTime`] || '0',
          radio: params[`${base}.X_ZTE-COM_WLAN_Radio`] || '',
          clientMode: params[`${base}.X_ZTE-COM_WLAN_ClientMode`] || '',
          clientChannelWidth: params[`${base}.X_ZTE-COM_WLAN_ClientChannelWidth`] || '',
          signalStrength: parseInt(params[`${base}.X_ZTE-COM_SignalStrength`] || params[`${base}.X_ZTE-COM_WLAN_RSSI`] || '0'),
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

    // Extract WiFi-related parameters from discovered values
    const wifiParams = Object.fromEntries(
      Object.entries(values).filter(([key]) =>
        key.toLowerCase().includes('wifi') ||
        key.toLowerCase().includes('wlan') ||
        key.toLowerCase().includes('ssid') ||
        key.toLowerCase().includes('presharedkey') ||
        key.toLowerCase().includes('keypassphrase') ||
        key.toLowerCase().includes('beacon') ||
        key.toLowerCase().includes('channel') ||
        key.toLowerCase().includes('radi'),
      ),
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
    switch (task.type) {
      case 'Reboot':
        return this.builder.build(this.buildSoapResponse('Reboot', { CommandKey: task.id }));
      case 'FactoryReset':
        return this.builder.build(this.buildSoapResponse('FactoryReset', { CommandKey: task.id }));
      case 'Download': {
        const payload = task.payload as any;
        return this.builder.build(
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
        );
      }
      case 'GetParameterNames': {
        const payload = task.payload as any;
        const paramPath = payload?.parameterPath || '';
        const nextLevel = payload?.nextLevel ?? true;
        return this.builder.build(
          this.buildSoapResponse('GetParameterNames', {
            ParameterPath: paramPath,
            NextLevel: nextLevel,
          }),
        );
      }
      case 'GetParameterValues': {
        const payload = task.payload as any;
        const names = payload?.names || ['Device.DeviceInfo.*'];
        return this.builder.build(
          this.buildSoapResponse('GetParameterValues', {
            ParameterNames: { string: names },
          }),
        );
      }
      case 'SetParameterValues':
      case 'Provision': {
        const payload = task.payload as any;
        const params = payload?.parameters
          ? Object.entries(payload.parameters as Record<string, string>).map(([name, value]) => ({ name, value }))
          : (payload?.params || []);
        if (params.length === 0) return this.buildEmptySoapEnvelope();
        return this.builder.build(
          this.buildSoapResponse('SetParameterValues', {
            ParameterList: {
              ParameterValueStruct: params.map((p: any) => ({
                Name: p.name,
                Value: { '#text': p.value, '@_xsi:type': 'xsd:string' },
              })),
            },
            ParameterKey: task.id,
          }),
        );
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

  private buildInformResponse(device: any, hasPendingTasks: boolean): string {
    const responseObj = this.buildSoapResponse('InformResponse', {
      MaxEnvelopes: hasPendingTasks ? 2 : 1,
    });
    return `<?xml version="1.0" encoding="UTF-8"?>\n${this.builder.build(responseObj)}`;
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
