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

  @Cron('*/1 * * * *')
  async checkOfflineDevices() {
    const now = Date.now();
    const fiveMinutesAgo = new Date(now - 5 * 60 * 1000);
    const oneHourAgo = new Date(now - 60 * 60 * 1000);
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

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

      const lastContactTime = device.lastContact?.getTime() || 0;
      const elapsed = now - lastContactTime;

      const severity: AlertSeverity =
        elapsed > 24 * 60 * 60 * 1000 ? 'CRITICAL'
          : elapsed > 60 * 60 * 1000 ? 'WARNING'
          : 'WARNING';

      await this.create({
        type: 'DEVICE_OFFLINE',
        severity,
        title: `Device ${device.serial} went offline`,
        message: `Last contact: ${device.lastContact}. Elapsed: ${Math.round(elapsed / 60000)} min`,
        deviceId: device.id,
        tenantId: device.tenantId,
      });
    }

    // Escalate existing OFFLINE alerts based on elapsed time
    const criticalThreshold = new Date(now - 24 * 60 * 60 * 1000);
    const existingOfflineAlerts = await this.prisma.alert.findMany({
      where: {
        type: 'DEVICE_OFFLINE',
        resolved: false,
        severity: 'WARNING',
        createdAt: { lt: criticalThreshold },
      },
      include: { device: true },
    });

    for (const alert of existingOfflineAlerts) {
      if (!alert.device) continue;
      const elapsed = now - (alert.device.lastContact?.getTime() || alert.createdAt.getTime());
      if (elapsed > 24 * 60 * 60 * 1000) {
        await this.prisma.alert.update({
          where: { id: alert.id },
          data: { severity: 'CRITICAL', title: `[CRITICAL] Device ${alert.device.serial} offline > 24h` },
        });
        this.ws.broadcast('alert:update', { id: alert.id, severity: 'CRITICAL' });
      }
    }

    // Detect devices that never connected (created >30min ago, never had lastContact)
    const neverConnectedThreshold = new Date(now - 30 * 60 * 1000);
    const neverConnected = await this.prisma.device.findMany({
      where: {
        lastContact: null,
        createdAt: { lt: neverConnectedThreshold },
      },
    });

    for (const device of neverConnected) {
      const existingAlert = await this.prisma.alert.findFirst({
        where: { deviceId: device.id, type: 'DEVICE_OFFLINE', resolved: false, message: { contains: 'never connected' } },
      });
      if (!existingAlert) {
        await this.create({
          type: 'DEVICE_OFFLINE',
          severity: 'WARNING',
          title: `Device ${device.serial} never connected`,
          message: `Device created ${device.createdAt.toISOString()} but never connected to ACS`,
          deviceId: device.id,
          tenantId: device.tenantId,
        });
      }
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
