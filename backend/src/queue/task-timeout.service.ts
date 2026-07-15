import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class TaskTimeoutService {
  private readonly logger = new Logger(TaskTimeoutService.name);

  private static readonly STUCK_THRESHOLD_MIN = 30;
  private static readonly MAX_RETRIES = 5;
  private static readonly BATCH_SIZE = 100;

  constructor(private prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleStuckTasks(): Promise<void> {
    this.logger.log('Task timeout sweep started');

    const threshold = new Date(Date.now() - TaskTimeoutService.STUCK_THRESHOLD_MIN * 60 * 1000);
    let affected = 0;

    const stuckTasks = await this.prisma.task.findMany({
      where: {
        status: 'IN_PROGRESS',
        updatedAt: { lt: threshold },
      },
      take: TaskTimeoutService.BATCH_SIZE,
    });

    for (const task of stuckTasks) {
      const nextAttempt = task.attempts + 1;
      if (nextAttempt >= TaskTimeoutService.MAX_RETRIES) {
        await this.prisma.task.update({
          where: { id: task.id },
          data: {
            status: 'FAILED',
            error: `Max retries (${TaskTimeoutService.MAX_RETRIES}) exceeded. Last attempt timed out after ${TaskTimeoutService.STUCK_THRESHOLD_MIN}min.`,
          },
        });
      } else {
        await this.prisma.task.update({
          where: { id: task.id },
          data: {
            status: 'PENDING',
            attempts: nextAttempt,
          },
        });
      }
      affected++;
    }

    if (affected > 0 || stuckTasks.length > 0) {
      this.logger.log(`Task timeout sweep complete: ${affected} tasks reset (${stuckTasks.length} found)`);
    }
  }
}
