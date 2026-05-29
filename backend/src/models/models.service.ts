import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class ModelsService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string, query: { page?: number; limit?: number; search?: string }) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;
    const where: any = { tenantId };
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { manufacturer: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    const [data, total] = await Promise.all([
      this.prisma.deviceModel.findMany({
        where, skip, take: limit, orderBy: { createdAt: 'desc' },
        include: { _count: { select: { devices: true, firmwares: true } } },
      }),
      this.prisma.deviceModel.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const model = await this.prisma.deviceModel.findUnique({
      where: { id },
      include: {
        firmwares: { orderBy: { createdAt: 'desc' } },
        devices: { take: 5, orderBy: { lastContact: 'desc' } },
      },
    });
    if (!model) throw new NotFoundException('Model not found');
    return model;
  }

  async create(data: any, tenantId: string) {
    return this.prisma.deviceModel.create({
      data: { ...data, tenantId },
    });
  }

  async update(id: string, data: any) {
    const model = await this.prisma.deviceModel.findUnique({ where: { id } });
    if (!model) throw new NotFoundException('Model not found');
    return this.prisma.deviceModel.update({ where: { id }, data });
  }

  async remove(id: string) {
    const model = await this.prisma.deviceModel.findUnique({ where: { id } });
    if (!model) throw new NotFoundException('Model not found');
    await this.prisma.deviceModel.delete({ where: { id } });
    return { message: 'Model removed' };
  }
}
