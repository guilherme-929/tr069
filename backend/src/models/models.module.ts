import { Module } from '@nestjs/common';
import { ModelsService } from './models.service';
import { ModelsController } from './models.controller';
import { DiscoveryService } from './discovery.service';
import { HomologationService } from './homologation.service';
import { PrismaService } from '../common/prisma.service';

@Module({
  controllers: [ModelsController],
  providers: [ModelsService, DiscoveryService, HomologationService, PrismaService],
  exports: [ModelsService, DiscoveryService, HomologationService],
})
export class ModelsModule {}
