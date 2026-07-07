import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class ConfigService {
  private readonly logger = new Logger(ConfigService.name);
  private cache: Map<string, Record<string, string>> = new Map();

  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string, category?: string) {
    const where: any = { tenantId };
    if (category) where.category = category;
    return this.prisma.config.findMany({ where, orderBy: { key: 'asc' } });
  }

  async findOne(id: string) {
    return this.prisma.config.findUnique({ where: { id } });
  }

  async getByPrefix(tenantId: string, prefix: string): Promise<Record<string, string>> {
    const configs = await this.prisma.config.findMany({
      where: { tenantId, key: { startsWith: prefix } },
    });
    const result: Record<string, string> = {};
    for (const c of configs) {
      const suffix = c.key.slice(prefix.length);
      result[suffix] = c.value;
    }
    return result;
  }

  async getValue(tenantId: string, key: string): Promise<string | null> {
    const cached = this.cache.get(tenantId)?.[key];
    if (cached !== undefined) return cached;

    const config = await this.prisma.config.findUnique({
      where: { key },
    });
    const value = config?.value || null;
    if (!this.cache.has(tenantId)) this.cache.set(tenantId, {});
    this.cache.get(tenantId)![key] = value || '';
    return value;
  }

  async setValue(tenantId: string, key: string, value: string, category?: string, description?: string) {
    const existing = await this.prisma.config.findUnique({ where: { key } });
    if (existing) {
      await this.prisma.config.update({
        where: { id: existing.id },
        data: { value, category, description },
      });
    } else {
      await this.prisma.config.create({
        data: { key, value, category: category || 'general', description, tenantId },
      });
    }
    if (!this.cache.has(tenantId)) this.cache.set(tenantId, {});
    this.cache.get(tenantId)![key] = value;
  }

  async delete(id: string) {
    const config = await this.prisma.config.findUnique({ where: { id } });
    if (config) {
      delete this.cache.get(config.tenantId)?.[config.key];
      await this.prisma.config.delete({ where: { id } });
    }
  }

  async seedDefaults(tenantId: string) {
    const defaults: Array<{ key: string; value: string; category: string; description: string }> = [
      { key: 'cwmp.auth', value: 'AUTH("alemnet", "bf2fef2d-4c7d-45ab-be80-2699d5eada11")', category: 'cwmp', description: 'CWMP authentication expression' },
      { key: 'acs.default.username', value: 'alemnet', category: 'general', description: 'Default ACS username for CPE provisioning' },
      { key: 'acs.default.password', value: 'bf2fef2d-4c7d-45ab-be80-2699d5eada11', category: 'general', description: 'Default ACS password for CPE provisioning' },
      { key: 'acs.public.url', value: process.env.ACS_PUBLIC_URL || 'http://179.51.184.205:7547', category: 'general', description: 'Public ACS URL for CPE to connect' },
      { key: 'cwmp.inform.interval', value: '300', category: 'cwmp', description: 'Default periodic inform interval in seconds' },
      { key: 'cwmp.connectionRequestTimeout', value: '2000', category: 'cwmp', description: 'Connection request timeout in ms' },
      { key: 'device.default.periodicInformEnable', value: 'true', category: 'device', description: 'Enable periodic inform by default' },
    ];

    for (const d of defaults) {
      const existing = await this.prisma.config.findUnique({ where: { key: d.key } });
      if (!existing) {
        await this.prisma.config.create({ data: { ...d, tenantId } });
        this.logger.log(`Seeded config: ${d.key} = ${d.value}`);
      }
    }
  }
}
