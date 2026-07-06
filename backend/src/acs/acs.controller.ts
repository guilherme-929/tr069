import { Controller, Post, Get, Put, Body, Param, UseGuards, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AcsService } from './acs.service';
import { CwmpService } from './cwmp.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { Role } from '@prisma/client';
import { Public } from '../auth/public.decorator';

@ApiTags('ACS')
@Controller()
export class AcsController {
  constructor(
    private acsService: AcsService,
    private cwmpService: CwmpService,
  ) {}

  @Public()
  @Post('cwmp')
  async handleCwmp(@Body() body: string, @Res() res: any) {
    const xmlResponse = await this.cwmpService.handleCwmp(body || '');
    res.type('text/xml').send(xmlResponse);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.TECHNICIAN)
  @Get('api/acs/stats')
  getStats(@CurrentUser('tenantId') tenantId: string) {
    return this.acsService.getDashboardStats(tenantId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.TECHNICIAN)
  @Post('api/devices/:id/connection-request')
  connectionRequest(@Param('id') id: string) {
    return this.acsService.sendConnectionRequest(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.TECHNICIAN)
  @Post('api/devices/:id/reboot')
  reboot(@Param('id') id: string) {
    return this.cwmpService.handleReboot(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.TECHNICIAN)
  @Post('api/devices/:id/reset')
  factoryReset(@Param('id') id: string) {
    return this.cwmpService.handleFactoryReset(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.TECHNICIAN)
  @Post('api/devices/:id/update')
  async updateFirmware(@Param('id') id: string) {
    return this.cwmpService.handleFirmwareUpdate(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.TECHNICIAN)
  @Post('api/devices/:id/download')
  download(
    @Param('id') id: string,
    @Body() data: { url: string; fileType?: string },
  ) {
    return this.cwmpService.handleDownload(id, data.url, data.fileType);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.TECHNICIAN)
  @Post('api/devices/:id/parameters')
  getParameters(@Param('id') id: string, @Body() body: { names: string[] }) {
    return this.cwmpService.handleGetParameterValues(id, body.names);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.TECHNICIAN)
  @Put('api/devices/:id/parameters')
  setParameters(
    @Param('id') id: string,
    @Body() body: { params: { name: string; value: string }[] },
  ) {
    return this.cwmpService.handleSetParameterValues(id, body.params);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.TECHNICIAN)
  @Post('api/devices/:id/wifi')
  setWiFi(
    @Param('id') id: string,
    @Body() body: { ssid: string; password: string },
  ) {
    return this.cwmpService.handleSetWiFiConfig(id, body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.TECHNICIAN)
  @Post('api/devices/:id/wifi/read')
  readWiFi(@Param('id') id: string) {
    return this.cwmpService.handleReadWiFiConfig(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.TECHNICIAN)
  @Post('api/devices/:id/fetch-all')
  fetchAll(
    @Param('id') id: string,
    @Body() body: { names?: string[]; connectionRequest?: boolean },
  ) {
    return this.cwmpService.handleFetchAllParams(id, body?.names);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.TECHNICIAN)
  @Post('api/devices/:id/discover')
  discover(@Param('id') id: string) {
    return this.cwmpService.handleDiscover(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.TECHNICIAN)
  @Get('api/devices/:id/discover/status')
  discoverStatus(@Param('id') id: string) {
    return this.cwmpService.handleGetDiscoveryStatus(id);
  }

}
