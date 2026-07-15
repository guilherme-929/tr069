import { Module } from '@nestjs/common';
import { QueueService } from './queue.service';
import { PrismaService } from '../common/prisma.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';

@Module({
  providers: [QueueService, PrismaService, WebsocketGateway],
  exports: [QueueService],
})
export class QueueModule {}
