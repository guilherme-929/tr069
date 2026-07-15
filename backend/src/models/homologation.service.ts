import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { HomologationStatus } from '@prisma/client';

@Injectable()
export class HomologationService {
  private readonly logger = new Logger(HomologationService.name);

  constructor(private prisma: PrismaService) {}

  async getFingerprint(deviceId: string) {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      include: { model: true },
    });
    if (!device) throw new NotFoundException('Device not found');

    const params = (device.parameters as Record<string, string>) || {};

    let tr181 = 0; let tr098 = 0;
    for (const k of Object.keys(params)) {
      if (k.startsWith('Device.')) tr181++;
      else if (k.startsWith('InternetGatewayDevice.')) tr098++;
    }
    const detectedDataModel = tr181 > tr098 ? 'TR-181' : (tr098 > tr181 ? 'TR-098' : 'unknown');
    const leaveCount = (params as any).__discovered__?._leaves?.length || 0;

    let rpcMethods: string[] = [];
    try {
      const task = await this.prisma.task.findFirst({
        where: { deviceId, type: 'GetRPCMethods', status: 'COMPLETED' },
        orderBy: { createdAt: 'desc' },
      });
      if (task?.result && typeof task.result === 'object') {
        rpcMethods = (task.result as any).methods || [];
      }
    } catch {}

    return {
      manufacturer: device.manufacturer,
      modelName: device.modelName,
      oui: params['Device.DeviceInfo.ManufacturerOUI'] || '',
      productClass: params['Device.DeviceInfo.ProductClass'] || '',
      hardwareVersion: device.hardwareVersion,
      softwareVersion: device.firmwareVersion,
      serialNumber: device.serial,
      dataModel: detectedDataModel,
      totalParametersDiscovered: Object.keys(params).filter(k => !k.startsWith('_')).length,
      totalLeavesDiscovered: leaveCount,
      rpcMethods,
      modelId: device.modelId,
      model: device.model,
    };
  }

  async updateHomologationStatus(
    modelId: string,
    status: HomologationStatus,
    notes?: string,
    userId?: string,
  ) {
    const model = await this.prisma.deviceModel.findUnique({ where: { id: modelId } });
    if (!model) throw new NotFoundException('DeviceModel not found');

    const updated = await this.prisma.deviceModel.update({
      where: { id: modelId },
      data: {
        homologationStatus: status,
        homologationNotes: notes ?? undefined,
        homologatedAt: status === 'APPROVED' || status === 'REJECTED' ? new Date() : undefined,
        homologatedBy: userId,
      },
    });

    this.logger.log(`Homologation status for model "${model.name}" updated to ${status}${notes ? `: ${notes}` : ''}`);
    return updated;
  }

  async getChecklist() {
    return [
      { id: 'inform', label: 'Inform periódico chega e persiste em parameters', category: 'connectivity' },
      { id: 'gpv', label: 'GetParameterValues completo sem Fault', category: 'discovery' },
      { id: 'spv', label: 'SetParameterValues (SSID/senha) aplica e confirma', category: 'config' },
      { id: 'wifi24', label: 'WiFi 2.4GHz (SSID, canal, senha, status)', category: 'wifi' },
      { id: 'wifi5', label: 'WiFi 5GHz (SSID, canal, senha, status)', category: 'wifi' },
      { id: 'connected', label: 'Connected Devices (clientes associados)', category: 'wifi' },
      { id: 'cr', label: 'Connection Request funciona (ou fallback CGNAT)', category: 'connectivity' },
      { id: 'reboot', label: 'Reboot / FactoryReset responde', category: 'connectivity' },
      { id: 'firmware', label: 'Download de firmware (se aplicável)', category: 'firmware' },
      { id: 'noloop', label: 'Sem loop de reconexão (>N informs/min)', category: 'stability' },
    ];
  }

  async isHomologatedOrBlocked(deviceId: string): Promise<boolean> {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      include: { model: true },
    });
    if (!device || !device.model) return false;
    const status = device.model.homologationStatus;
    if (status === 'PENDING_REVIEW' || status === 'IN_TESTING') {
      const hasHomologTag = device.tags?.includes('homolog');
      return !hasHomologTag;
    }
    return false;
  }
}
