import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FirmwareService } from './firmware.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Firmware')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/firmware')
export class FirmwareController {
  constructor(private firmwareService: FirmwareService) {}

  @Get()
  findAll(@CurrentUser('tenantId') tenantId: string, @Query() query: any) {
    return this.firmwareService.findAll(tenantId, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.firmwareService.findOne(id);
  }

  @Roles(Role.ADMIN, Role.TECHNICIAN)
  @Post()
  create(@Body() data: any, @CurrentUser('tenantId') tenantId: string) {
    return this.firmwareService.create(data, tenantId);
  }

  @Roles(Role.ADMIN, Role.TECHNICIAN)
  @Put(':id')
  update(@Param('id') id: string, @Body() data: any) {
    return this.firmwareService.update(id, data);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.firmwareService.remove(id);
  }
}
