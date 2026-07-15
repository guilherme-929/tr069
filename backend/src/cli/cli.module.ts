import { Module } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { DiscoveryEngineModule } from '../discovery-engine/discovery-engine.module';
import { TasksModule } from '../tasks/tasks.module';
import { DeviceInspectCommand } from './commands/device-inspect.command';
import { DeviceRefreshCommand } from './commands/device-refresh.command';
import { TasksPendingCommand } from './commands/tasks-pending.command';
import { TasksResetStuckCommand } from './commands/tasks-reset-stuck.command';

@Module({
  imports: [DiscoveryEngineModule, TasksModule],
  providers: [
    PrismaService,
    DeviceInspectCommand,
    DeviceRefreshCommand,
    TasksPendingCommand,
    TasksResetStuckCommand,
  ],
})
export class CliModule {}
