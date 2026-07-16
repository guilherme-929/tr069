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
    const ssid24 = parameters['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID']
      || parameters['Device.WiFi.SSID.1.SSID']
      || parameters['InternetGatewayDevice.LANDevice.1.WIFI.SSID.1.SSID']
      || '';

    for (let i = 2; i <= 8; i++) {
      const ssid = parameters['InternetGatewayDevice.LANDevice.1.WLANConfiguration.' + i + '.SSID']
        || parameters['Device.WiFi.SSID.' + i + '.SSID']
        || parameters['InternetGatewayDevice.LANDevice.1.WIFI.SSID.' + i + '.SSID'];
      if (!ssid || ssid === ssid24) continue;

      const std = parameters['InternetGatewayDevice.LANDevice.1.WLANConfiguration.' + i + '.Standard'] || '';
      const band = parameters['InternetGatewayDevice.LANDevice.1.WLANConfiguration.' + i + '.X_ZTE-COM_OperatingFrequencyBand']
        || parameters['InternetGatewayDevice.LANDevice.1.WIFI.SSID.' + i + '.X_ZTE-COM_OperatingFrequencyBand']
        || '';

      const is5G = std.includes('ac') || std.includes('a') || std.includes('n') && !std.includes('2.4')
        || band.includes('5G') || band.includes('5')
        || ssid.includes('-5G') || ssid.includes('_5G');

      if (is5G) {
        this.logger.log('[WIFI-5G] Auto-discovered 5GHz instance ' + i + ' for ' + deviceModelName + ' (SSID=' + ssid + ')');
        return i;
      }
    }

    for (let i = 1; i <= 4; i++) {
      const ssid = parameters['Device.WiFi.SSID.' + i + '.SSID'];
      if (!ssid || ssid === ssid24) continue;
      const band = parameters['Device.WiFi.AccessPoint.' + i + '.OperatingFrequencyBand'] || '';
      if (band.includes('5GHz') || band.includes('5') || ssid.includes('-5G')) {
        this.logger.log('[WIFI-5G] Auto-discovered TR-181 5GHz instance ' + i + ' for ' + deviceModelName + ' (SSID=' + ssid + ')');
        return i;
      }
    }

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
      this.logger.log('[WIFI-5G] Discovered from parameter tree: instance ' + bestInstance + ' for ' + deviceModelName);
      return bestInstance;
    }

    const wifiConfig = await this.configService.getValue('default', 'provision.wifi.5gInstance');
    if (wifiConfig) {
      const configured = parseInt(wifiConfig, 10);
      if (configured > 1 && configured <= 8) return configured;
    }

    const hasInstance5 = leaves.some(function(l) { return l.includes('WLANConfiguration.5.'); })
      || parameters['InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID'] !== undefined;
    if (hasInstance5) {
      this.logger.log('[WIFI-5G] Instance 5 detected for ' + deviceModelName + ' — using it as 5GHz');
      return 5;
    }

    this.logger.log('[WIFI-5G] Defaulting to instance 2 for ' + deviceModelName + ' (no 5GHz indicators found)');
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
      || 'http://localhost:' + (process.env.ACS_PORT || '7547');

    const informInterval = await this.configService.getValue('default', 'cwmp.inform.interval') || '300';
    const periodicInformEnable = await this.configService.getValue('default', 'device.default.periodicInformEnable') || 'true';

    const paramsWithCr: Record<string, string> = {
      ...defaultParams,
      'Device.ManagementServer.URL': defaultParams['Device.ManagementServer.URL'] || acsUrl + '/cwmp',
      'Device.ManagementServer.PeriodicInformInterval': defaultParams['Device.ManagementServer.PeriodicInformInterval'] || informInterval,
      'InternetGatewayDevice.ManagementServer.PeriodicInformInterval': defaultParams['InternetGatewayDevice.ManagementServer.PeriodicInformInterval'] || informInterval,
      'Device.ManagementServer.PeriodicInformEnable': periodicInformEnable,
      'InternetGatewayDevice.ManagementServer.PeriodicInformEnable': periodicInformEnable,
    };

    const dataModel = device.model?.dataModel as string | null;
    if (dataModel === 'TR-181') {
      for (const key of Object.keys(paramsWithCr)) {
        if (key.startsWith('InternetGatewayDevice.')) {
          delete paramsWithCr[key];
        }
      }
      this.logger.debug('[PROVISION] Filtered to TR-181 namespace for ' + device.serial + ' (' + device.modelName + ')');
    } else if (dataModel === 'TR-098') {
      for (const key of Object.keys(paramsWithCr)) {
        if (key.startsWith('Device.')) {
          delete paramsWithCr[key];
        }
      }
      this.logger.debug('[PROVISION] Filtered to TR-098 namespace for ' + device.serial + ' (' + device.modelName + ')');
    }

    // Remove paths that are already known to be unsupported for this model
    const unsupported = (device.model?.unsupportedParameters as string[]) || [];
    if (unsupported.length > 0) {
      for (const key of Object.keys(paramsWithCr)) {
        if (unsupported.includes(key)) {
          delete paramsWithCr[key];
        }
      }
      this.logger.debug('[PROVISION] Removed ' + unsupported.filter(u => paramsWithCr.hasOwnProperty(u) === false).length + ' unsupported params for ' + device.serial);
    }

    const wifiConfig = (device.tenant.defaultWiFiConfig as Record<string, string>) || {};
    const ssid2g = wifiConfig.ssid2g || wifiConfig.ssid;
    const pass2g = wifiConfig.password2g || wifiConfig.password;
    const ssid5g = wifiConfig.ssid5g || wifiConfig.ssid;
    const pass5g = wifiConfig.password5g || wifiConfig.password;

    if (ssid2g && pass2g) {
      if (!dataModel || dataModel === 'TR-098') {
        paramsWithCr['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID'] = ssid2g;
        paramsWithCr['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase'] = pass2g;
      }
      if (!dataModel || dataModel === 'TR-181') {
        paramsWithCr['Device.WiFi.SSID.1.SSID'] = ssid2g;
        paramsWithCr['Device.WiFi.AccessPoint.1.Security.KeyPassphrase'] = pass2g;
      }
    }

    if (ssid5g && pass5g) {
      const inst5g = await this.discoverWifi5GInstance(device.id, device.modelName, deviceParams);
      this.logger.log('[PROVISION] Using 5GHz instance ' + inst5g + ' for ' + device.serial + ' (' + device.modelName + ')');

      if (!dataModel || dataModel === 'TR-098') {
        paramsWithCr['InternetGatewayDevice.LANDevice.1.WLANConfiguration.' + inst5g + '.SSID'] = ssid5g;
        paramsWithCr['InternetGatewayDevice.LANDevice.1.WLANConfiguration.' + inst5g + '.KeyPassphrase'] = pass5g;
      }
      if (!dataModel || dataModel === 'TR-181') {
        paramsWithCr['Device.WiFi.SSID.' + inst5g + '.SSID'] = ssid5g;
        paramsWithCr['Device.WiFi.AccessPoint.' + inst5g + '.Security.KeyPassphrase'] = pass5g;
      }
    }

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
        detail: 'Provisioning queued for ' + device.serial + ' with ACS URL: ' + acsUrl,
        tenantId,
      },
    });

    this.logger.log('Provision task ' + task.id + ' queued for device ' + device.serial);

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
