import { Injectable, Logger, OnModuleInit, HttpException, HttpStatus } from '@nestjs/common';
import * as http from 'http';
import * as https from 'https';
import { PrismaService } from '../common/prisma.service';
import { CwmpService } from './cwmp.service';
import { ConfigService } from '../system-config/config.service';

@Injectable()
export class AcsService implements OnModuleInit {
  private readonly logger = new Logger(AcsService.name);
  private server!: http.Server;
  private serialByIp = new Map<string, string>();
  private cachedTenantId: string | null = null;

  constructor(
    private prisma: PrismaService,
    private cwmp: CwmpService,
    private configService: ConfigService,
  ) {}

  onModuleInit() {
    this.startAcsServer();
    this.resolveTenantId().catch(() => this.logger.warn('Could not pre-cache tenant ID'));
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
    if (!await this.validateAuth(req, res)) return;

    let body = '';
    const rawClientIp = req.socket?.remoteAddress || req.headers['x-forwarded-for'] as string || '';
    const clientIp = rawClientIp.replace(/^::ffff:/, '');
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      try {
        let serial = this.resolveDeviceSerial(req, body);
        const bodyLen = (body || '').length;

        const contentType = req.headers['content-type'] || '';
        const isSoap = contentType.includes('text/xml') || contentType.includes('application/soap') || body.includes('<soap:Envelope') || body.includes('<soapenv:Envelope') || body.includes('<SOAP-ENV:Envelope');

        if (!serial || serial === process.env.ACS_AUTH_USERNAME || serial === 'alemnet') {
          serial = this.serialByIp.get(clientIp) || serial || '';
        }

        this.logger.log(`CWMP req from ${serial || 'unknown'} (ip=${clientIp}): method=${req.method}, content-type=${contentType}, bodyLen=${bodyLen}, isSoap=${isSoap}`);

        if (serial && isSoap && (body.includes('<Inform>') || body.includes('<cwmp:Inform>'))) {
          this.serialByIp.set(clientIp, serial);
        }

        if (!body || body.trim().length === 0 || !isSoap) {
          await this.handleCpeReady(serial || '', res);
          return;
        }

        // Per TR-069, ACS MUST echo back the same cwmp:ID from the CPE's request.
        // The ZTE F670L rejects responses with mismatched IDs.
        const requestCwmpId = this.extractCwmpId(body);

        const xmlResponse = await this.cwmp.handleCwmp(body, serial || undefined, undefined, clientIp);
        const responseWithCorrectId = requestCwmpId
          ? xmlResponse.replace(/(<cwmp:ID[^>]*>)[^<]+(<\/cwmp:ID>)/, `$1${requestCwmpId}$2`)
          : xmlResponse;

        const isInformResponse = responseWithCorrectId.includes('InformResponse') || responseWithCorrectId.includes('cwmp:InformResponse');
        const isCommandResponse = responseWithCorrectId.includes('SetParameterValuesResponse') ||
          responseWithCorrectId.includes('GetParameterValuesResponse') ||
          responseWithCorrectId.includes('GetParameterNamesResponse') ||
          responseWithCorrectId.includes('DownloadResponse');

        // On every request, fail stale IN_PROGRESS tasks (> 5 min)
        if (serial) {
          await this.failStaleTasks(serial);
        }

        // If we just got a command response AND there are more PENDING tasks, send next immediately
        if (serial && isCommandResponse) {
          const dev = await this.prisma.device.findUnique({ where: { serial } });
          if (dev && await this.trySendNextTask(dev, res)) {
            return;
          }
        }

        // InformResponse handling — always send InformResponse, then use DB flag
        // to detect "second Inform" (reconnection) for ZTE CPEs that never send empty POST.
        if (serial && isInformResponse) {
          const dev = await this.prisma.device.findUnique({ where: { serial } });
          if (dev) {
            const params = (dev.parameters as Record<string, any>) || {};
            const lastRespAt = params.__lastInformResponseAt
              ? new Date(params.__lastInformResponseAt).getTime()
              : 0;
            const recentThreshold = Date.now() - 5 * 60 * 1000;
            const isReconnection = lastRespAt > recentThreshold;

            if (isReconnection) {
              this.logger.log(`Device ${serial} reconnected (DB flag) — checking pending tasks`);
              // Clear the flag so next Inform won't re-trigger
              await this.clearLastInformResponseFlag(dev);
              if (await this.trySendPendingTask(dev, res)) {
                return;
              }
            } else {
              // First Inform or periodic — set flag for next reconnect
              await this.setLastInformResponseFlag(dev);
            }
          }
        }

        res.writeHead(200, {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPServer': 'TR-069 ACS/1.0',
        });
        res.end(responseWithCorrectId);
      } catch (error: any) {
        this.logger.error(`CWMP Error: ${error.message}`);
        res.writeHead(500);
        res.end(`<error>${error.message}</error>`);
      }
    });
  }

  private async trySendPendingTask(dev: any, res: http.ServerResponse): Promise<boolean> {
    const pending = await this.prisma.task.findMany({
      where: { deviceId: dev.id, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    });
    if (pending.length === 0) return false;

    const task = pending[0];
    const newAttempts = (task.attempts || 0) + 1;
    if (newAttempts >= (task.maxAttempts || 5)) {
      await this.prisma.task.update({
        where: { id: task.id },
        data: { status: 'FAILED', attempts: newAttempts },
      });
      this.logger.warn(`Device ${dev.serial} — task "${task.type}" failed after ${newAttempts} attempts`);
      return false;
    }

    await this.prisma.task.update({
      where: { id: task.id },
      data: { status: 'IN_PROGRESS', attempts: newAttempts },
    });
    const commandXml = await this.cwmp.buildCwmpCommand(task, dev.id);
    this.logger.log(`Device ${dev.serial} — sending command "${task.type}" (attempt ${newAttempts}/${task.maxAttempts || 5})`);
    res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' });
    res.end(commandXml);
    return true;
  }

  private async trySendNextTask(dev: any, res: http.ServerResponse): Promise<boolean> {
    const remaining = await this.prisma.task.findMany({
      where: { deviceId: dev.id, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    });
    if (remaining.length === 0) return false;

    const task = remaining[0];
    await this.prisma.task.update({
      where: { id: task.id },
      data: { status: 'IN_PROGRESS', attempts: { increment: 1 } },
    });
    const commandXml = await this.cwmp.buildCwmpCommand(task, dev.id);
    this.logger.log(`Sending next command "${task.type}" to device ${dev.serial}`);
    res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' });
    res.end(commandXml);
    return true;
  }

  private async setLastInformResponseFlag(dev: any) {
    const params = (dev.parameters as Record<string, any>) || {};
    params.__lastInformResponseAt = new Date().toISOString();
    await this.prisma.device.update({
      where: { id: dev.id },
      data: { parameters: params as any },
    });
    this.logger.log(`Device ${dev.serial} — set __lastInformResponseAt flag`);
  }

  private async clearLastInformResponseFlag(dev: any) {
    const params = (dev.parameters as Record<string, any>) || {};
    delete params.__lastInformResponseAt;
    await this.prisma.device.update({
      where: { id: dev.id },
      data: { parameters: params as any },
    });
  }

  private extractCwmpId(xml: string): string | null {
    const match = xml.match(/<cwmp:ID[^>]*>([^<]+)<\/cwmp:ID>/);
    return match ? match[1] : null;
  }

  private async failStaleTasks(serial: string) {
    const dev = await this.prisma.device.findUnique({ where: { serial } });
    if (!dev) return;
    const timeoutMinAgo = new Date(Date.now() - 15 * 60 * 1000);
    const stale = await this.prisma.task.findMany({
      where: {
        deviceId: dev.id,
        status: 'IN_PROGRESS',
        updatedAt: { lt: timeoutMinAgo },
      },
    });
    for (const t of stale) {
      await this.prisma.task.update({
        where: { id: t.id },
        data: { status: 'FAILED', error: 'Timed out waiting for CPE response' },
      });
      this.logger.warn(`Task "${t.type}" (${t.id}) stale — failed after 15 min`);
    }
  }

  private resolveDeviceSerial(req: http.IncomingMessage, body: string): string | null {
    try {
      if (body.includes('<Inform>') || body.includes('<cwmp:Inform>') || body.includes('<SOAP-ENV:Body')) {
        const serialMatch = body.match(/<SerialNumber>([^<]+)<\/SerialNumber>/);
        if (serialMatch) return serialMatch[1];
      }
    } catch {}

    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Basic ')) {
      const base64 = authHeader.slice(6);
      const decoded = Buffer.from(base64, 'base64').toString('utf-8');
      const colonIndex = decoded.indexOf(':');
      if (colonIndex > 0) return decoded.slice(0, colonIndex);
    }

    return null;
  }

  private async handleCpeReady(serial: string, res: http.ServerResponse) {
    if (!serial) {
      res.writeHead(200, { 'Content-Type': 'text/xml' });
      res.end(this.cwmp.buildEmptySoapEnvelope());
      return;
    }

    const dev = await this.prisma.device.findUnique({ where: { serial } });
    if (dev) {
      const pendingTasks = await this.prisma.task.findMany({
        where: { deviceId: dev.id, status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
      });
      if (pendingTasks.length > 0) {
        await this.trySendNextTask(dev, res);
        return;
      }
    }

    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(this.cwmp.buildEmptySoapEnvelope());
  }

  private async resolveTenantId(): Promise<string> {
    if (this.cachedTenantId) return this.cachedTenantId;
    const tenant = await this.prisma.tenant.findFirst({ where: { slug: 'default-isp' } })
      || await this.prisma.tenant.findFirst();
    if (!tenant) throw new Error('No tenant found. Run seed first.');
    this.cachedTenantId = tenant.id;
    return tenant.id;
  }

  async getEffectiveAcsUrl(deviceId: string): Promise<string> {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      include: { tenant: true },
    });
    if (!device) throw new HttpException('Device not found', HttpStatus.NOT_FOUND);

    return device.acsPublicUrlOverride
      || device.tenant.acsPublicUrl
      || process.env.ACS_PUBLIC_URL
      || `http://${device.ipAddress || 'localhost'}:${process.env.ACS_PORT || '7547'}`;
  }

  async sendConnectionRequest(deviceId: string): Promise<{ success: boolean; message: string }> {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      include: { tenant: true },
    });
    if (!device) throw new HttpException('Device not found', HttpStatus.NOT_FOUND);

    if (!device.tenant.connectionRequestEnabled) {
      throw new HttpException('Connection requests are disabled for this tenant', HttpStatus.FORBIDDEN);
    }

    const targetUrl = device.connectionRequestUrl;
    if (!targetUrl) {
      throw new HttpException(
        'No ConnectionRequest URL available for this device. The device may not have reported it yet.',
        HttpStatus.PRECONDITION_FAILED,
      );
    }

    const username = device.connectionRequestUsername || device.serial;
    const password = device.connectionRequestPassword || device.serial;
    const auth = Buffer.from(`${username}:${password}`).toString('base64');

    const rawTimeout = await this.configService.getValue('default', 'cwmp.connectionRequestTimeout') || '2000';
    const timeoutMs = parseInt(rawTimeout, 10) || 2000;

    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(targetUrl);
      const client = parsedUrl.protocol === 'https:' ? https : http;

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        timeout: timeoutMs,
        headers: {
          'Authorization': `Basic ${auth}`,
        },
      };

      const req = client.request(options, (res) => {
        this.logger.log(`ConnectionRequest to ${targetUrl} responded with ${res.statusCode}`);
        resolve({
          success: res.statusCode! < 500,
          message: `Connection request sent. Response: ${res.statusCode} ${res.statusMessage}`,
        });
      });

      req.on('error', (err) => {
        this.logger.error(`ConnectionRequest to ${targetUrl} failed: ${err.message}`);
        reject(new HttpException(
          `Failed to send connection request: ${err.message}`,
          HttpStatus.SERVICE_UNAVAILABLE,
        ));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new HttpException(
          'Connection request timed out after 10s',
          HttpStatus.GATEWAY_TIMEOUT,
        ));
      });

      req.end();
    });
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

  private async validateAuth(req: http.IncomingMessage, res: http.ServerResponse): Promise<boolean> {
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

    const configUser = await this.configService.getValue('default', 'acs.default.username');
    const configPass = await this.configService.getValue('default', 'acs.default.password');
    const expectedUser = configUser || process.env.ACS_AUTH_USERNAME || 'alemnet';
    const expectedPass = configPass || process.env.ACS_AUTH_PASSWORD || 'alemnet';

    if (username !== expectedUser || password !== expectedPass) {
      this.logger.warn(`CWMP auth failed for user: ${username}`);
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="TR-069 ACS"' });
      res.end('Unauthorized');
      return false;
    }
    return true;
  }
}
