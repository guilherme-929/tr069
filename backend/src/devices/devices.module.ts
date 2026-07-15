import { Module, forwardRef } from '@nestjs/common';
import { DevicesService } from './devices.service';
import { DevicesController } from './devices.controller';
import { HomologationService } from '../models/homologation.service';
import { PrismaService } from '../common/prisma.service';
import { AcsModule } from '../acs/acs.module';
import { SystemConfigModule } from '../system-config/system-config.module';

@Module({
  imports: [forwardRef(() => AcsModule), SystemConfigModule],
  controllers: [DevicesController],
  providers: [DevicesService, HomologationService, PrismaService],
  exports: [DevicesService],
})
export class DevicesModule {}
