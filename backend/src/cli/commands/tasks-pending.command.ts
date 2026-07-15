import { Command, CommandRunner } from 'nest-commander';
import { TasksMaintenanceService } from '../../tasks/tasks-maintenance.service';

@Command({ name: 'tasks:pending', description: 'Lista tasks PENDING/IN_PROGRESS, opcionalmente por device' })
export class TasksPendingCommand extends CommandRunner {
  constructor(private tasksMaintenance: TasksMaintenanceService) {
    super();
  }

  async run(passedParams: string[]): Promise<void> {
    const [deviceId] = passedParams;
    const tasks = await this.tasksMaintenance.pendingByDevice(deviceId);
    console.table(
      tasks.map((t) => ({ id: t.id, device: t.deviceId, type: t.type, status: t.status, attempts: t.attempts })),
    );
  }
}
