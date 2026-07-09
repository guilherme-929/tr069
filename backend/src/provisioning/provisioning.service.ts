import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ConfigService } from '../system-config/config.service';

@Injectable()
export class ProvisioningService {
  private readonly logger = new Logger(ProvisioningService.name);

  // Model-to-5G-instance mapping (from GenieACS legacy config).
  // Different CPE models expose 5GHz WiFi on different TR-098 WLANConfiguration
  // instances. Instance 1 is always 2.4GHz.
  private readonly MODEL_5G_INSTANCE: Record<string, number> = {
    F670L: 5,
    EG8145X6: 2,
    EG8145V5: 2,
    'EG8145V5-V2': 2,
    MP_X421RQ_F: 2,
    MP_G421R: 2,
    MP_X421R: 2,
    UN1200X_AC: 2,
    AC10: 2,
    HG8546: 2,
    HG8546M: 2,
    HS8145V: 2,
    'G-140W-C': 2,
  };

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  private getWifi5GInstance(modelName: string): number {
    // Normalize: replace spaces, hyphens, dots with underscores
    const normalized = modelName.replace(/[\s\-\.]/g, '_');
    for (const [key, inst] of Object.entries(this.MODEL_5G_INSTANCE)) {
      if (normalized.includes(key) || key.includes(normalized)) return inst;
    }
    return 2; // default fallback: instance 2
  }

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

    // WiFi provisioning: apply tenant defaults to both 2.4GHz and 5GHz bands.
    // The tenant config supports per-band overrides:
    //   - ssid / password    → fallback applied to BOTH bands
    //   - ssid2g / password2g → 2.4GHz specific (overrides ssid/password)
    //   - ssid5g / password5g → 5GHz specific (overrides ssid/password)
    const wifiConfig = (device.tenant.defaultWiFiConfig as Record<string, string>) || {};
    const ssid2g = wifiConfig.ssid2g || wifiConfig.ssid;
    const pass2g = wifiConfig.password2g || wifiConfig.password;
    const ssid5g = wifiConfig.ssid5g || wifiConfig.ssid;
    const pass5g = wifiConfig.password5g || wifiConfig.password;

    if (ssid2g && pass2g) {
      paramsWithCr['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID'] = ssid2g;
      paramsWithCr['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase'] = pass2g;
    }

    if (ssid5g && pass5g) {
      const inst5g = this.getWifi5GInstance(device.modelName);
      paramsWithCr[`InternetGatewayDevice.LANDevice.1.WLANConfiguration.${inst5g}.SSID`] = ssid5g;
      paramsWithCr[`InternetGatewayDevice.LANDevice.1.WLANConfiguration.${inst5g}.KeyPassphrase`] = pass5g;
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

  async getTasks(tenantId: string, query: { page?: number; limit?: number; status?: string; type?: string }) {
    const page = parseInt(query.page as any, 10) || 1;
    const limit = parseInt(query.limit as any, 10) || 20;
    const skip = (page - 1) * limit;
    const where: any = { tenantId };
    if (query.type) where.type = query.type;
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
