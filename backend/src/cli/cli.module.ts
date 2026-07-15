import { Module } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { DiscoveryEngineModule } from '../discovery-engine/discovery-engine.module';
import { TasksModule } from '../tasks/tasks.module';
import { ScriptsModule } from '../scripts/scripts.module';
import { DeviceInspectCommand } from './commands/device-inspect.command';
import { DeviceRefreshCommand } from './commands/device-refresh.command';
import { TasksPendingCommand } from './commands/tasks-pending.command';
import { TasksResetStuckCommand } from './commands/tasks-reset-stuck.command';
import { ModelUnsupportedCommand } from './commands/model-unsupported.command';
import { ModelInspectCommand } from './commands/model-inspect.command';
import { ProvisionExecuteCommand } from './commands/provision-execute.command';

@Module({
  imports: [DiscoveryEngineModule, TasksModule, ScriptsModule],
  providers: [
    PrismaService,
    DeviceInspectCommand,
    DeviceRefreshCommand,
    TasksPendingCommand,
    TasksResetStuckCommand,
    ModelUnsupportedCommand,
    ModelInspectCommand,
    ProvisionExecuteCommand,
  ],
})
export class CliModule {}
