import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ConfigService } from '../system-config/config.service';

@Injectable()
export class ProvisioningService {
  private readonly logger = new Logger(ProvisioningService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  async provisionDevice(deviceId: string, tenantId: string, template?: any) {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      include: { model: true, tenant: true },
    });
    if (!device) throw new Error('Device not found');

    const defaultParams = (device.model?.defaultParameters as Record<string, string>) || {};

    const acsUrl = device.acsPublicUrlOverride
      || device.tenant.acsPublicUrl
      || process.env.ACS_PUBLIC_URL
      || `http://localhost:${process.env.ACS_PORT || '7547'}`;

    const informInterval = await this.configService.getValue('default', 'cwmp.inform.interval') || '300';
    const periodicInformEnable = await this.configService.getValue('default', 'device.default.periodicInformEnable') || 'true';

    const paramsWithCr: Record<string, string> = {
      ...defaultParams,
      'Device.ManagementServer.URL': defaultParams['Device.ManagementServer.URL'] || `${acsUrl}/cwmp`,
      'Device.ManagementServer.PeriodicInformInterval': defaultParams['Device.ManagementServer.PeriodicInformInterval'] || informInterval,
      'InternetGatewayDevice.ManagementServer.PeriodicInformInterval': defaultParams['InternetGatewayDevice.ManagementServer.PeriodicInformInterval'] || informInterval,
      'Device.ManagementServer.PeriodicInformEnable': periodicInformEnable,
      'InternetGatewayDevice.ManagementServer.PeriodicInformEnable': periodicInformEnable,
    };

    const wifiConfig = (device.tenant.defaultWiFiConfig as Record<string, string>) || {};
    if (wifiConfig.ssid && wifiConfig.password) {
      paramsWithCr['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID'] = wifiConfig.ssid;
      paramsWithCr['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase'] = wifiConfig.password;
      paramsWithCr['Device.WiFi.SSID.1.SSID'] = wifiConfig.ssid;
      paramsWithCr['Device.WiFi.AccessPoint.1.Security.KeyPassphrase'] = wifiConfig.password;
    }

    // Read parameter overrides from System Config (prefix: provision.param.)
    const provisionParams = await this.configService.getByPrefix(tenantId, 'provision.param.');
    Object.assign(paramsWithCr, provisionParams);

    const task = await this.prisma.task.create({
      data: {
        deviceId,
        type: 'Provision',
        status: 'PENDING',
        payload: { template, parameters: paramsWithCr },
        tenantId,
      },
    });

    await this.prisma.device.update({
      where: { id: deviceId },
      data: { status: 'PROVISIONING', parameters: { ...(device.parameters as any), ...paramsWithCr } },
    });

    await this.prisma.log.create({
      data: {
        action: 'PROVISION',
        entity: 'DEVICE',
        entityId: deviceId,
        detail: `Provisioning queued for ${device.serial} with ACS URL: ${acsUrl}`,
        tenantId,
      },
    });

    this.logger.log(`Provision task ${task.id} queued for device ${device.serial}`);

    return { task, message: 'Provisioning queued. Will be applied on next CPE connection.' };
  }

  async bulkProvision(deviceIds: string[], tenantId: string) {
    const results = [];
    for (const id of deviceIds) {
      try {
        const result = await this.provisionDevice(id, tenantId);
        results.push({ deviceId: id, status: 'queued', taskId: result.task.id });
      } catch (err: any) {
        results.push({ deviceId: id, status: 'error', error: err.message });
      }
    }
    return results;
  }

  async getTemplates(tenantId: string) {
    return this.prisma.deviceModel.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        manufacturer: true,
        defaultParameters: true,
        provisioningScript: true,
      },
    });
  }

  async getTasks(tenantId: string, query: { page?: number; limit?: number; status?: string }) {
    const page = parseInt(query.page as any, 10) || 1;
    const limit = parseInt(query.limit as any, 10) || 20;
    const skip = (page - 1) * limit;
    const where: any = { tenantId, type: 'Provision' };
    if (query.status) where.status = query.status;

    const [data, total] = await Promise.all([
      this.prisma.task.findMany({
        where, skip, take: limit, orderBy: { createdAt: 'desc' },
        include: { device: { select: { serial: true, modelName: true } } },
      }),
      this.prisma.task.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
