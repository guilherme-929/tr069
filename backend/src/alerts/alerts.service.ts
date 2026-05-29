import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { AlertSeverity, AlertType } from '@prisma/client';

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    private prisma: PrismaService,
    private ws: WebsocketGateway,
  ) {}

  async findAll(tenantId: string, query: { page?: number; limit?: number; resolved?: string; severity?: string }) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;
    const where: any = { tenantId };
    if (query.resolved === 'true') where.resolved = true;
    if (query.resolved === 'false') where.resolved = false;
    if (query.severity) where.severity = query.severity;

    const [data, total] = await Promise.all([
      this.prisma.alert.findMany({
        where, skip, take: limit, orderBy: { createdAt: 'desc' },
        include: { device: { select: { serial: true, modelName: true } } },
      }),
      this.prisma.alert.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async resolve(id: string) {
    return this.prisma.alert.update({
      where: { id },
      data: { resolved: true },
    });
  }

  async create(data: {
    type: AlertType;
    severity: AlertSeverity;
    title: string;
    message?: string;
    deviceId?: string;
    tenantId: string;
  }) {
    const alert = await this.prisma.alert.create({ data });
    this.ws.broadcast('alert:new', alert);
    return alert;
  }

  @Cron('*/5 * * * *')
  async checkOfflineDevices() {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const offlineDevices = await this.prisma.device.findMany({
      where: {
        status: 'ONLINE',
        lastContact: { lt: fiveMinutesAgo },
      },
    });

    for (const device of offlineDevices) {
      await this.prisma.device.update({
        where: { id: device.id },
        data: { status: 'OFFLINE' },
      });

      await this.create({
        type: 'DEVICE_OFFLINE',
        severity: 'WARNING',
        title: `Device ${device.serial} went offline`,
        message: `Last contact: ${device.lastContact}`,
        deviceId: device.id,
        tenantId: device.tenantId,
      });
    }
  }

  @Cron('0 6 * * *')
  async checkOldFirmware() {
    const devices = await this.prisma.device.findMany({
      where: { firmware: { status: { not: 'LATEST' } } },
      include: { firmware: true },
    });

    for (const device of devices) {
      if (device.firmware && device.firmware.status !== 'LATEST') {
        await this.create({
          type: 'OLD_FIRMWARE',
          severity: 'INFO',
          title: `Device ${device.serial} has outdated firmware`,
          message: `Current: ${device.firmwareVersion}`,
          deviceId: device.id,
          tenantId: device.tenantId,
        });
      }
    }
  }
}
