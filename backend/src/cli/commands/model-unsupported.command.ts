import { Command, CommandRunner, Option } from 'nest-commander';
import { PrismaService } from '../../common/prisma.service';

@Command({
  name: 'model:unsupported',
  arguments: '<manufacturer> <name>',
  description: 'Gerencia paths unsupported de um modelo (listar/limpar/adicionar)',
})
export class ModelUnsupportedCommand extends CommandRunner {
  constructor(private prisma: PrismaService) {
    super();
  }

  @Option({
    flags: '--add <path>',
    description: 'Adiciona um path como unsupported',
  })
  parseAdd(val: string) {
    return val;
  }

  @Option({
    flags: '--clear',
    description: 'Limpa todos os unsupported paths',
  })
  parseClear() {
    return true;
  }

  @Option({
    flags: '--tenant <id>',
    description: 'Tenant ID (opcional)',
  })
  parseTenant(val: string) {
    return val;
  }

  async run(args: string[], options: { add?: string; clear?: boolean; tenant?: string }): Promise<void> {
    const [manufacturer, name] = args;
    const tenantId = options.tenant || (await this.resolveDefaultTenant());
    if (!tenantId) {
      console.error('No tenant found. Run seed first.');
      return;
    }

    const model = await this.prisma.deviceModel.findFirst({
      where: { manufacturer, name, tenantId },
    });

    if (!model) {
      console.log(`Model "${manufacturer} / ${name}" não encontrado.`);
      console.log('Crie com: POST /api/models');
      return;
    }

    if (options.clear) {
      await this.prisma.deviceModel.update({
        where: { id: model.id },
        data: { unsupportedParameters: [] },
      });
      console.log(`Unsupported parameters limpos para "${model.name}".`);
      return;
    }

    if (options.add) {
      const current = new Set((model.unsupportedParameters as string[]) || []);
      current.add(options.add);
      await this.prisma.deviceModel.update({
        where: { id: model.id },
        data: { unsupportedParameters: Array.from(current) },
      });
      console.log(`Path "${options.add}" adicionado como unsupported em "${model.name}".`);
      return;
    }

    const unsupported = (model.unsupportedParameters as string[]) || [];
    console.log(`\nModelo: ${model.manufacturer} / ${model.name}`);
    console.log(`HW Version: ${model.hwVersion || 'N/A'}`);
    console.log(`Data Model: ${model.dataModel}`);
    console.log(`Homologação: ${model.homologationStatus}`);
    console.log(`\nUnsupported Parameters (${unsupported.length}):`);
    if (unsupported.length === 0) {
      console.log('  (nenhum)');
    } else {
      for (const p of unsupported) {
        console.log(`  - ${p}`);
      }
    }
  }

  private async resolveDefaultTenant(): Promise<string | null> {
    const tenant = await this.prisma.tenant.findFirst({ where: { slug: 'default-isp' } })
      || await this.prisma.tenant.findFirst();
    return tenant?.id || null;
  }
}
