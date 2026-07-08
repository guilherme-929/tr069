import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ScriptsService } from './scripts.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Scripts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/scripts')
export class ScriptsController {
  constructor(private scriptsService: ScriptsService) {}

  @Roles(Role.ADMIN, Role.TECHNICIAN)
  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.scriptsService.findAll(tenantId);
  }

  @Roles(Role.ADMIN, Role.TECHNICIAN)
  @Get('executions')
  getExecutions(
    @CurrentUser('tenantId') tenantId: string,
    @Query('deviceId') deviceId?: string,
    @Query('scriptId') scriptId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.scriptsService.getExecutions(tenantId, deviceId, scriptId, limit ? parseInt(limit) : 50);
  }

  @Roles(Role.ADMIN, Role.TECHNICIAN)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.scriptsService.findOne(id);
  }

  @Roles(Role.ADMIN)
  @Post()
  create(
    @CurrentUser('tenantId') tenantId: string,
    @Body() body: {
      name: string;
      type?: string;
      channel?: string;
      precondition?: string;
      script?: string;
      actions?: any;
    },
  ) {
    return this.scriptsService.create({ ...body, tenantId });
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.scriptsService.update(id, body);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.scriptsService.delete(id);
  }
}
