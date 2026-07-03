import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TenantService } from './tenant.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Tenant')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/tenant')
export class TenantController {
  constructor(private tenantService: TenantService) {}

  @Roles(Role.ADMIN)
  @Get('settings')
  getSettings(@CurrentUser('tenantId') tenantId: string) {
    return this.tenantService.getSettings(tenantId);
  }

  @Roles(Role.ADMIN)
  @Patch('settings')
  updateSettings(
    @CurrentUser('tenantId') tenantId: string,
    @Body() body: { acsUsername: string; acsPassword: string },
  ) {
    return this.tenantService.updateAcsCredentials(tenantId, body.acsUsername, body.acsPassword);
  }

  @Roles(Role.ADMIN)
  @Patch('acs-settings')
  updateAcsSettings(
    @CurrentUser('tenantId') tenantId: string,
    @Body() body: { acsPublicUrl?: string; connectionRequestEnabled?: boolean },
  ) {
    return this.tenantService.updateAcsSettings(tenantId, body);
  }

  @Roles(Role.ADMIN)
  @Patch('wifi-config')
  updateWiFiConfig(
    @CurrentUser('tenantId') tenantId: string,
    @Body() body: { ssid?: string; password?: string },
  ) {
    return this.tenantService.updateWiFiConfig(tenantId, body);
  }

  @Roles(Role.ADMIN)
  @Patch('default-scripts')
  updateDefaultScripts(
    @CurrentUser('tenantId') tenantId: string,
    @Body() body: { scripts: Array<{ name: string; params: Record<string, string> }> },
  ) {
    return this.tenantService.updateDefaultScripts(tenantId, body);
  }
}
