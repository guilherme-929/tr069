import { Module } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ConfigService } from './config.service';
import { ConfigController } from './config.controller';

@Module({
  providers: [ConfigService, PrismaService],
  controllers: [ConfigController],
  exports: [ConfigService],
})
export class SystemConfigModule {}
