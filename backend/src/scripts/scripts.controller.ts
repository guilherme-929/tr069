import { Controller, Get, Post, Patch, Put, Delete, Param, Body, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ScriptsService } from './scripts.service';
import { ProvisionsEngineService } from './provisions-engine.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Scripts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class ScriptsController {
  constructor(
    private scriptsService: ScriptsService,
    private provisionsEngine: ProvisionsEngineService,
  ) {}

  // ─── Provisions (GenieACS-style) ───────────────────────────

  @Roles(Role.ADMIN, Role.TECHNICIAN)
  @Get('api/provisions')
  listProvisions(@CurrentUser('tenantId') tenantId: string) {
    return this.scriptsService.findAll(tenantId);
  }

  @Roles(Role.ADMIN, Role.TECHNICIAN)
  @Get('api/provisions/:name')
  getProvision(@Param('name') name: string) {
    return this.scriptsService.findByName(name);
  }

  @Roles(Role.ADMIN)
  @Put('api/provisions/:name')
  async createOrUpdateProvision(
    @Param('name') name: string,
    @CurrentUser('tenantId') tenantId: string,
    @Body() body: { script?: string; actions?: any; type?: string; channel?: string; precondition?: string },
  ) {
    const existing = await this.scriptsService.findByName(name);
    const data = {
      name,
      type: body.type || 'provision',
      channel: body.channel || 'inform',
      script: body.script,
      actions: body.actions,
      precondition: body.precondition,
      tenantId,
    };
    if (existing) {
      return this.scriptsService.update(existing.id, data);
    }
    return this.scriptsService.create(data);
  }

  @Roles(Role.ADMIN)
  @Delete('api/provisions/:name')
  async deleteProvision(@Param('name') name: string) {
    const script = await this.scriptsService.findByName(name);
    if (!script) return { message: 'Provision not found' };
    await this.scriptsService.delete(script.id);
    return { message: 'Provision deleted' };
  }

  // ─── Presets (GenieACS-style) ──────────────────────────────

  @Roles(Role.ADMIN, Role.TECHNICIAN)
  @Get('api/presets')
  listPresets(@CurrentUser('tenantId') tenantId: string) {
    return this.scriptsService.getPresetsForChannel(tenantId, '');
  }

  @Roles(Role.ADMIN)
  @Put('api/presets/:name')
  async createOrUpdatePreset(
    @Param('name') name: string,
    @CurrentUser('tenantId') tenantId: string,
    @Body() body: { script?: string; precondition?: string; channel?: string; weight?: number; actions?: any },
  ) {
    const existing = await this.scriptsService.findByName(name);
    const data = {
      name,
      type: 'preset',
      channel: body.channel || 'inform',
      script: body.script,
      precondition: body.precondition,
      actions: body.actions,
      tenantId,
    };
    if (existing) {
      return this.scriptsService.update(existing.id, data);
    }
    return this.scriptsService.create(data);
  }

  @Roles(Role.ADMIN)
  @Delete('api/presets/:name')
  async deletePreset(@Param('name') name: string) {
    const script = await this.scriptsService.findByName(name);
    if (!script) return { message: 'Preset not found' };
    await this.scriptsService.delete(script.id);
    return { message: 'Preset deleted' };
  }

  // ─── Execution ─────────────────────────────────────────────

  @Roles(Role.ADMIN, Role.TECHNICIAN)
  @Post('api/provisions/:name/execute')
  executeProvision(
    @Param('name') name: string,
    @CurrentUser('tenantId') tenantId: string,
    @Body() body: { deviceId: string; eventCodes?: string[] },
  ) {
    return this.provisionsEngine.executeProvisionScript(
      name,
      body.deviceId,
      tenantId,
      { eventCodes: body.eventCodes || [] },
    );
  }

  // ─── Traditional CRUD ──────────────────────────────────────

  @Roles(Role.ADMIN, Role.TECHNICIAN)
  @Get('api/scripts')
  findAll(
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.scriptsService.findAll(tenantId);
  }

  @Roles(Role.ADMIN, Role.TECHNICIAN)
  @Get('api/scripts/executions')
  getExecutions(
    @CurrentUser('tenantId') tenantId: string,
    @Query('deviceId') deviceId?: string,
    @Query('scriptId') scriptId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.scriptsService.getExecutions(tenantId, deviceId, scriptId, limit ? parseInt(limit) : 50);
  }

  @Roles(Role.ADMIN, Role.TECHNICIAN)
  @Get('api/scripts/:id')
  findOne(@Param('id') id: string) {
    return this.scriptsService.findOne(id);
  }

  @Roles(Role.ADMIN)
  @Post('api/scripts')
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
  @Patch('api/scripts/:id')
  update(
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.scriptsService.update(id, body);
  }

  @Roles(Role.ADMIN)
  @Delete('api/scripts/:id')
  delete(@Param('id') id: string) {
    return this.scriptsService.delete(id);
  }
}
