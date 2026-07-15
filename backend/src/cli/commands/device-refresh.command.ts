import { Command, CommandRunner, Option } from 'nest-commander';
import { PrismaService } from '../../common/prisma.service';
import { DeclareService } from '../../discovery-engine/declare.service';

interface RefreshOptions {
  maxAge?: number;
}

@Command({ name: 'device:refresh', description: 'Equivalente ao declare() do GenieACS: pede um path do CPE de forma segura' })
export class DeviceRefreshCommand extends CommandRunner {
  constructor(
    private prisma: PrismaService,
    private declareService: DeclareService,
  ) {
    super();
  }

  @Option({ flags: '--max-age <ms>', description: 'Idade máxima aceitável em ms antes de re-buscar (default 3600000)' })
  parseMaxAge(val: string): number {
    return parseInt(val, 10);
  }

  async run(passedParams: string[], options: RefreshOptions): Promise<void> {
    const [serial, path] = passedParams;
    if (!serial || !path) {
      console.error('Uso: pnpm cli device:refresh <serial> "<path ou path.*>" [--max-age 3600000]');
      return;
    }

    const device = await this.prisma.device.findUnique({ where: { serial } });
    if (!device) {
      console.error(`Device "${serial}" não encontrado`);
      return;
    }

    const result = await this.declareService.declare(device.id, path, { maxAgeMs: options.maxAge });
    console.log(result);
  }
}
