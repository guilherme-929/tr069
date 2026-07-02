import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ProvisioningService } from './provisioning.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Provisioning')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/provisioning')
export class ProvisioningController {
  constructor(private provisioningService: ProvisioningService) {}

  @Roles(Role.ADMIN, Role.TECHNICIAN)
  @Post('device/:id')
  provisionDevice(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string,
    @Body() body: any,
  ) {
    return this.provisioningService.provisionDevice(id, tenantId, body?.template);
  }

  @Roles(Role.ADMIN, Role.TECHNICIAN)
  @Post('bulk')
  bulkProvision(
    @Body() body: { deviceIds: string[] },
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.provisioningService.bulkProvision(body.deviceIds, tenantId);
  }

  @Roles(Role.ADMIN, Role.TECHNICIAN)
  @Get('templates')
  getTemplates(@CurrentUser('tenantId') tenantId: string) {
    return this.provisioningService.getTemplates(tenantId);
  }

  @Get('tasks')
  getTasks(@CurrentUser('tenantId') tenantId: string, @Query() query: any) {
    return this.provisioningService.getTasks(tenantId, query);
  }
}
