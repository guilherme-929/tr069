import { Module, forwardRef } from '@nestjs/common';
import { DevicesService } from './devices.service';
import { DevicesController } from './devices.controller';
import { PrismaService } from '../common/prisma.service';
import { AcsModule } from '../acs/acs.module';

@Module({
  imports: [forwardRef(() => AcsModule)],
  controllers: [DevicesController],
  providers: [DevicesService, PrismaService],
  exports: [DevicesService],
})
export class DevicesModule {}
