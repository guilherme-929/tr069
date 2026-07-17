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
  private sessionLogger = new Logger('CWMP-Session');

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
    const sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const rawClientIp = req.socket?.remoteAddress || req.headers['x-forwarded-for'] as string || '';
    const clientIp = rawClientIp.replace(/^::ffff:/, '');
    const sessionCtx = () => `[SID=${sessionId}]`;
    const slog = (msg: string) => this.sessionLogger.log(`${sessionCtx()} ${msg}`);

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

        slog(`CWMP req serial=${serial || 'unknown'} ip=${clientIp} method=${req.method} contentType=${contentType} bodyLen=${bodyLen} isSoap=${isSoap}`);

        if (serial && isSoap && (body.includes('<Inform>') || body.includes('<cwmp:Inform>'))) {
          this.serialByIp.set(clientIp, serial);
        }

        if (!body || body.trim().length === 0 || !isSoap) {
          await this.handleCpeReady(serial || '', res);
          return;
        }

        // New Inform from CPE = new CWMP session. Any task left IN_PROGRESS from
        // a previous session was abandoned (CPE didn't respond). Fail it immediately
        // so the pipeline is not blocked until the stale timeout.
        if (serial && (body.includes('<Inform>') || body.includes('<cwmp:Inform>'))) {
          await this.failInProgressTasks(serial, 'New Inform â€” previous command abandoned by CPE');
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
            slog(`Next command sent to ${serial} after command response`);
            return;
          }
        }

        if (serial && isInformResponse) {
          const dev = await this.prisma.device.findUnique({ where: { serial } });
          if (dev) {
            const params = (dev.parameters as Record<string, any>) || {};
            const lastRespAt = params.__lastInformResponseAt
              ? new Date(params.__lastInformResponseAt).getTime()
              : 0;
            const deviceInformInterval = params.PeriodicInformInterval
              || params['Device.ManagementServer.PeriodicInformInterval']
              || params['InternetGatewayDevice.ManagementServer.PeriodicInformInterval']
              || '300';
            const intervalSec = Math.max(60, Math.min(parseInt(deviceInformInterval, 10), 600)) * 1000;
            const recentThreshold = Date.now() - Math.round(intervalSec * 0.5);
            const isReconnection = lastRespAt > 0 && lastRespAt < recentThreshold;

            if (isReconnection) {
              slog(`Device ${serial} reconnected (DB flag, last response >5 min ago) â€” checking pending tasks`);
              // Clear the flag so next Inform won't re-trigger
              await this.clearLastInformResponseFlag(dev);
              // Fail any IN_PROGRESS tasks from the previous session
              await this.failInProgressTasks(serial, 'Session interrupted by reconnection');
              if (await this.trySendPendingTask(dev, res)) {
                slog(`Pending task sent to reconnected device ${serial}`);
                return;
              }
            } else {
              // First Inform or periodic - set flag for next reconnect
              await this.setLastInformResponseFlag(dev);
              // Also try to deliver pending tasks created before this Inform
              // (handles CPEs that never send empty POST)
              const oldPending = await this.prisma.task.count({
                where: { deviceId: dev.id, status: 'PENDING', createdAt: { lt: new Date(Date.now() - 30000) } },
              });
              if (oldPending > 0 && await this.trySendPendingTask(dev, res)) {
                slog(`Old pending task sent to device ${serial} (inline fallback)`);
                await this.clearLastInformResponseFlag(dev);
                return;
              }
            }
          }
        }

        // Multipart MIME fallback: include first pending task with InformResponse
        // for CPEs that never send empty POST (e.g., some TP-Link).
        if (serial && isInformResponse) {
          const dev = await this.prisma.device.findUnique({ where: { serial } });
          if (dev) {
            const mpPending = await this.prisma.task.findFirst({
              where: { deviceId: dev.id, status: 'PENDING' },
              orderBy: { createdAt: 'asc' },
            });
            if (mpPending) {
              const mpAttempts = (mpPending.attempts || 0) + 1;
              const mpMaxAttempts = mpPending.maxAttempts || 5;
              if (mpAttempts <= mpMaxAttempts) {
                await this.prisma.task.update({
                  where: { id: mpPending.id },
                  data: { status: 'IN_PROGRESS', attempts: mpAttempts },
                });
                const mpCmdXml = await this.cwmp.buildCwmpCommand(mpPending, dev.id);
                const mpBoundary = 'TR069-MIME-Boundary-' + Date.now().toString(36);
                const crlf = String.fromCharCode(13,10);
                const mpCmdClean = mpCmdXml.replace(/^<\?xml[^>]*>\s*/, '');
                const mpBody = '--' + mpBoundary + crlf
                  + 'Content-Type: text/xml; charset=utf-8' + crlf
                  + 'Content-Transfer-Encoding: 7bit' + crlf
                  + crlf
                  + responseWithCorrectId + crlf
                  + '--' + mpBoundary + crlf
                  + 'Content-Type: text/xml; charset=utf-8' + crlf
                  + 'Content-Transfer-Encoding: 7bit' + crlf
                  + crlf
                  + mpCmdClean + crlf
                  + '--' + mpBoundary + '--';
                res.writeHead(200, {
                  'Content-Type': 'multipart/mixed; boundary="' + mpBoundary + '"',
                });
                res.end(mpBody);
                console.log('Multipart MIME sent to ' + serial);
                return;
              }
            }
          }
        }
        res.writeHead(200, {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPServer': 'TR-069 ACS/1.0',
        });
        res.end(responseWithCorrectId);
        slog(`Response sent to ${serial || 'unknown'} (${responseWithCorrectId.length} bytes)`);
      } catch (error: any) {
        this.logger.error(`${sessionCtx()} CWMP Error: ${error.message}`);
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
    const maxAttempts = task.maxAttempts || 5;

    // Exponential backoff: skip this attempt if within backoff window
    if (task.updatedAt) {
      const backoffMs = Math.min(1000 * Math.pow(2, newAttempts - 1), 300000); // max 5 min
      const elapsed = Date.now() - new Date(task.updatedAt).getTime();
      if (elapsed < backoffMs) {
        this.logger.debug(`Device ${dev.serial} â€” task "${task.type}" in backoff (${Math.round((backoffMs - elapsed) / 1000)}s remaining), skipping`);
        return false;
      }
    }

    if (newAttempts >= maxAttempts) {
      await this.prisma.task.update({
        where: { id: task.id },
        data: { status: 'FAILED', error: `Failed after ${maxAttempts} attempts (exponential backoff exhausted)`, attempts: newAttempts },
      });
      this.logger.warn(`Device ${dev.serial} â€” task "${task.type}" failed after ${newAttempts} attempts`);
      return false;
    }

    await this.prisma.task.update({
      where: { id: task.id },
      data: { status: 'IN_PROGRESS', attempts: newAttempts },
    });
    const commandXml = await this.cwmp.buildCwmpCommand(task, dev.id);
    this.logger.log(`Device ${dev.serial} â€” sending command "${task.type}" (attempt ${newAttempts}/${maxAttempts})`);
    res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' });
    res.end(commandXml);
    return true;
  }

  private getBackoffMs(attempt: number): number {
    const base = 1000;
    const max = 300000;
    const delay = Math.min(base * Math.pow(2, attempt - 1), max);
    return delay + Math.round(Math.random() * delay * 0.1); // add 10% jitter
  }

  private async trySendNextTask(dev: any, res: http.ServerResponse): Promise<boolean> {
    const remaining = await this.prisma.task.findMany({
      where: { deviceId: dev.id, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    });
    if (remaining.length === 0) return false;

    const task = remaining[0];
    const newAttempts = (task.attempts || 0) + 1;
    const maxAttempts = task.maxAttempts || 5;

    // Exponential backoff: skip if within backoff window
    if (task.updatedAt) {
      const backoffMs = this.getBackoffMs(newAttempts);
      const elapsed = Date.now() - new Date(task.updatedAt).getTime();
      if (elapsed < backoffMs) {
        this.logger.debug(`Device ${dev.serial} â€” task "${task.type}" in backoff (${Math.round((backoffMs - elapsed) / 1000)}s remaining), skipping`);
        return false;
      }
    }

    if (newAttempts >= maxAttempts) {
      await this.prisma.task.update({
        where: { id: task.id },
        data: { status: 'FAILED', error: `Failed after ${maxAttempts} attempts (exponential backoff exhausted)`, attempts: newAttempts },
      });
      this.logger.warn(`Device ${dev.serial} â€” task "${task.type}" failed after ${newAttempts} attempts`);
      return false;
    }
    await this.prisma.task.update({
      where: { id: task.id },
      data: { status: 'IN_PROGRESS', attempts: newAttempts },
    });
    const commandXml = await this.cwmp.buildCwmpCommand(task, dev.id);
    this.logger.log(`Sending next command "${task.type}" to device ${dev.serial} (attempt ${newAttempts}/${maxAttempts})`);
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
    this.logger.log(`Device ${dev.serial} â€” set __lastInformResponseAt flag`);
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
      this.logger.warn(`Task "${t.type}" (${t.id}) stale â€” failed after 15 min`);
    }
  }

  private async failInProgressTasks(serial: string, error: string) {
    const dev = await this.prisma.device.findUnique({ where: { serial } });
    if (!dev) return;
    const inProgress = await this.prisma.task.findMany({
      where: { deviceId: dev.id, status: 'IN_PROGRESS' },
    });
    for (const t of inProgress) {
      await this.prisma.task.update({
        where: { id: t.id },
        data: { status: 'FAILED', error },
      });
      this.logger.warn(`Task "${t.type}" (${t.id}) â€” ${error}`);
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
      // Reset any stale IN_PROGRESS tasks back to PENDING so they can be retried
      // CPE is sending empty POST = asking for next command = session is alive
      const staleInProgress = await this.prisma.task.findMany({
        where: { deviceId: dev.id, status: 'IN_PROGRESS' },
      });
      for (const t of staleInProgress) {
        await this.prisma.task.update({
          where: { id: t.id },
          data: { status: 'PENDING' },
        });
        this.logger.warn(`Task "${t.type}" (${t.id}) reset PENDING — CPE reconnected via empty POST`);
      }

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

  async sendConnectionRequest(deviceId: string): Promise<{ success: boolean; message: string; statusCode?: number; executedImmediately?: boolean; queued?: boolean }> {
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
        const statusCode = res.statusCode!;
        const is200 = statusCode === 200;
        const is202 = statusCode === 202;
        resolve({
          success: statusCode < 500,
          statusCode,
          executedImmediately: is200,
          queued: is202,
          message: is200
            ? `Connection request executed immediately (200): device will process tasks now`
            : is202
              ? `Connection request queued (202): device will process on next scheduled Inform`
              : `Connection request sent. Response: ${statusCode} ${res.statusMessage}`,
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
        this.prisma.alert.findMany({ where: { tenantId, resolved: false }, orderBy: { createdAt: 'desc' }, take: 5 }),
      ]);

    const provisionedToday = await this.prisma.event.count({
      where: { tenantId, createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    });

    return { online, offline, totalDevices, totalModels, totalFirmwares, provisionedToday, alerts };
  }

  async getProvisioningPerHour(tenantId: string) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const events = await this.prisma.event.findMany({
      where: { tenantId, createdAt: { gte: since } },
      select: { createdAt: true },
    });

    const buckets: Record<string, number> = {};
    for (let i = 0; i < 24; i++) {
      const h = new Date(Date.now() - i * 60 * 60 * 1000);
      const key = h.toISOString().slice(0, 13) + ':00';
      buckets[key] = 0;
    }

    for (const ev of events) {
      const key = new Date(ev.createdAt).toISOString().slice(0, 13) + ':00';
      if (buckets[key] !== undefined) buckets[key]++;
    }

    return Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hour, count]) => ({ hour, count }));
  }

  async getNetworkAvailability(tenantId: string) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const onlineCounts = await this.prisma.device.count({ where: { tenantId, status: 'ONLINE' } });
    const totalCounts = await this.prisma.device.count({ where: { tenantId } });

    const events = await this.prisma.event.findMany({
      where: { tenantId, createdAt: { gte: since } },
      select: { createdAt: true, code: true },
    });

    const hourlyBuckets: Record<string, { total: number; online: number }> = {};
    for (let i = 0; i < 24; i++) {
      const h = new Date(Date.now() - i * 60 * 60 * 1000);
      const key = h.toISOString().slice(0, 13) + ':00';
      hourlyBuckets[key] = { total: totalCounts, online: 0 };
    }

    for (const ev of events) {
      const key = new Date(ev.createdAt).toISOString().slice(0, 13) + ':00';
      if (hourlyBuckets[key]) {
        hourlyBuckets[key].online++;
      }
    }

    return Object.entries(hourlyBuckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hour, data]) => ({
        hour,
        availability: data.total > 0 ? Math.round((data.online / data.total) * 100) : 100,
      }));
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


