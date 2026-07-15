import { Module } from '@nestjs/common';
import { DeclareService } from './declare.service';
import { PrismaService } from '../common/prisma.service';

@Module({
  providers: [DeclareService, PrismaService],
  exports: [DeclareService],
})
export class DiscoveryEngineModule {}
