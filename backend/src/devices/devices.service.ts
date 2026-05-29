import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class DevicesService {
  constructor(private prisma: PrismaService) {}

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
    const page = query.page || 1;
    const limit = query.limit || 20;
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

  async remove(id: string) {
    const device = await this.prisma.device.findUnique({ where: { id } });
    if (!device) throw new NotFoundException('Device not found');
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
}
