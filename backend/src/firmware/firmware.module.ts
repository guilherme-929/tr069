import { Module } from '@nestjs/common';
import { FirmwareService } from './firmware.service';
import { FirmwareController } from './firmware.controller';
import { PrismaService } from '../common/prisma.service';

@Module({
  controllers: [FirmwareController],
  providers: [FirmwareService, PrismaService],
  exports: [FirmwareService],
})
export class FirmwareModule {}
