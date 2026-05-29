import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AlertsService } from './alerts.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Alerts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/alerts')
export class AlertsController {
  constructor(private alertsService: AlertsService) {}

  @Get()
  findAll(@CurrentUser('tenantId') tenantId: string, @Query() query: any) {
    return this.alertsService.findAll(tenantId, query);
  }

  @Roles(Role.ADMIN, Role.TECHNICIAN)
  @Post(':id/resolve')
  resolve(@Param('id') id: string) {
    return this.alertsService.resolve(id);
  }
}
