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
}
