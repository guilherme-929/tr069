import { Module } from '@nestjs/common';
import { AcsController } from './acs.controller';
import { AcsService } from './acs.service';
import { CwmpService } from './cwmp.service';
import { PrismaService } from '../common/prisma.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';

@Module({
  controllers: [AcsController],
  providers: [AcsService, CwmpService, PrismaService, WebsocketGateway],
  exports: [AcsService, CwmpService],
})
export class AwsModule {}
