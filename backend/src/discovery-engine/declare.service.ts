import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

export type DeclareResult = {
  status: 'cached' | 'refresh_scheduled' | 'discovery_scheduled' | 'unsupported';
  path: string;
  value?: string;
  taskId?: string;
};

@Injectable()
export class DeclareService {
  private readonly logger = new Logger(DeclareService.name);

  constructor(private prisma: PrismaService) {}

  async declare(
    deviceId: string,
    path: string,
    opts: { maxAgeMs?: number } = {},
  ): Promise<DeclareResult> {
    const maxAgeMs = opts.maxAgeMs ?? 3600_000;

    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) throw new Error(`Device ${deviceId} not found`);

    if (device.modelId) {
      const model = await this.prisma.deviceModel.findUnique({ where: { id: device.modelId } });
      const unsupported = (model?.unsupportedParameters as string[]) || [];
      if (this.matchesAny(path, unsupported)) {
        this.logger.debug(`[DECLARE] ${path} marcado como unsupported para modelo ${model?.name} — pulando`);
        return { status: 'unsupported', path };
      }
    }

    const discovered = (device.discoveredPaths as string[]) || [];
    const isWildcard = path.includes('*');

    if (!isWildcard && discovered.includes(path)) {
      const meta = (device.parameterMeta as Record<string, string>) || {};
      const fetchedAt = meta[path] ? new Date(meta[path]).getTime() : 0;
      const isFresh = Date.now() - fetchedAt < maxAgeMs;

      if (isFresh) {
        const params = (device.parameters as Record<string, string>) || {};
        return { status: 'cached', path, value: params[path] };
      }

      const task = await this.createTask(device.id, device.tenantId, 'GetParameterValues', {
        parameterPaths: [path],
      });
      return { status: 'refresh_scheduled', path, taskId: task.id };
    }

    const scopePrefix = this.parentPrefix(path);
    const task = await this.createTask(device.id, device.tenantId, 'GetParameterNames', {
      parameterPath: scopePrefix,
      nextLevel: false,
    });
    this.logger.log(`[DECLARE] ${path} desconhecido — disparando discovery em ${scopePrefix} (task ${task.id})`);
    return { status: 'discovery_scheduled', path, taskId: task.id };
  }

  async recordDiscovery(deviceId: string, paths: string[]): Promise<void> {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) return;
    const current = new Set((device.discoveredPaths as string[]) || []);
    for (const p of paths) current.add(p);
    await this.prisma.device.update({
      where: { id: deviceId },
      data: { discoveredPaths: Array.from(current) },
    });
  }

  async recordValues(deviceId: string, values: Record<string, string>): Promise<void> {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) return;
    const currentParams = (device.parameters as Record<string, any>) || {};
    const currentMeta = (device.parameterMeta as Record<string, string>) || {};
    const now = new Date().toISOString();
    for (const [path, value] of Object.entries(values)) {
      currentParams[path] = value;
      currentMeta[path] = now;
    }
    await this.prisma.device.update({
      where: { id: deviceId },
      data: { parameters: currentParams, parameterMeta: currentMeta },
    });
  }

  async markUnsupported(deviceId: string, paths: string[]): Promise<void> {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device?.modelId) return;
    const model = await this.prisma.deviceModel.findUnique({ where: { id: device.modelId } });
    if (!model) return;
    const current = new Set((model.unsupportedParameters as string[]) || []);
    for (const p of paths) current.add(p);
    await this.prisma.deviceModel.update({
      where: { id: model.id },
      data: { unsupportedParameters: Array.from(current) },
    });
    this.logger.warn(`[DECLARE] Modelo ${model.name}: marcando ${paths.length} path(s) como unsupported (Fault 9005)`);
  }

  private async createTask(deviceId: string, tenantId: string, type: string, payload: any) {
    return this.prisma.task.create({
      data: { deviceId, tenantId, type, status: 'PENDING', payload },
    });
  }

  private parentPrefix(path: string): string {
    const idx = path.indexOf('*');
    const trimmed = idx === -1 ? path : path.slice(0, idx);
    return trimmed.replace(/\.$/, '');
  }

  private matchesAny(path: string, patterns: string[]): boolean {
    return patterns.some((p) => path === p || path.startsWith(p.replace(/\*$/, '')));
  }
}
