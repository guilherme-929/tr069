import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ConfigService } from './config.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Config')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/config')
export class ConfigController {
  constructor(private configService: ConfigService) {}

  @Roles(Role.ADMIN, Role.TECHNICIAN)
  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Query('category') category?: string,
  ) {
    return this.configService.findAll(tenantId, category);
  }

  @Roles(Role.ADMIN)
  @Post()
  async create(
    @CurrentUser('tenantId') tenantId: string,
    @Body() body: { key: string; value: string; category?: string; description?: string },
  ) {
    await this.configService.setValue(tenantId, body.key, body.value, body.category, body.description);
    return { message: 'Config created' };
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  async update(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() body: { value?: string; category?: string; description?: string },
  ) {
    const config = await this.configService.findOne(id);
    if (!config) return { message: 'Not found' };
    if (body.value) await this.configService.setValue(tenantId, config.key, body.value, body.category, body.description);
    return { message: 'Config updated' };
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.configService.delete(id);
    return { message: 'Config deleted' };
  }

  @Roles(Role.ADMIN)
  @Post('seed')
  async seed(@CurrentUser('tenantId') tenantId: string) {
    await this.configService.seedDefaults(tenantId);
    return { message: 'Default configs seeded' };
  }
}
