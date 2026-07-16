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

  private async discoverWifi5GInstance(deviceId: string, deviceModelName: string, parameters: Record<string, string>): Promise<number> {
    // First, try to find 5GHz instances from discovered parameters.
    // 5GHz bands typically have SSID ending in "-5G" or are on instance > 1
    // with a different SSID than instance 1 (2.4GHz).
    const ssid24 = parameters['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID']
      || parameters['Device.WiFi.SSID.1.SSID']
      || parameters['InternetGatewayDevice.LANDevice.1.WIFI.SSID.1.SSID']
      || '';

    // Check all WLANConfiguration instances for 5GHz indicators
    for (let i = 2; i <= 8; i++) {
      const ssid = parameters[`InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.SSID`]
        || parameters[`Device.WiFi.SSID.${i}.SSID`]
        || parameters[`InternetGatewayDevice.LANDevice.1.WIFI.SSID.${i}.SSID`];
      if (!ssid || ssid === ssid24) continue;

      // Check for 5GHz indicators: standard, frequency band, or SSID suffix
      const std = parameters[`InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.Standard`] || '';
      const band = parameters[`InternetGatewayDevice.LANDevice.1.WLANConfiguration.${i}.X_ZTE-COM_OperatingFrequencyBand`]
        || parameters[`InternetGatewayDevice.LANDevice.1.WIFI.SSID.${i}.X_ZTE-COM_OperatingFrequencyBand`]
        || '';

      const is5G = std.includes('ac') || std.includes('a') || std.includes('n') && !std.includes('2.4')
        || band.includes('5G') || band.includes('5')
        || ssid.includes('-5G') || ssid.includes('_5G');

      if (is5G) {
        this.logger.log(`[WIFI-5G] Auto-discovered 5GHz instance ${i} for ${deviceModelName} (SSID=${ssid})`);
        return i;
      }
    }

    // Check TR-181 WiFi instances for 5GHz indicators
    for (let i = 1; i <= 4; i++) {
      const ssid = parameters[`Device.WiFi.SSID.${i}.SSID`];
      if (!ssid || ssid === ssid24) continue;
      const band = parameters[`Device.WiFi.AccessPoint.${i}.OperatingFrequencyBand`] || '';
      if (band.includes('5GHz') || band.includes('5') || ssid.includes('-5G')) {
        this.logger.log(`[WIFI-5G] Auto-discovered TR-181 5GHz instance ${i} for ${deviceModelName} (SSID=${ssid})`);
        return i;
      }
    }

    // Check discovered leaves structure for any WiFi-related paths
    const discovered = (parameters.__discovered__ || {}) as any;
    const leaves: string[] = discovered._leaves || [];
    const instanceRe = /WLANConfiguration\.(\d+)\.SSID/;
    const wifiMap = new Map<number, string>();
    for (const leaf of leaves) {
      const m = leaf.match(instanceRe);
      if (m) {
        const inst = parseInt(m[1], 10);
        if (inst > 1) {
          const val = parameters[leaf] || '';
          wifiMap.set(inst, val);
        }
      }
    }

    if (wifiMap.size > 0) {
      // Find the instance with the most different SSID from instance 1 (likely 5GHz)
      let bestInstance = 2;
      let bestDiff = 0;
      for (const [inst, ssid] of wifiMap) {
        if (ssid && ssid !== ssid24) {
          const diff = Math.abs(ssid.length - ssid24.length);
          if (diff > bestDiff) {
            bestDiff = diff;
            bestInstance = inst;
          }
        }
      }
      this.logger.log(`[WIFI-5G] Discovered from parameter tree: instance ${bestInstance} for ${deviceModelName}`);
      return bestInstance;
    }

    // Fallback: use tenant config if available
    const wifiConfig = await this.configService.getValue('default', 'provision.wifi.5gInstance');
    if (wifiConfig) {
      const configured = parseInt(wifiConfig, 10);
      if (configured > 1 && configured <= 8) return configured;
    }

    // Last resort: try instance 5 (most common for ZTE F670L) then instance 2
    const hasInstance5 = leaves.some(l => l.includes('WLANConfiguration.5.'))
      || parameters['InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID'] !== undefined;
    if (hasInstance5) {
      this.logger.log(`[WIFI-5G] Instance 5 detected for ${deviceModelName} — using it as 5GHz`);
      return 5;
    }

    this.logger.log(`[WIFI-5G] Defaulting to instance 2 for ${deviceModelName} (no 5GHz indicators found)`);
    return 2;
  }

  async provisionDevice(deviceId: string, tenantId: string, template?: any) {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      include: { model: true, tenant: true },
    });
    if (!device) throw new Error('Device not found');

    const defaultParams = (device.model?.defaultParameters as Record<string, string>) || {};
    const deviceParams = (device.parameters as Record<string, string>) || {};

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
      const inst5g = await this.discoverWifi5GInstance(device.id, device.modelName, deviceParams);
      this.logger.log(`[PROVISION] Using 5GHz instance ${inst5g} for ${device.serial} (${device.modelName})`);

      // Set both TR-098 and TR-181 paths for the 5GHz instance
      paramsWithCr[`InternetGatewayDevice.LANDevice.1.WLANConfiguration.${inst5g}.SSID`] = ssid5g;
      paramsWithCr[`InternetGatewayDevice.LANDevice.1.WLANConfiguration.${inst5g}.KeyPassphrase`] = pass5g;
      paramsWithCr[`Device.WiFi.SSID.${inst5g}.SSID`] = ssid5g;
      paramsWithCr[`Device.WiFi.AccessPoint.${inst5g}.Security.KeyPassphrase`] = pass5g;
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
