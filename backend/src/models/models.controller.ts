import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ModelsService } from './models.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Models')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/models')
export class ModelsController {
  constructor(private modelsService: ModelsService) {}

  @Get()
  findAll(@CurrentUser('tenantId') tenantId: string, @Query() query: any) {
    return this.modelsService.findAll(tenantId, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.modelsService.findOne(id);
  }

  @Roles(Role.ADMIN, Role.TECHNICIAN)
  @Post()
  create(@Body() data: any, @CurrentUser('tenantId') tenantId: string) {
    return this.modelsService.create(data, tenantId);
  }

  @Roles(Role.ADMIN, Role.TECHNICIAN)
  @Put(':id')
  update(@Param('id') id: string, @Body() data: any) {
    return this.modelsService.update(id, data);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.modelsService.remove(id);
  }
}
