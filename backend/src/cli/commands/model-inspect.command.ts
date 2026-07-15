import { Command, CommandRunner } from 'nest-commander';
import { PrismaService } from '../../common/prisma.service';

@Command({
  name: 'model:inspect',
  arguments: '<manufacturer> <name>',
  description: 'Mostra detalhes de um modelo cadastrado',
})
export class ModelInspectCommand extends CommandRunner {
  constructor(private prisma: PrismaService) {
    super();
  }

  async run(args: string[]): Promise<void> {
    const [manufacturer, name] = args;

    const tenant = await this.prisma.tenant.findFirst({ where: { slug: 'default-isp' } })
      || await this.prisma.tenant.findFirst();
    if (!tenant) {
      console.error('No tenant found');
      return;
    }

    const model = await this.prisma.deviceModel.findFirst({
      where: { manufacturer, name, tenantId: tenant.id },
      include: { _count: { select: { devices: true, firmwares: true } } },
    });

    if (!model) {
      console.error(`Modelo "${manufacturer} / ${name}" não encontrado`);
      return;
    }

    const unsupported = (model.unsupportedParameters as string[]) || [];

    console.log(`\n=== ${model.manufacturer} ${model.name} ===`);
    console.log(`ID: ${model.id}`);
    console.log(`HW Version: ${model.hwVersion || 'N/A'}`);
    console.log(`Data Model: ${model.dataModel}`);
    console.log(`Dispositivos: ${model._count.devices}`);
    console.log(`Firmwares: ${model._count.firmwares}`);
    console.log(`Homologação: ${model.homologationStatus}`);
    console.log(`Homologado em: ${model.homologatedAt?.toISOString() || 'N/A'}`);
    console.log(`\nUnsupported Parameters (${unsupported.length}):`);
    if (unsupported.length === 0) {
      console.log('  (nenhum — modelo compatível)');
    } else {
      for (const p of unsupported) {
        console.log(`  ✗ ${p}`);
      }
    }
  }
}
