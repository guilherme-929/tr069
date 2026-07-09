import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class TenantService {
  constructor(private prisma: PrismaService) {}

  async getSettings(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true, name: true, slug: true,
        acsUsername: true, acsPassword: true,
        acsPublicUrl: true, connectionRequestEnabled: true,
        defaultWiFiConfig: true,
      },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async updateAcsCredentials(tenantId: string, acsUsername: string, acsPassword: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { acsUsername, acsPassword },
      select: { id: true, name: true, slug: true, acsUsername: true },
    });
  }

  async updateAcsSettings(
    tenantId: string,
    data: { acsPublicUrl?: string; connectionRequestEnabled?: boolean },
  ) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(data.acsPublicUrl !== undefined && { acsPublicUrl: data.acsPublicUrl }),
        ...(data.connectionRequestEnabled !== undefined && { connectionRequestEnabled: data.connectionRequestEnabled }),
      },
      select: {
        id: true, name: true, slug: true,
        acsUsername: true, acsPublicUrl: true, connectionRequestEnabled: true,
      },
    });
  }

  async updateWiFiConfig(
    tenantId: string,
    data: {
      ssid?: string;
      password?: string;
      ssid2g?: string;
      password2g?: string;
      ssid5g?: string;
      password5g?: string;
    },
  ) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const currentConfig = (tenant.defaultWiFiConfig as Record<string, any>) || {};
    const newConfig = {
      ...currentConfig,
      ...(data.ssid !== undefined && { ssid: data.ssid }),
      ...(data.password !== undefined && { password: data.password }),
      ...(data.ssid2g !== undefined && { ssid2g: data.ssid2g }),
      ...(data.password2g !== undefined && { password2g: data.password2g }),
      ...(data.ssid5g !== undefined && { ssid5g: data.ssid5g }),
      ...(data.password5g !== undefined && { password5g: data.password5g }),
    };

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { defaultWiFiConfig: newConfig },
      select: {
        id: true, name: true, slug: true,
        defaultWiFiConfig: true,
      },
    });
  }

}
