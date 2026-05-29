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
  });

  constructor(
    private prisma: PrismaService,
    private ws: WebsocketGateway,
  ) {}

  async handleCwmp(xmlString: string) {
    if (!xmlString) {
      return this.builder.build(this.buildSoapResponse('Fault', { faultcode: 'Client', faultstring: 'Empty body' }));
    }

    try {
      const parsed = this.parser.parse(xmlString);
      const envelope = parsed['soap:Envelope'] || parsed['soapenv:Envelope'] || parsed['Envelope'];
      const body = envelope?.['soap:Body'] || envelope?.['soapenv:Body'] || envelope?.['Body'];

      if (!body) {
        return this.builder.build(this.buildSoapResponse('Fault', { faultcode: 'Client', faultstring: 'No SOAP body' }));
      }

      let responseObj: any;

      if (body['cwmp:Inform'] || body['Inform']) {
        responseObj = await this.handleInform(body);
      } else if (body['cwmp:GetRPCMethods'] || body['GetRPCMethods']) {
        responseObj = await this.handleGetRPCMethods();
      } else {
        // We only handle Inform and GetRPCMethods from the CPE initiating a session
        responseObj = this.buildInformResponse(null);
      }

      const xmlResponse = this.builder.build(responseObj);
      return `<?xml version="1.0" encoding="UTF-8"?>\n${xmlResponse}`;
    } catch (error) {
      this.logger.error('Error handling CWMP:', error);
      return this.builder.build(this.buildSoapResponse('Fault', { faultcode: 'Server', faultstring: 'Internal error' }));
    }
  }

  async handleInform(data: any) {
    const inform = data?.['cwmp:Inform'] || data?.Inform;
    if (!inform) throw new Error('Invalid Inform message');

    const deviceId = inform.DeviceId;
    const serial = deviceId?.SerialNumber || '';
    const mac = deviceId?.MACAddress || '';
    const manufacturer = deviceId?.Manufacturer || '';
    const modelName = deviceId?.ProductClass || '';
    const eventCodes = inform.Event?.['EventStruct'] || [];
    const parameters = inform.ParameterList?.ParameterValueStruct || [];

    const events = Array.isArray(eventCodes) ? eventCodes : [eventCodes];
    const eventCodeStr = events
      .map((e: any) => e?.EventCode || '')
      .join(' ');

    let device = await this.prisma.device.findUnique({
      where: { serial },
    });

    const paramMap: Record<string, string> = {};
    const paramList = Array.isArray(parameters) ? parameters : [parameters];
    for (const p of paramList) {
      paramMap[p.Name] = p.Value?.['#text'] || p.Value || '';
    }

    const ipAddress = inform.DeviceId?.IPAddress || paramMap['Device.IP.Interface.1.IPv4Address'] || '';
    const firmwareVersion =
      paramMap['Device.DeviceInfo.SoftwareVersion'] || '';
    const uptime = parseInt(
      paramMap['Device.DeviceInfo.UpTime'] || '0',
      10,
    );

    if (device) {
      device = await this.prisma.device.update({
        where: { id: device.id },
        data: {
          status: 'ONLINE',
          ipAddress,
          manufacturer: manufacturer || device.manufacturer,
          firmwareVersion: firmwareVersion || device.firmwareVersion,
          uptime: uptime || device.uptime,
          lastInform: new Date(),
          lastContact: new Date(),
          parameters: paramMap,
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
          mac,
          manufacturer,
          modelName,
          modelId,
          firmwareVersion,
          status: 'ONLINE',
          ipAddress,
          lastInform: new Date(),
          lastContact: new Date(),
          parameters: paramMap,
          tenantId: 'default',
        },
      });
    }

    await this.prisma.session.create({
      data: {
        deviceId: device.id,
        event: eventCodeStr,
        status: 'ACTIVE',
        data: { events, parameters: paramMap },
        tenantId: device.tenantId,
      },
    });

    await this.prisma.event.create({
      data: {
        deviceId: device.id,
        code: eventCodeStr,
        message: `Inform received from ${serial}`,
        data: { events, parameters: paramMap },
        tenantId: device.tenantId,
      },
    });

    this.ws.broadcast('device:inform', {
      deviceId: device.id,
      serial,
      status: 'ONLINE',
      event: eventCodeStr,
      timestamp: new Date(),
    });

    const newLog = await this.prisma.log.create({
      data: {
        action: eventCodeStr.includes('BOOT') ? 'BOOT' : 'INFORM',
        entity: 'DEVICE',
        entityId: device.id,
        detail: `Inform received from ${serial} (${manufacturer} ${modelName}) - events: ${eventCodeStr}`,
        deviceId: device.id,
        tenantId: device.tenantId,
      },
    });

    this.ws.broadcast('log:new', newLog);

    return this.buildInformResponse(device);
  }

  async handleGetParameterValues(deviceId: string, paramNames: string[]) {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
    });
    if (!device) throw new Error('Device not found');

    const params = (device.parameters as Record<string, string>) || {};
    const result = paramNames.map((name) => ({
      Name: name,
      Value: params[name] || '',
    }));

    return this.buildSoapResponse('GetParameterValuesResponse', {
      ParameterList: {
        ParameterValueStruct: result.map((r) => ({
          Name: r.Name,
          Value: r.Value,
        })),
      },
    });
  }

  async handleSetParameterValues(
    deviceId: string,
    params: { name: string; value: string; type?: string }[],
  ) {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
    });
    if (!device) throw new Error('Device not found');

    const currentParams =
      typeof device.parameters === 'object' && device.parameters
        ? (device.parameters as Record<string, string>)
        : {};

    for (const p of params) {
      currentParams[p.name] = p.value;
    }

    await this.prisma.device.update({
      where: { id: deviceId },
      data: { parameters: currentParams },
    });

    return this.buildSoapResponse('SetParameterValuesResponse', {
      Status: 0,
    });
  }

  async handleReboot(deviceId: string) {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
    });
    if (!device) throw new Error('Device not found');

    await this.prisma.task.create({
      data: {
        deviceId,
        type: 'Reboot',
        status: 'PENDING',
        payload: { command: 'Reboot' },
        tenantId: device.tenantId,
      },
    });

    this.ws.broadcast('device:command', {
      deviceId,
      command: 'Reboot',
      timestamp: new Date(),
    });

    return this.buildSoapResponse('RebootResponse', {});
  }

  async handleFactoryReset(deviceId: string) {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
    });
    if (!device) throw new Error('Device not found');

    await this.prisma.task.create({
      data: {
        deviceId,
        type: 'FactoryReset',
        status: 'PENDING',
        payload: { command: 'FactoryReset' },
        tenantId: device.tenantId,
      },
    });

    return this.buildSoapResponse('FactoryResetResponse', {});
  }

  async handleDownload(
    deviceId: string,
    url: string,
    fileType: string = '1 Firmware Upgrade Image',
  ) {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
    });
    if (!device) throw new Error('Device not found');

    await this.prisma.task.create({
      data: {
        deviceId,
        type: 'Download',
        status: 'PENDING',
        payload: { url, fileType },
        tenantId: device.tenantId,
      },
    });

    return this.buildSoapResponse('DownloadResponse', {
      Status: 0,
      StartTime: new Date().toISOString(),
      CompleteTime: new Date(Date.now() + 300000).toISOString(),
    });
  }

  async handleUpload(deviceId: string, fileType: string) {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
    });
    if (!device) throw new Error('Device not found');

    return this.buildSoapResponse('UploadResponse', {
      Status: 0,
      StartTime: new Date().toISOString(),
      CompleteTime: new Date(Date.now() + 300000).toISOString(),
    });
  }

  async handleGetRPCMethods() {
    return this.buildSoapResponse('GetRPCMethodsResponse', {
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
  }

  private buildInformResponse(device: any) {
    return this.buildSoapResponse('InformResponse', {
      MaxEnvelopes: 1,
    });
  }

  private buildSoapResponse(action: string, body: any) {
    return {
      'soap:Envelope': {
        '@_xmlns:soap': 'http://schemas.xmlsoap.org/soap/envelope/',
        '@_xmlns:cwmp': 'urn:dslforum-org:cwmp-1-0',
        '@_soap:encodingStyle': 'http://schemas.xmlsoap.org/soap/encoding/',
        'soap:Header': {},
        'soap:Body': {
          [`cwmp:${action}`]: body,
        },
      },
    };
  }
}
