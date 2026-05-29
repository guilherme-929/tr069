import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class LogsService {
  constructor(private prisma: PrismaService) {}

  async findAll(
    tenantId: string,
    query: {
      page?: number;
      limit?: number;
      search?: string;
      action?: string;
      entity?: string;
      startDate?: string;
      endDate?: string;
    },
  ) {
    const page = parseInt(query.page as any, 10) || 1;
    const limit = parseInt(query.limit as any, 10) || 50;
    const skip = (page - 1) * limit;
    const where: any = { tenantId };

    if (query.action) where.action = query.action;
    if (query.entity) where.entity = query.entity;
    if (query.search) {
      where.OR = [
        { detail: { contains: query.search, mode: 'insensitive' } },
        { entityId: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const [data, total] = await Promise.all([
      this.prisma.log.findMany({
        where, skip, take: limit, orderBy: { createdAt: 'desc' },
        include: { user: { select: { name: true, email: true } } },
      }),
      this.prisma.log.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async export(tenantId: string, query: any) {
    const logs = await this.prisma.log.findMany({
      where: { tenantId, ...query },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });
    return logs;
  }
}
