import { Command, CommandRunner } from 'nest-commander';
import { TasksMaintenanceService } from '../../tasks/tasks-maintenance.service';

@Command({ name: 'tasks:reset-stuck', description: 'Reseta tasks travadas em IN_PROGRESS há mais de 30 min' })
export class TasksResetStuckCommand extends CommandRunner {
  constructor(private tasksMaintenance: TasksMaintenanceService) {
    super();
  }

  async run(): Promise<void> {
    const result = await this.tasksMaintenance.resetStuckTasks();
    console.log(`Resetadas para PENDING: ${result.reset} | Marcadas FAILED: ${result.failed}`);
  }
}
