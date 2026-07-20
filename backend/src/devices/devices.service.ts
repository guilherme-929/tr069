import { Injectable, Logger, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CwmpService } from '../acs/cwmp.service';
import { ConfigService } from '../system-config/config.service';

export interface VpDefinition {
  paths: string[];
  label: string;
  description?: string;
  transform?: 'first' | 'concat' | 'join';
  separator?: string;
}

@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => CwmpService)) private cwmpService: CwmpService,
    private configService: ConfigService,
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
    await this.prisma.log.deleteMany({ where: { OR: [{ entityId: id }, { deviceId: id }] } });
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

  async getVirtualParameterDefinitions(tenantId?: string): Promise<Map<string, VpDefinition>> {
    const where: any = { category: 'virtual' };
    if (tenantId) where.tenantId = tenantId;
    const configs = await this.prisma.config.findMany({ where });

    const defs = new Map<string, VpDefinition>();
    for (const c of configs) {
      const name = c.key.replace(/^virtualparam\./, '');
      let def: VpDefinition;
      try {
        def = JSON.parse(c.value);
      } catch {
        def = { paths: [c.value], label: name };
      }
      defs.set(name, def);
    }
    return defs;
  }

  async computeVirtualParameters(
    params: Record<string, string>,
    defs: Map<string, VpDefinition>,
  ): Promise<Record<string, string>> {
    const result: Record<string, string> = {};

    for (const [name, def] of defs) {
      const values: string[] = [];

      for (const path of def.paths) {
        const found = params[path];
        if (found !== undefined && found !== '') {
          values.push(found);
        }
      }

      if (values.length === 0) continue;

      const transform = def.transform || 'first';
      switch (transform) {
        case 'concat':
          result[name] = values.join('');
          break;
        case 'join':
          result[name] = values.join(def.separator || ', ');
          break;
        case 'first':
        default:
          result[name] = values[0];
          break;
      }
    }

    return result;
  }

  async getVirtualParameters(id: string) {
    const device = await this.prisma.device.findUnique({ where: { id } });
    if (!device) throw new NotFoundException('Device not found');

    const params = (device.parameters as Record<string, string>) || {};
    const defs = await this.getVirtualParameterDefinitions(device.tenantId);

    const computed = await this.computeVirtualParameters(params, defs);

    const results: Record<string, any> = {};
    for (const [name, value] of Object.entries(computed)) {
      results[name] = value;
    }
    return results;
  }

  private static readonly VIRTUAL_PARAM_MAPPINGS: Record<string, { label: string; paths: string[]; transform?: 'first' | 'join' }> = {
    'WanIP': {
      label: 'WAN IP Address',
      paths: [
        'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress',
        'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress',
        'Device.IP.Interface.1.IPv4Address',
      ],
    },
    'WanMac': {
      label: 'WAN MAC Address',
      paths: [
        'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.MACAddress',
        'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.MACAddress',
        'Device.Ethernet.Interface.1.MACAddress',
      ],
    },
    'Ssid24': {
      label: 'SSID 2.4GHz',
      paths: [
        'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID',
        'Device.WiFi.SSID.1.SSID',
        'InternetGatewayDevice.LANDevice.1.WIFI.SSID.1.SSID',
      ],
    },
    'Ssid5': {
      label: 'SSID 5GHz',
      paths: [
        'InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID',
        'Device.WiFi.SSID.2.SSID',
        'InternetGatewayDevice.LANDevice.1.WIFI.SSID.2.SSID',
      ],
    },
    'SerialNumber': {
      label: 'Serial Number',
      paths: [
        'Device.DeviceInfo.SerialNumber',
        'InternetGatewayDevice.DeviceInfo.SerialNumber',
      ],
    },
    'SoftwareVersion': {
      label: 'Firmware Version',
      paths: [
        'Device.DeviceInfo.SoftwareVersion',
        'InternetGatewayDevice.DeviceInfo.SoftwareVersion',
      ],
    },
    'HardwareVersion': {
      label: 'Hardware Version',
      paths: [
        'Device.DeviceInfo.HardwareVersion',
        'InternetGatewayDevice.DeviceInfo.HardwareVersion',
      ],
    },
    'UpTime': {
      label: 'Uptime',
      paths: [
        'Device.DeviceInfo.UpTime',
        'InternetGatewayDevice.DeviceInfo.UpTime',
      ],
    },
    'ConnectionRequestURL': {
      label: 'Connection Request URL',
      paths: [
        'Device.ManagementServer.ConnectionRequestURL',
        'InternetGatewayDevice.ManagementServer.ConnectionRequestURL',
      ],
    },
    'WifiPass24': {
      label: 'WiFi Password (2.4GHz)',
      paths: [
        'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase',
        'Device.WiFi.AccessPoint.1.Security.KeyPassphrase',
        'Device.WiFi.AccessPoint.1.Security.X_TP_PreSharedKey',
        'InternetGatewayDevice.LANDevice.1.WIFI.AccessPoint.1.Security.KeyPassphrase',
      ],
    },
    'WifiPass5': {
      label: 'WiFi Password (5GHz)',
      paths: [
        'InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.KeyPassphrase',
        'Device.WiFi.AccessPoint.2.Security.KeyPassphrase',
        'Device.WiFi.AccessPoint.2.Security.X_TP_PreSharedKey',
        'InternetGatewayDevice.LANDevice.1.WIFI.AccessPoint.2.Security.KeyPassphrase',
      ],
    },
    'ConnectedDevices24': {
      label: 'Connected Devices (2.4GHz)',
      paths: [
        'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.TotalAssociations',
        'Device.WiFi.AccessPoint.1.AssociatedDeviceNumberOfEntries',
        'Device.WiFi.AccessPoint.3.AssociatedDeviceNumberOfEntries',
        'Device.WiFi.AccessPoint.5.AssociatedDeviceNumberOfEntries',
        'Device.WiFi.AccessPoint.7.AssociatedDeviceNumberOfEntries',
      ],
    },
    'ConnectedDevices5': {
      label: 'Connected Devices (5GHz)',
      paths: [
        'InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.TotalAssociations',
        'Device.WiFi.AccessPoint.2.AssociatedDeviceNumberOfEntries',
        'Device.WiFi.AccessPoint.4.AssociatedDeviceNumberOfEntries',
        'Device.WiFi.AccessPoint.6.AssociatedDeviceNumberOfEntries',
        'Device.WiFi.AccessPoint.8.AssociatedDeviceNumberOfEntries',
        'Device.WiFi.AccessPoint.10.AssociatedDeviceNumberOfEntries',
      ],
    },
  };

  async computeAndStoreVirtualParameters(deviceId: string) {
    try {
      const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
      if (!device) return;

      const params = (device.parameters as Record<string, string>) || {};
      const userDefs = await this.getVirtualParameterDefinitions(device.tenantId);

      const computed: Record<string, string> = {};

      // Built-in TR-098/TR-181 normalization mappings
      for (const [name, mapping] of Object.entries(DevicesService.VIRTUAL_PARAM_MAPPINGS)) {
        for (const path of mapping.paths) {
          const val = params[path];
          if (val !== undefined && val !== '') {
            computed[name] = val;
            break;
          }
        }
      }

      // User-defined virtual parameters (from Config table)
      if (userDefs.size > 0) {
        const userComputed = await this.computeVirtualParameters(params, userDefs);
        Object.assign(computed, userComputed);
      }

      if (Object.keys(computed).length === 0) return;

      const currentParams = { ...params };
      let changed = false;

      for (const [name, value] of Object.entries(computed)) {
        const key = `VirtualParameters.${name}`;
        if (currentParams[key] !== value) {
          currentParams[key] = value;
          changed = true;
        }
      }

      if (!changed) return;

      await this.prisma.device.update({
        where: { id: deviceId },
        data: { parameters: currentParams as any },
      });

      this.logger.log(`[VP] Computed & stored ${Object.keys(computed).length} virtual params for ${device.serial}`);
    } catch (err: any) {
      this.logger.error(`[VP] Error computing virtual params for ${deviceId}: ${err.message}`);
    }
  }

  async getConnectedDevices(id: string) {
    const device = await this.prisma.device.findUnique({ where: { id } });
    if (!device) throw new NotFoundException('Device not found');
    return this.cwmpService.handleGetConnectedDevices(id);
  }
}