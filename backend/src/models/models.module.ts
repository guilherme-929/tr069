import { Module } from '@nestjs/common';
import { ModelsService } from './models.service';
import { ModelsController } from './models.controller';
import { DiscoveryService } from './discovery.service';
import { PrismaService } from '../common/prisma.service';

@Module({
  controllers: [ModelsController],
  providers: [ModelsService, DiscoveryService, PrismaService],
  exports: [ModelsService, DiscoveryService],
})
export class ModelsModule {}
