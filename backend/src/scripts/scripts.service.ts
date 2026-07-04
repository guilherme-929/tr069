import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

export interface ScriptAction {
  type: 'setParameter' | 'getParameter' | 'setTag' | 'clearTag' | 'log' | 'clear' | 'reboot' | 'download';
  path?: string;
  value?: any;
  tag?: string;
  message?: string;
}

@Injectable()
export class ScriptsService {
  private readonly logger = new Logger(ScriptsService.name);

  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.script.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    return this.prisma.script.findUnique({ where: { id } });
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
      where: { tenantId, channel, enabled: true },
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
    // Tag condition: Tags.XXX IS NOT NULL OR Tags.xxx IS NOT NULL
    const tagMatch = expr.match(/Tags\.(\S+)\s+IS\s+NOT\s+NULL/i);
    if (tagMatch) {
      const tagName = tagMatch[1].toLowerCase();
      return tags.some(t => t.toLowerCase() === tagName);
    }

    // Tag negated condition: Tags.XXX IS NULL
    const tagNullMatch = expr.match(/Tags\.(\S+)\s+IS\s+NULL/i);
    if (tagNullMatch) {
      const tagName = tagNullMatch[1].toLowerCase();
      return !tags.some(t => t.toLowerCase() === tagName);
    }

    // Parameter condition: DeviceID.ProductClass = "value"
    const paramEqMatch = expr.match(/(\S+)\s*=\s*"([^"]+)"/);
    if (paramEqMatch) {
      const paramPath = paramEqMatch[1];
      const expected = paramEqMatch[2];
      const actual = params[paramPath];
      return actual === expected;
    }

    // Parameter inequality: param <> "value"
    const paramNeqMatch = expr.match(/(\S+)\s*<>\s*"([^"]+)"/);
    if (paramNeqMatch) {
      const paramPath = paramNeqMatch[1];
      const expected = paramNeqMatch[2];
      const actual = params[paramPath];
      return actual !== expected;
    }

    // OR condition
    if (expr.includes(' OR ')) {
      const parts = expr.split(' OR ').map(e => e.trim());
      return parts.some(p => this.evaluateSingleCondition(p, params, tags));
    }

    return true;
  }

  async executeScript(scriptId: string, deviceId: string, tenantId: string) {
    const script = await this.prisma.script.findUnique({ where: { id: scriptId } });
    if (!script || !script.enabled) return;

    this.logger.log(`Executing script "${script.name}" for device ${deviceId}`);

    if (script.actions && Array.isArray(script.actions)) {
      for (const action of script.actions as unknown as ScriptAction[]) {
        await this.executeAction(action, deviceId, tenantId);
      }
    }
  }

  private async executeAction(action: ScriptAction, deviceId: string, tenantId: string) {
    switch (action.type) {
      case 'log':
        this.logger.log(`[Script] ${action.message}`);
        break;

      case 'setParameter':
        await this.createSetParamTask(deviceId, action.path!, action.value, tenantId);
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
