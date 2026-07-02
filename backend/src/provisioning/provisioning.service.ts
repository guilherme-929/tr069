import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class ProvisioningService {
  private readonly logger = new Logger(ProvisioningService.name);

  constructor(private prisma: PrismaService) {}

  async provisionDevice(deviceId: string, tenantId: string, template?: any) {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      include: { model: true },
    });
    if (!device) throw new Error('Device not found');

    const defaultParams = (device.model?.defaultParameters as Record<string, string>) || {};

    const task = await this.prisma.task.create({
      data: {
        deviceId,
        type: 'Provision',
        status: 'PENDING',
        payload: { template, parameters: defaultParams },
        tenantId,
      },
    });

    await this.prisma.device.update({
      where: { id: deviceId },
      data: { status: 'PROVISIONING', parameters: { ...(device.parameters as any), ...defaultParams } },
    });

    await this.prisma.log.create({
      data: {
        action: 'PROVISION',
        entity: 'DEVICE',
        entityId: deviceId,
        detail: `Provisioning queued for ${device.serial}`,
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
    const page = query.page || 1;
    const limit = query.limit || 20;
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
