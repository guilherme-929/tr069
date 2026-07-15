import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class DiscoveryService {
  private readonly logger = new Logger(DiscoveryService.name);
  private cachedTenantId: string | null = null;

  constructor(private prisma: PrismaService) {}

  private async resolveTenantId(): Promise<string> {
    if (this.cachedTenantId) return this.cachedTenantId;
    const tenant = await this.prisma.tenant.findFirst({ where: { slug: 'default-isp' } })
      || await this.prisma.tenant.findFirst();
    if (!tenant) throw new Error('No tenant found');
    this.cachedTenantId = tenant.id;
    return tenant.id;
  }

  async discoverDeviceModel(deviceId: string): Promise<any> {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      include: { model: true },
    });
    if (!device) throw new Error('Device not found');

    const params = (device.parameters as Record<string, string>) || {};
    const discovered: Record<string, any> = {};

    for (const [key, value] of Object.entries(params)) {
      const parts = key.split('.');
      let current = discovered;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (i === parts.length - 1) {
          const exists = this.findInPath(current, part);
          if (!exists) {
            const container = this.navigateToParent(discovered, parts.slice(0, -1));
            if (container) {
              container[part] = { _value: value, _type: this.inferType(value) };
            }
          }
        }
      }
    }

    const manufacturer = params['Device.DeviceInfo.Manufacturer'] || device.manufacturer || '';
    const modelName = params['Device.DeviceInfo.ModelName'] || device.modelName || '';
    const hwVersion = params['Device.DeviceInfo.HardwareVersion'] || '';
    const swVersion = params['Device.DeviceInfo.SoftwareVersion'] || device.firmwareVersion || '';

    const model = await this.prisma.deviceModel.findFirst({
      where: { manufacturer, name: modelName },
    });

    return {
      manufacturer,
      modelName,
      hardwareVersion: hwVersion,
      softwareVersion: swVersion,
      oui: params['Device.DeviceInfo.ManufacturerOUI'] || '',
      productClass: params['Device.DeviceInfo.ProductClass'] || '',
      serialNumber: device.serial,
      parameters: params,
      structuredData: discovered,
      totalParameters: Object.keys(params).length,
      existingModel: model,
      suggestCreate: !model && manufacturer && modelName,
    };
  }

  async autoCreateModel(deviceId: string): Promise<any> {
    const discovery = await this.discoverDeviceModel(deviceId);
    if (!discovery.suggestCreate) {
      if (discovery.existingModel) {
        return { message: 'Model already exists', model: discovery.existingModel };
      }
      throw new Error('Cannot create model: missing manufacturer or model name');
    }

    const model = await this.prisma.deviceModel.create({
      data: {
        manufacturer: discovery.manufacturer,
        name: discovery.modelName,
        hwVersion: discovery.hardwareVersion || undefined,
        dataModel: this.detectDataModel(discovery.parameters),
        description: `Auto-discovered from device ${discovery.serialNumber}`,
        defaultParameters: discovery.parameters as any,
        tenantId: await this.resolveTenantId(),
      },
    });

    await this.prisma.device.update({
      where: { id: deviceId },
      data: { modelId: model.id },
    });

    return { message: 'Model auto-created', model };
  }

  private inferType(value: string): string {
    if (!value || value === '') return 'xsd:string';
    if (/^\d+$/.test(value)) return 'xsd:unsignedInt';
    if (/^\d+\.\d+$/.test(value)) return 'xsd:float';
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return 'xsd:dateTime';
    if (value === 'true' || value === 'false') return 'xsd:boolean';
    return 'xsd:string';
  }

  private findInPath(obj: any, key: string): boolean {
    return key in obj;
  }

  private navigateToParent(obj: any, parts: string[]): any {
    let current = obj;
    for (const part of parts) {
      if (!current[part]) current[part] = {};
      current = current[part];
    }
    return current;
  }

  private detectDataModel(params: Record<string, any>): string {
    let tr181 = 0;
    let tr098 = 0;
    for (const key of Object.keys(params)) {
      if (key.startsWith('Device.')) tr181++;
      else if (key.startsWith('InternetGatewayDevice.')) tr098++;
    }
    if (tr181 > tr098) return 'TR-181';
    if (tr098 > tr181) return 'TR-098';
    return 'TR-181';
  }
}
