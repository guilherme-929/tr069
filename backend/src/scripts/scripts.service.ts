import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

export interface ScriptAction {
  type: 'setParameter' | 'getParameter' | 'setTag' | 'clearTag' | 'log' | 'clear' | 'reboot' | 'download';
  path?: string;
  value?: any;
  tag?: string;
  message?: string;
}

export interface ActionResult {
  action: ScriptAction;
  status: 'COMPLETED' | 'FAILED' | 'SKIPPED';
  error?: string;
}

@Injectable()
export class ScriptsService {
  private readonly logger = new Logger(ScriptsService.name);

  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.script.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      include: {
        executions: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { id: true, deviceId: true, status: true, error: true, createdAt: true },
        },
      },
    });
  }

  async findOne(id: string) {
    return this.prisma.script.findUnique({
      where: { id },
      include: {
        executions: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { device: { select: { serial: true, modelName: true } } },
        },
      },
    });
  }

  async findByName(name: string) {
    return this.prisma.script.findUnique({ where: { name } });
  }

  async create(data: {
    name: string;
    type?: string;
    channel?: string;
    precondition?: string;
    script?: string;
    actions?: any;
    tenantId: string;
  }) {
    return this.prisma.script.create({ data });
  }

  async update(id: string, data: any) {
    return this.prisma.script.update({ where: { id }, data });
  }

  async delete(id: string) {
    return this.prisma.script.delete({ where: { id } });
  }

  async getScriptsForChannel(tenantId: string, channel: string) {
    return this.prisma.script.findMany({
      where: { tenantId, channel, enabled: true, type: 'provision' },
    });
  }

  async getPresetsForChannel(tenantId: string, channel: string) {
    return this.prisma.script.findMany({
      where: { tenantId, channel, enabled: true, type: 'preset' },
      orderBy: { name: 'asc' },
    });
  }

  async getExecutions(tenantId: string, deviceId?: string, scriptId?: string, limit = 50) {
    const where: any = { tenantId };
    if (deviceId) where.deviceId = deviceId;
    if (scriptId) where.scriptId = scriptId;
    return this.prisma.scriptExecution.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        device: { select: { serial: true, modelName: true } },
        script: { select: { name: true, channel: true } },
      },
    });
  }

  evaluatePrecondition(precondition: string | null, device: any): boolean {
    if (!precondition) return true;
    try {
      const params = (device.parameters as Record<string, string>) || {};
      const tags: string[] = device.tags || [];

      const expressions = precondition.split(' AND ').map(e => e.trim());
      for (const expr of expressions) {
        if (!this.evaluateSingleCondition(expr, params, tags)) return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  private evaluateSingleCondition(expr: string, params: Record<string, string>, tags: string[]): boolean {
    const tagMatch = expr.match(/Tags\.(\S+)\s+IS\s+NOT\s+NULL/i);
    if (tagMatch) {
      const tagName = tagMatch[1].toLowerCase();
      return tags.some(t => t.toLowerCase() === tagName);
    }

    const tagNullMatch = expr.match(/Tags\.(\S+)\s+IS\s+NULL/i);
    if (tagNullMatch) {
      const tagName = tagNullMatch[1].toLowerCase();
      return !tags.some(t => t.toLowerCase() === tagName);
    }

    const paramEqMatch = expr.match(/(\S+)\s*=\s*"([^"]+)"/);
    if (paramEqMatch) {
      const paramPath = paramEqMatch[1];
      const expected = paramEqMatch[2];
      const actual = params[paramPath];
      return actual === expected;
    }

    const paramNeqMatch = expr.match(/(\S+)\s*<>\s*"([^"]+)"/);
    if (paramNeqMatch) {
      const paramPath = paramNeqMatch[1];
      const expected = paramNeqMatch[2];
      const actual = params[paramPath];
      return actual !== expected;
    }

    if (expr.includes(' OR ')) {
      const parts = expr.split(' OR ').map(e => e.trim());
      return parts.some(p => this.evaluateSingleCondition(p, params, tags));
    }

    return true;
  }

  async executePresets(tenantId: string, deviceId: string, channel: string, device: any) {
    const presets = await this.getPresetsForChannel(tenantId, channel);
    for (const preset of presets) {
      if (!this.evaluatePrecondition(preset.precondition, device)) continue;
      const provisionName = preset.script;
      if (!provisionName) {
        this.logger.warn(`Preset "${preset.name}" has no provision target`);
        continue;
      }
      this.logger.log(`Preset "${preset.name}" → executing provision "${provisionName}" for device ${deviceId}`);
      await this.executeScriptByName(provisionName, deviceId, tenantId);
    }
  }

  async executeScript(scriptId: string, deviceId: string, tenantId: string) {
    const script = await this.prisma.script.findUnique({ where: { id: scriptId } });
    if (!script || !script.enabled) return;

    this.logger.log(`Executing script "${script.name}" for device ${deviceId}`);

    const execution = await this.prisma.scriptExecution.create({
      data: {
        scriptId: script.id,
        scriptName: script.name,
        deviceId,
        status: 'PENDING',
        tenantId,
      },
    });

    if (!script.actions || !Array.isArray(script.actions)) {
      await this.prisma.scriptExecution.update({
        where: { id: execution.id },
        data: { status: 'COMPLETED', result: [] },
      });
      return;
    }

    const results: ActionResult[] = [];
    let hasError = false;

    for (const action of script.actions as unknown as ScriptAction[]) {
      try {
        await this.executeAction(action, deviceId, tenantId);
        results.push({ action, status: 'COMPLETED' });
      } catch (err: any) {
        hasError = true;
        const errorMsg = err.message || 'Unknown error';
        this.logger.error(`Script "${script.name}" action failed: ${errorMsg}`);
        results.push({ action, status: 'FAILED', error: errorMsg });
      }
    }

    await this.prisma.scriptExecution.update({
      where: { id: execution.id },
      data: {
        status: hasError ? 'FAILED' : 'COMPLETED',
        result: results as any,
        error: hasError ? `${results.filter(r => r.status === 'FAILED').length} of ${results.length} actions failed` : null,
      },
    });

    await this.prisma.log.create({
      data: {
        action: 'SCRIPT_EXECUTION',
        entity: 'DEVICE',
        entityId: deviceId,
        detail: `Script "${script.name}" ${hasError ? 'FAILED' : 'COMPLETED'}: ${results.filter(r => r.status === 'COMPLETED').length}/${results.length} actions ok`,
        deviceId,
        tenantId,
      },
    });
  }

  async executeScriptByName(name: string, deviceId: string, tenantId: string) {
    const script = await this.prisma.script.findUnique({ where: { name } });
    if (!script || !script.enabled) {
      this.logger.warn(`Provision "${name}" not found or disabled`);
      return;
    }
    await this.executeScript(script.id, deviceId, tenantId);
  }

  private async executeAction(action: ScriptAction, deviceId: string, tenantId: string) {
    switch (action.type) {
      case 'log':
        this.logger.log(`[Script] ${action.message}`);
        break;

      case 'setParameter':
        await this.createSetParamTask(deviceId, action.path!, action.value, tenantId);
        break;

      case 'getParameter':
        await this.createGetParamTask(deviceId, action.path!, tenantId);
        break;

      case 'setTag':
        await this.setDeviceTag(deviceId, action.tag!, true);
        break;

      case 'clearTag':
        await this.setDeviceTag(deviceId, action.tag!, false);
        break;

      default:
        this.logger.warn(`Unknown script action type: ${action.type}`);
    }
  }

  private async createGetParamTask(deviceId: string, path: string, tenantId: string) {
    if (!path) return;

    // If device has discovered parameter tree, match script path against
    // discovered leaves to avoid requesting paths that don't exist.
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    const allParams = (device?.parameters as Record<string, any>) || {};
    const discovered = allParams.__discovered__ || {};
    const discoveredLeaves: string[] = discovered._leaves || [];

    let names: string[] = [];
    if (path.includes('*') && discoveredLeaves.length > 0) {
      // Use discovered leaves that match the path pattern (replace * with .* for regex)
      const regex = new RegExp('^' + path.replace(/\./g, '\\.').replace(/\*/g, '[^.]*') + '$');
      names = discoveredLeaves.filter(l => regex.test(l));
    } else if (path.includes('*')) {
      // No discovery yet, expand wildcards 1..8 as before
      for (let i = 1; i <= 8; i++) {
        names.push(path.replace(/\*/g, String(i)));
      }
    } else {
      // No wildcards, use as-is
      names.push(path);
    }

    if (names.length === 0) {
      this.logger.warn(`[createGetParamTask] No matching discovered params for path "${path}" on device ${deviceId}`);
      return;
    }

    const existingPending = await this.prisma.task.count({
      where: { deviceId, status: 'PENDING', type: 'GetParameterValues' },
    });

    if (existingPending < 50) {
      for (const name of names) {
        const dup = await this.prisma.task.count({
          where: { deviceId, status: 'PENDING', type: 'GetParameterValues', payload: { path: ['names'], equals: [name] } as any },
        });
        if (dup > 0) continue;
        await this.prisma.task.create({
          data: {
            deviceId,
            type: 'GetParameterValues',
            status: 'PENDING',
            payload: { names: [name] },
            tenantId,
          },
        });
      }
    }
  }

  private async createSetParamTask(deviceId: string, path: string, value: any, tenantId: string) {
    const existingPending = await this.prisma.task.count({
      where: { deviceId, status: 'PENDING', type: 'SetParameterValues' },
    });

    if (existingPending === 0) {
      await this.prisma.task.create({
        data: {
          deviceId,
          type: 'SetParameterValues',
          status: 'PENDING',
          payload: {
            params: [{ name: path, value: String(value) }],
          },
          tenantId,
        },
      });
    }
  }

  private async setDeviceTag(deviceId: string, tag: string, add: boolean) {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) return;

    const currentTags = device.tags || [];
    let newTags: string[];
    if (add) {
      if (!currentTags.includes(tag)) newTags = [...currentTags, tag];
      else newTags = currentTags;
    } else {
      newTags = currentTags.filter(t => t !== tag);
    }

    await this.prisma.device.update({
      where: { id: deviceId },
      data: { tags: newTags },
    });
  }
}
