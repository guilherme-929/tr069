import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { LogsService } from './logs.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { RolesGuard } from '../common/roles.guard';

@ApiTags('Logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/logs')
export class LogsController {
  constructor(private logsService: LogsService) {}

  @Get()
  findAll(@CurrentUser('tenantId') tenantId: string, @Query() query: any) {
    return this.logsService.findAll(tenantId, query);
  }

  @Get('export')
  export(@CurrentUser('tenantId') tenantId: string, @Query() query: any) {
    return this.logsService.export(tenantId, query);
  }
}
