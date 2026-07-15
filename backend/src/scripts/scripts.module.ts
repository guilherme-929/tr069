import { Module } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ScriptsService } from './scripts.service';
import { ScriptsController } from './scripts.controller';
import { ProvisionsEngineService } from './provisions-engine.service';
import { ConfigService } from '../system-config/config.service';

@Module({
  providers: [ScriptsService, ProvisionsEngineService, PrismaService, ConfigService],
  controllers: [ScriptsController],
  exports: [ScriptsService, ProvisionsEngineService],
})
export class ScriptsModule {}
