import { Module } from '@nestjs/common';
import { TasksMaintenanceService } from './tasks-maintenance.service';
import { PrismaService } from '../common/prisma.service';

@Module({
  providers: [TasksMaintenanceService, PrismaService],
  exports: [TasksMaintenanceService],
})
export class TasksModule {}
