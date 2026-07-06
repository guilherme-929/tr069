import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CwmpService } from '../acs/cwmp.service';

@Injectable()
export class DevicesService {
  constructor(
    private prisma: PrismaService,
    private cwmpService: CwmpService,
  ) {}

  async findAll(
    tenantId: string,
    query: {
      page?: number;
      limit?: number;
      status?: string;
      search?: string;
      modelId?: string;
      clientId?: string;
    },
  ) {
    const page = parseInt(query.page as any, 10) || 1;
    const limit = parseInt(query.limit as any, 10) || 20;
    const skip = (page - 1) * limit;
    const where: any = { tenantId };

    if (query.status) where.status = query.status;
    if (query.modelId) where.modelId = query.modelId;
    if (query.clientId) where.clientId = query.clientId;
    if (query.search) {
      where.OR = [
        { serial: { contains: query.search, mode: 'insensitive' } },
        { mac: { contains: query.search, mode: 'insensitive' } },
        { modelName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.device.findMany({
        where,
        skip,
        take: limit,
        orderBy: { lastContact: 'desc' },
        include: { model: true, client: true, firmware: true, alerts: { where: { resolved: false }, take: 1 } },
      }),
      this.prisma.device.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const device = await this.prisma.device.findUnique({
      where: { id },
      include: {
        model: true,
        client: true,
        firmware: true,
        sessions: { orderBy: { createdAt: 'desc' }, take: 10 },
        events: { orderBy: { createdAt: 'desc' }, take: 20 },
        tasks: { orderBy: { createdAt: 'desc' }, take: 10 },
        alerts: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!device) throw new NotFoundException('Device not found');
    return device;
  }

  async update(id: string, data: any) {
    const device = await this.prisma.device.findUnique({ where: { id } });
    if (!device) throw new NotFoundException('Device not found');
    return this.prisma.device.update({ where: { id }, data });
  }

  async updateAcsConfig(
    id: string,
    data: {
      connectionRequestUrl?: string;
      connectionRequestUsername?: string;
      connectionRequestPassword?: string;
      acsPublicUrlOverride?: string;
    },
  ) {
    const device = await this.prisma.device.findUnique({ where: { id } });
    if (!device) throw new NotFoundException('Device not found');
    return this.prisma.device.update({
      where: { id },
      data: {
        ...(data.connectionRequestUrl !== undefined && { connectionRequestUrl: data.connectionRequestUrl }),
        ...(data.connectionRequestUsername !== undefined && { connectionRequestUsername: data.connectionRequestUsername }),
        ...(data.connectionRequestPassword !== undefined && { connectionRequestPassword: data.connectionRequestPassword }),
        ...(data.acsPublicUrlOverride !== undefined && { acsPublicUrlOverride: data.acsPublicUrlOverride }),
      },
    });
  }

  async remove(id: string) {
    const device = await this.prisma.device.findUnique({ where: { id } });
    if (!device) throw new NotFoundException('Device not found');

    await this.prisma.session.deleteMany({ where: { deviceId: id } });
    await this.prisma.task.deleteMany({ where: { deviceId: id } });
    await this.prisma.event.deleteMany({ where: { deviceId: id } });
    await this.prisma.log.deleteMany({ where: { entityId: id } });
    await this.prisma.alert.deleteMany({ where: { deviceId: id } });
    await this.prisma.device.delete({ where: { id } });

    return { message: 'Device removed' };
  }

  async getDeviceHistory(id: string) {
    return this.prisma.event.findMany({
      where: { deviceId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getVirtualParameters(id: string) {
    const device = await this.prisma.device.findUnique({ where: { id } });
    if (!device) throw new NotFoundException('Device not found');

    const params = (device.parameters as Record<string, string>) || {};

    const extractIp = (path: string): string => {
      for (const k of Object.keys(params)) {
        if (k.startsWith(path)) return params[k] || '';
      }
      return '';
    };

    const vLoginPPPoE = params['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username']
      || params['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.Username']
      || '';

    const vWAN1_IP = params['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress']
      || params['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress']
      || extractIp('InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1')
      || '';

    const vWAN2_IP = params['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANIPConnection.1.ExternalIPAddress']
      || params['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.ExternalIPAddress']
      || '';

    const vIP_Voip = params['InternetGatewayDevice.VoiceService.1.VoIPProfile.1.SIP.ProxyServer']
      || '';

    const wifiBands: { band: string; ssid: string; channel: string; status: string; standard: string; associations: string }[] = [];
    for (let i = 1; i <= 8; i++) {
      const prefix = `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}`;
      const ssid = params[`${prefix}.SSID`];
      if (ssid) {
        wifiBands.push({
          band: params[`${prefix}.X_ZTE-COM_OperatingFrequencyBand`]
            || params[`${prefix}.X_ZTE-COM_WLAN_SupportedFrequencyBands`] || `WLAN${i}`,
          ssid,
          channel: params[`${prefix}.Channel`] || '',
          status: params[`${prefix}.Status`] || '',
          standard: params[`${prefix}.Standard`] || '',
          associations: params[`${prefix}.TotalAssociations`] || '0',
        });
      }
    }

    const wifi2g = wifiBands.find(b => b.band.includes('2.4') || b.band === 'WLAN1');
    const wifi5g = wifiBands.find(b => b.band.includes('5') || b.band === 'WLAN5');

    return {
      vLoginPPPoE,
      vWAN1_IP,
      vWAN2_IP,
      vIP_Voip,
      vWifi2G: wifi2g ? `${wifi2g.ssid} | Ch:${wifi2g.channel} | ${wifi2g.status}` : '',
      vWifi5G: wifi5g ? `${wifi5g.ssid} | Ch:${wifi5g.channel} | ${wifi5g.status}` : '',
      wifiBands,
    };
  }

  async getConnectedDevices(id: string) {
    const device = await this.prisma.device.findUnique({ where: { id } });
    if (!device) throw new NotFoundException('Device not found');
    return this.cwmpService.handleGetConnectedDevices(id);
  }
}
