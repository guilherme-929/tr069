import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ScriptsService, ScriptAction } from './scripts.service';
import { ConfigService } from '../system-config/config.service';
import * as vm from 'vm';

export type DeclareOpts = {
  path: string;
  timestamps?: Record<string, number>;
  values?: Record<string, any>;
};

export type ProvisionContext = {
  deviceId: string;
  serial: string;
  tenantId: string;
  modelName: string;
  manufacturer: string;
  eventCodes: string[];
  cachedParams: Record<string, string>;
  discoveredPaths: string[];
  tags: string[];
};

@Injectable()
export class ProvisionsEngineService {
  private readonly logger = new Logger(ProvisionsEngineService.name);

  constructor(
    private prisma: PrismaService,
    private scriptsService: ScriptsService,
    private configService: ConfigService,
  ) {}

  async executeProvisionScript(
    scriptName: string,
    deviceId: string,
    tenantId: string,
    ctx?: Partial<ProvisionContext>,
  ): Promise<any> {
    const script = await this.prisma.script.findUnique({ where: { name: scriptName } });
    if (!script) {
      this.logger.warn(`Provision "${scriptName}" not found`);
      return { status: 'FAILED', error: 'Script not found' };
    }
    if (!script.enabled) {
      this.logger.warn(`Provision "${scriptName}" is disabled`);
      return { status: 'SKIPPED', error: 'Script disabled' };
    }

    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      include: { model: true },
    });
    if (!device) return { status: 'FAILED', error: 'Device not found' };

    const context = this.buildContext(device, ctx);

    if (script.script) {
      return this.executeJsProvision(script, context);
    }

    if (script.actions && Array.isArray(script.actions)) {
      return this.executeActionProvision(script, context);
    }

    return { status: 'COMPLETED', message: 'No script or actions defined' };
  }

  private buildContext(device: any, ctx?: Partial<ProvisionContext>): ProvisionContext {
    const params = (device.parameters as Record<string, any>) || {};
    const discovered = params.__discovered__ || {};
    return {
      deviceId: device.id,
      serial: device.serial,
      tenantId: device.tenantId,
      modelName: device.modelName,
      manufacturer: device.manufacturer || '',
      eventCodes: ctx?.eventCodes || [],
      cachedParams: Object.fromEntries(
        Object.entries(params).filter(([k]) => !k.startsWith('__')),
      ) as Record<string, string>,
      discoveredPaths: discovered._leaves || [],
      tags: device.tags || [],
      ...ctx,
    };
  }

  private async executeJsProvision(script: any, ctx: ProvisionContext): Promise<any> {
    const execution = await this.prisma.scriptExecution.create({
      data: {
        scriptId: script.id,
        scriptName: script.name,
        deviceId: ctx.deviceId,
        status: 'PENDING',
        tenantId: ctx.tenantId,
      },
    });

    const sandbox = this.createSandbox(ctx);
    try {
      const vmScript = new vm.Script(script.script, {
        filename: `provision-${script.name}.js`,
      });

      vmScript.runInNewContext(sandbox, { timeout: 30000 });

      const tasks = await this.commitDeclarations(ctx);
      const hasError = tasks.some((t) => t.status === 'FAILED');
      const status = hasError ? 'FAILED' : 'COMPLETED';

      await this.prisma.scriptExecution.update({
        where: { id: execution.id },
        data: {
          status,
          result: { tasks, logs: sandbox._logs } as any,
        },
      });

      return { status, tasks, logs: sandbox._logs };
    } catch (err: any) {
      this.logger.error(`Provision "${script.name}" execution error: ${err.message}`);
      await this.prisma.scriptExecution.update({
        where: { id: execution.id },
        data: { status: 'FAILED', error: err.message },
      });
      return { status: 'FAILED', error: err.message };
    }
  }

  private async executeActionProvision(script: any, ctx: ProvisionContext): Promise<any> {
    const execution = await this.prisma.scriptExecution.create({
      data: {
        scriptId: script.id,
        scriptName: script.name,
        deviceId: ctx.deviceId,
        status: 'PENDING',
        tenantId: ctx.tenantId,
      },
    });

    const results: any[] = [];
    let hasError = false;

    for (const action of script.actions as ScriptAction[]) {
      try {
        await this.scriptsService['executeAction'](action, ctx.deviceId, ctx.tenantId);
        results.push({ action, status: 'COMPLETED' });
      } catch (err: any) {
        hasError = true;
        results.push({ action, status: 'FAILED', error: err.message });
      }
    }

    await this.prisma.scriptExecution.update({
      where: { id: execution.id },
      data: {
        status: hasError ? 'FAILED' : 'COMPLETED',
        result: results as any,
      },
    });

    return { status: hasError ? 'FAILED' : 'COMPLETED', results };
  }

  private createSandbox(ctx: ProvisionContext): any {
    const pendingDeclarations: DeclareOpts[] = [];
    const logs: string[] = [];

    const declare = (path: string, timestamps?: Record<string, number>, values?: Record<string, any>) => {
      pendingDeclarations.push({ path, timestamps, values });

      const matches = this.matchWildcardPath(path, ctx);
      return {
        size: matches.length,
        value: matches.length > 0 ? ctx.cachedParams[matches[0]] : undefined,
        [Symbol.iterator]: function* () {
          for (const p of matches) {
            yield { path: p, value: ctx.cachedParams[p] };
          }
        },
      };
    };

    const clear = (path: string, timestamp?: number) => {
      this.logger.log(`[PROVISION] clear("${path}")`);
      pendingDeclarations.push({ path, timestamps: { path: timestamp || Date.now() } });
    };

    const commit = async () => {
      return this.commitDeclarations(ctx);
    };

    const log = (message: string) => {
      logs.push(message);
      this.logger.log(`[PROVISION:${ctx.serial}] ${message}`);
    };

    return {
      declare,
      clear,
      commit,
      log,
      args: [],
      now: Date.now(),
      _logs: logs,
      _pendingDeclarations: pendingDeclarations,
    };
  }

  private matchWildcardPath(pattern: string, ctx: ProvisionContext): string[] {
    if (!pattern.includes('*') && !pattern.includes('[')) {
      if (ctx.discoveredPaths.includes(pattern)) return [pattern];
      if (pattern in ctx.cachedParams) return [pattern];
      return [];
    }

    const regexStr = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '[^.]+')
      .replace(/\[/g, '[')
      .replace(/\]/g, ']');
    const regex = new RegExp(`^${regexStr}$`);

    return ctx.discoveredPaths.filter((p) => regex.test(p));
  }

  private async commitDeclarations(ctx: ProvisionContext): Promise<any[]> {
    const tasks: any[] = [];
    const model = await this.prisma.device.findUnique({
      where: { id: ctx.deviceId },
      select: { modelId: true, parameters: true },
    });
    const unsupported = new Set<string>();
    if (model?.modelId) {
      const m = await this.prisma.deviceModel.findUnique({ where: { id: model.modelId } });
      if (m) {
        for (const p of (m.unsupportedParameters as string[]) || []) unsupported.add(p);
      }
    }

    const now = Date.now();
    const params = (model?.parameters as Record<string, string>) || {};

    return tasks;
  }
}
