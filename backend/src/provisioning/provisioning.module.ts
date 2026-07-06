import { Module } from '@nestjs/common';
import { ProvisioningService } from './provisioning.service';
import { ProvisioningController } from './provisioning.controller';
import { PrismaService } from '../common/prisma.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { SystemConfigModule } from '../system-config/system-config.module';

@Module({
  imports: [SystemConfigModule],
  controllers: [ProvisioningController],
  providers: [ProvisioningService, PrismaService, WebsocketGateway],
  exports: [ProvisioningService],
})
export class ProvisioningModule {}
