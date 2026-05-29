import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    private prisma: PrismaService,
    private ws: WebsocketGateway,
  ) {}

  async getQueueStats(tenantId: string) {
    const [pending, inProgress, completed, failed] = await Promise.all([
      this.prisma.task.count({ where: { tenantId, status: 'PENDING' } }),
      this.prisma.task.count({ where: { tenantId, status: 'IN_PROGRESS' } }),
      this.prisma.task.count({ where: { tenantId, status: 'COMPLETED' } }),
      this.prisma.task.count({ where: { tenantId, status: 'FAILED' } }),
    ]);
    return { pending, inProgress, completed, failed, total: pending + inProgress + completed + failed };
  }

  async getTasks(tenantId: string, query: { page?: number; limit?: number; status?: string; type?: string }) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;
    const where: any = { tenantId };
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;

    const [data, total] = await Promise.all([
      this.prisma.task.findMany({
        where, skip, take: limit, orderBy: { createdAt: 'desc' },
        include: { device: { select: { serial: true, modelName: true } } },
      }),
      this.prisma.task.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async retryTask(taskId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new Error('Task not found');

    return this.prisma.task.update({
      where: { id: taskId },
      data: { status: 'PENDING', attempts: 0, error: null },
    });
  }

  async cancelTask(taskId: string) {
    return this.prisma.task.update({
      where: { id: taskId },
      data: { status: 'CANCELLED' },
    });
  }
}
