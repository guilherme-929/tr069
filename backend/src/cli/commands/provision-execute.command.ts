import { Command, CommandRunner, Option } from 'nest-commander';
import { PrismaService } from '../../common/prisma.service';
import { ProvisionsEngineService } from '../../scripts/provisions-engine.service';

@Command({
  name: 'provision:execute',
  arguments: '<name> <deviceId>',
  description: 'Executa uma provision script em um device',
})
export class ProvisionExecuteCommand extends CommandRunner {
  constructor(
    private prisma: PrismaService,
    private provisionsEngine: ProvisionsEngineService,
  ) {
    super();
  }

  @Option({
    flags: '--event <codes>',
    description: 'Event codes (comma separated)',
  })
  parseEvent(val: string) {
    return val.split(',').map((s) => s.trim());
  }

  async run(args: string[], options: { event?: string[] }): Promise<void> {
    const [name, deviceId] = args;

    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) {
      console.error('Device not found');
      return;
    }

    console.log(`Executando provision "${name}" em ${device.serial} (${deviceId})...`);
    const result = await this.provisionsEngine.executeProvisionScript(
      name,
      deviceId,
      device.tenantId,
      { eventCodes: options.event || [] },
    );
    console.log(`Status: ${result.status}`);
    if (result.error) console.error(`Error: ${result.error}`);
    if (result.tasks) console.log(`Tasks: ${JSON.stringify(result.tasks, null, 2)}`);
    if (result.logs && result.logs.length > 0) {
      console.log('Logs:');
      for (const l of result.logs) console.log(`  ${l}`);
    }
  }
}
