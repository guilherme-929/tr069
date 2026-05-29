import { Module } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { AlertsController } from './alerts.controller';
import { PrismaService } from '../common/prisma.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';

@Module({
  controllers: [AlertsController],
  providers: [AlertsService, PrismaService, WebsocketGateway],
  exports: [AlertsService],
})
export class AlertsModule {}
