import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as http from 'http';
import { PrismaService } from '../common/prisma.service';
import { CwmpService } from './cwmp.service';

interface CwmpSession {
  serial: string;
  deviceId: string;
  state: 'INFORMED' | 'READY' | 'SENDING';
  pendingTasks: any[];
  currentTaskIndex: number;
  tenantId: string;
}

@Injectable()
export class AcsService implements OnModuleInit {
  private readonly logger = new Logger(AcsService.name);
  private server!: http.Server;
  private sessions = new Map<string, CwmpSession>();

  constructor(
    private prisma: PrismaService,
    private cwmp: CwmpService,
  ) {}

  onModuleInit() {
    this.startAcsServer();
  }

  private startAcsServer() {
    const port = parseInt(process.env.ACS_PORT || '7547', 10);

    this.server = http.createServer((req, res) => {
      this.handleCwmpRequest(req, res);
    });

    this.server.keepAliveTimeout = 120000;
    this.server.headersTimeout = 125000;

    this.server.listen(port, '0.0.0.0', () => {
      this.logger.log(`ACS CWMP Server listening on port ${port}`);
    });
  }

  private async handleCwmpRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      try {
        const serial = this.resolveDeviceSerial(req, body);

        if (!serial) {
          if (!this.validateAuth(req, res)) return;
        }

        const contentType = req.headers['content-type'] || '';
        const isSoap = contentType.includes('text/xml') || contentType.includes('application/soap') || body.includes('<soap:Envelope') || body.includes('<soapenv:Envelope');

        if (!body || body.trim().length === 0 || !isSoap) {
          await this.handleCpeReady(serial || '', res);
          return;
        }

        const xmlResponse = await this.cwmp.handleCwmp(body, serial || undefined);
        this.updateSessionAfterResponse(serial, xmlResponse);

        res.writeHead(200, {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPServer': 'TR-069 ACS/1.0',
        });
        res.end(xmlResponse);
      } catch (error: any) {
        this.logger.error(`CWMP Error: ${error.message}`);
        res.writeHead(500);
        res.end(`<error>${error.message}</error>`);
      }
    });
  }

  private resolveDeviceSerial(req: http.IncomingMessage, body: string): string | null {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Basic ')) {
      const base64 = authHeader.slice(6);
      const decoded = Buffer.from(base64, 'base64').toString('utf-8');
      const colonIndex = decoded.indexOf(':');
      if (colonIndex > 0) return decoded.slice(0, colonIndex);
    }

    try {
      if (body.includes('<Inform>') || body.includes('<cwmp:Inform>')) {
        const serialMatch = body.match(/<SerialNumber>([^<]+)<\/SerialNumber>/);
        if (serialMatch) return serialMatch[1];
      }
    } catch {}

    return null;
  }

  private async handleCpeReady(serial: string, res: http.ServerResponse) {
    if (!serial) {
      res.writeHead(200, { 'Content-Type': 'text/xml' });
      res.end(this.cwmp.buildEmptySoapEnvelope());
      return;
    }

    let session = this.sessions.get(serial);
    if (!session || session.state === 'INFORMED') {
      const device = (session?.deviceId)
        ? await this.prisma.device.findUnique({ where: { id: session.deviceId } })
        : await this.prisma.device.findUnique({ where: { serial } });
      if (device) {
        const pendingTasks = await this.prisma.task.findMany({
          where: { deviceId: device.id, status: 'PENDING' },
          orderBy: { createdAt: 'asc' },
        });
        session = {
          serial,
          deviceId: device.id,
          state: 'READY',
          pendingTasks,
          currentTaskIndex: 0,
          tenantId: device.tenantId,
        };
        this.sessions.set(serial, session);
      }
    }

    if (session && session.pendingTasks.length > 0 && session.currentTaskIndex < session.pendingTasks.length) {
      const task = session.pendingTasks[session.currentTaskIndex];
      const commandXml = await this.cwmp.buildCwmpCommand(task, session.deviceId);
      session.state = 'SENDING';
      await this.prisma.task.update({
        where: { id: task.id },
        data: { status: 'IN_PROGRESS' },
      });
      res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' });
      res.end(commandXml);
      return;
    }

    this.sessions.delete(serial);
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(this.cwmp.buildEmptySoapEnvelope());
  }

  private updateSessionAfterResponse(serial: string | null, xmlResponse: string) {
    if (!serial) return;

    if (xmlResponse.includes('InformResponse') || xmlResponse.includes('cwmp:InformResponse')) {
      if (!this.sessions.has(serial)) {
        this.sessions.set(serial, {
          serial,
          deviceId: '',
          state: 'INFORMED',
          pendingTasks: [],
          currentTaskIndex: 0,
          tenantId: 'default',
        });
      }
    }
  }

  getSession(serial: string): CwmpSession | undefined {
    return this.sessions.get(serial);
  }

  setDeviceInSession(serial: string, deviceId: string, tenantId: string) {
    const session = this.sessions.get(serial);
    if (session) {
      session.deviceId = deviceId;
      session.tenantId = tenantId;
    } else {
      this.sessions.set(serial, {
        serial,
        deviceId,
        state: 'INFORMED',
        pendingTasks: [],
        currentTaskIndex: 0,
        tenantId,
      });
    }
  }

  markTaskCompleted(serial: string) {
    const session = this.sessions.get(serial);
    if (session) {
      session.currentTaskIndex++;
      session.state = 'READY';
    }
  }

  endSession(serial: string) {
    this.sessions.delete(serial);
  }

  private validateAuth(req: http.IncomingMessage, res: http.ServerResponse): boolean {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="TR-069 ACS"' });
      res.end('Unauthorized');
      return false;
    }

    const base64 = authHeader.slice(6);
    const decoded = Buffer.from(base64, 'base64').toString('utf-8');
    const colonIndex = decoded.indexOf(':');
    if (colonIndex === -1) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="TR-069 ACS"' });
      res.end('Unauthorized');
      return false;
    }

    const username = decoded.slice(0, colonIndex);
    const password = decoded.slice(colonIndex + 1);
    const expectedUser = process.env.ACS_AUTH_USERNAME || 'alemnet';
    const expectedPass = process.env.ACS_AUTH_PASSWORD || 'alemnet';

    if (username !== expectedUser || password !== expectedPass) {
      this.logger.warn(`CWMP auth failed for user: ${username}`);
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="TR-069 ACS"' });
      res.end('Unauthorized');
      return false;
    }
    return true;
  }

  async getDashboardStats(tenantId: string) {
    const [online, offline, totalDevices, totalModels, totalFirmwares, alerts] =
      await Promise.all([
        this.prisma.device.count({ where: { tenantId, status: 'ONLINE' } }),
        this.prisma.device.count({ where: { tenantId, status: { in: ['OFFLINE', 'ERROR'] } } }),
        this.prisma.device.count({ where: { tenantId } }),
        this.prisma.deviceModel.count({ where: { tenantId } }),
        this.prisma.firmware.count({ where: { tenantId } }),
        this.prisma.alert.count({ where: { tenantId, resolved: false }, orderBy: { createdAt: 'desc' }, take: 5 }),
      ]);

    const provisionedToday = await this.prisma.event.count({
      where: { tenantId, createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    });

    return { online, offline, totalDevices, totalModels, totalFirmwares, provisionedToday, alerts };
  }

  async getDevicesList(
    tenantId: string,
    filters: {
      status?: string;
      model?: string;
      firmware?: string;
      search?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;
    const where: any = { tenantId };
    if (filters.status) where.status = filters.status;
    if (filters.model) where.modelName = filters.model;
    if (filters.firmware) where.firmwareVersion = filters.firmware;
    if (filters.search) {
      where.OR = [
        { serial: { contains: filters.search, mode: 'insensitive' } },
        { mac: { contains: filters.search, mode: 'insensitive' } },
        { modelName: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.device.findMany({
        where, skip, take: limit,
        orderBy: { lastContact: 'desc' },
        include: { model: true, client: true, firmware: true },
      }),
      this.prisma.device.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
