import { Controller, Get, Param, Patch, Delete, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DevicesService } from './devices.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Devices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/devices')
export class DevicesController {
  constructor(private devicesService: DevicesService) {}

  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: any,
  ) {
    return this.devicesService.findAll(tenantId, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.devicesService.findOne(id);
  }

  @Get(':id/history')
  getHistory(@Param('id') id: string) {
    return this.devicesService.getDeviceHistory(id);
  }

  @Roles(Role.ADMIN, Role.TECHNICIAN)
  @Patch(':id')
  update(@Param('id') id: string, @Query() data: any) {
    return this.devicesService.update(id, data);
  }

  @Roles(Role.ADMIN, Role.TECHNICIAN)
  @Patch(':id/acs-config')
  updateAcsConfig(
    @Param('id') id: string,
    @Body() body: {
      connectionRequestUrl?: string;
      connectionRequestUsername?: string;
      connectionRequestPassword?: string;
      acsPublicUrlOverride?: string;
    },
  ) {
    return this.devicesService.updateAcsConfig(id, body);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.devicesService.remove(id);
  }

  @Roles(Role.ADMIN, Role.TECHNICIAN)
  @Get(':id/virtual-params')
  getVirtualParams(@Param('id') id: string) {
    return this.devicesService.getVirtualParameters(id);
  }

  @Roles(Role.ADMIN, Role.TECHNICIAN)
  @Get(':id/connected-devices')
  getConnectedDevices(@Param('id') id: string) {
    return this.devicesService.getConnectedDevices(id);
  }
}
