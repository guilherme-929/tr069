import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class TasksMaintenanceService {
  private readonly logger = new Logger(TasksMaintenanceService.name);
  private static readonly STUCK_THRESHOLD_MS = 30 * 60_000;

  constructor(private prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCron() {
    const result = await this.resetStuckTasks();
    if (result.reset > 0 || result.failed > 0) {
      this.logger.log(`[CRON] tasks resetadas: ${result.reset}, marcadas FAILED: ${result.failed}`);
    }
  }

  async resetStuckTasks(): Promise<{ reset: number; failed: number }> {
    const cutoff = new Date(Date.now() - TasksMaintenanceService.STUCK_THRESHOLD_MS);

    const stuck = await this.prisma.task.findMany({
      where: { status: 'IN_PROGRESS', updatedAt: { lt: cutoff } },
    });

    let reset = 0;
    let failed = 0;

    for (const task of stuck) {
      if (task.attempts + 1 >= task.maxAttempts) {
        await this.prisma.task.update({
          where: { id: task.id },
          data: { status: 'FAILED', attempts: { increment: 1 }, error: 'Timeout: sem resposta do CPE' },
        });
        failed++;
      } else {
        await this.prisma.task.update({
          where: { id: task.id },
          data: { status: 'PENDING', attempts: { increment: 1 } },
        });
        reset++;
      }
    }
    return { reset, failed };
  }

  async pendingByDevice(deviceId?: string) {
    return this.prisma.task.findMany({
      where: { status: { in: ['PENDING', 'IN_PROGRESS'] }, ...(deviceId ? { deviceId } : {}) },
      orderBy: { createdAt: 'asc' },
    });
  }
}
