import { Module, forwardRef } from '@nestjs/common';
import { AcsController } from './acs.controller';
import { AcsService } from './acs.service';
import { CwmpService } from './cwmp.service';
import { PrismaService } from '../common/prisma.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { ScriptsModule } from '../scripts/scripts.module';
import { SystemConfigModule } from '../system-config/system-config.module';

@Module({
  imports: [forwardRef(() => ScriptsModule), SystemConfigModule],
  controllers: [AcsController],
  providers: [AcsService, CwmpService, PrismaService, WebsocketGateway],
  exports: [AcsService, CwmpService],
})
export class AcsModule {}
