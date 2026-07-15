import { Command, CommandRunner } from 'nest-commander';
import { PrismaService } from '../../common/prisma.service';

@Command({ name: 'device:inspect', description: 'Mostra status, parâmetros e tasks de um device' })
export class DeviceInspectCommand extends CommandRunner {
  constructor(private prisma: PrismaService) {
    super();
  }

  async run(passedParams: string[]): Promise<void> {
    const [serial] = passedParams;
    if (!serial) {
      console.error('Uso: pnpm cli device:inspect <serial>');
      return;
    }

    const device = await this.prisma.device.findUnique({
      where: { serial },
      include: { model: true, tasks: { orderBy: { createdAt: 'desc' }, take: 10 } },
    });

    if (!device) {
      console.error(`Device com serial "${serial}" não encontrado`);
      return;
    }

    const params = (device.parameters as Record<string, string>) || {};
    const discovered = (device.discoveredPaths as string[]) || [];

    const unsupported = (device.model?.unsupportedParameters as string[]) || [];

    console.log(`\n=== ${device.serial} (${device.manufacturer} ${device.modelName}) ===`);
    console.log(`Status: ${device.status} | Último Inform: ${device.lastContact}`);
    console.log(`Modelo: ${device.model?.name ?? '(nenhum)'} | dataModel: ${device.model?.dataModel ?? '-'}`);
    console.log(`Homologação: ${device.model?.homologationStatus ?? '-'}`);
    console.log(`Parâmetros em cache: ${Object.keys(params).length} | Paths descobertos: ${discovered.length}`);
    console.log(`Unsupported paths: ${unsupported.length}`);
    if (unsupported.length > 0) {
      for (const p of unsupported.slice(0, 10)) {
        console.log(`  ✗ ${p}`);
      }
      if (unsupported.length > 10) console.log(`  ... e mais ${unsupported.length - 10}`);
    }
    console.log(`\n--- Últimas 10 tasks ---`);
    for (const t of device.tasks) {
      const err = t.error ? ` err=${t.error.slice(0, 60)}` : '';
      console.log(`[${t.status}] ${t.type} (${t.attempts}/${t.maxAttempts})${err} — ${t.createdAt.toISOString()}`);
    }
  }
}
