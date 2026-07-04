import { Module } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ScriptsService } from './scripts.service';
import { ScriptsController } from './scripts.controller';

@Module({
  providers: [ScriptsService, PrismaService],
  controllers: [ScriptsController],
  exports: [ScriptsService],
})
export class ScriptsModule {}
