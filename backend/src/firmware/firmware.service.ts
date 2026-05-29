import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class FirmwareService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string, query: { page?: number; limit?: number; modelId?: string }) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;
    const where: any = { tenantId };
    if (query.modelId) where.modelId = query.modelId;

    const [data, total] = await Promise.all([
      this.prisma.firmware.findMany({
        where, skip, take: limit, orderBy: { createdAt: 'desc' },
        include: { model: true, _count: { select: { devices: true } } },
      }),
      this.prisma.firmware.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const firmware = await this.prisma.firmware.findUnique({
      where: { id },
      include: { model: true },
    });
    if (!firmware) throw new NotFoundException('Firmware not found');
    return firmware;
  }

  async create(data: any, tenantId: string) {
    return this.prisma.firmware.create({ data: { ...data, tenantId } });
  }

  async update(id: string, data: any) {
    const firmware = await this.prisma.firmware.findUnique({ where: { id } });
    if (!firmware) throw new NotFoundException('Firmware not found');
    return this.prisma.firmware.update({ where: { id }, data });
  }

  async remove(id: string) {
    const firmware = await this.prisma.firmware.findUnique({ where: { id } });
    if (!firmware) throw new NotFoundException('Firmware not found');
    await this.prisma.firmware.delete({ where: { id } });
    return { message: 'Firmware removed' };
  }
}
