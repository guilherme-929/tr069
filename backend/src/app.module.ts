import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './common/prisma.service';
import { AuthModule } from './auth/auth.module';
import { AwsModule } from './acs/acs.module';
import { DevicesModule } from './devices/devices.module';
import { ModelsModule } from './models/models.module';
import { FirmwareModule } from './firmware/firmware.module';
import { ProvisioningModule } from './provisioning/provisioning.module';
import { ClientsModule } from './clients/clients.module';
import { LogsModule } from './logs/logs.module';
import { AlertsModule } from './alerts/alerts.module';
import { WebsocketModule } from './websocket/websocket.module';
import { QueueModule } from './queue/queue.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    AuthModule,
    AwsModule,
    DevicesModule,
    ModelsModule,
    FirmwareModule,
    ProvisioningModule,
    ClientsModule,
    LogsModule,
    AlertsModule,
    // WebsocketModule, // TODO: fix WebSocket integration with Fastify
    QueueModule,
  ],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class AppModule {}
