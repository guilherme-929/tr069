import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as http from 'http';
import * as https from 'https';
import { PrismaService } from '../common/prisma.service';
import { CwmpService } from './cwmp.service';

@Injectable()
export class AcsService implements OnModuleInit {
  private readonly logger = new Logger(AcsService.name);
  private server: http.Server | null = null;

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
      if (!this.validateAuth(req, res)) return;

      if (req.method === 'POST' && req.url === '/cwmp') {
        this.handleCwmpRequest(req, res);
      } else if (req.method === 'GET' && req.url === '/cwmp') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('TR-069 ACS Server is running');
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    this.server.listen(port, '0.0.0.0', () => {
      this.logger.log(`🔧 ACS CWMP Server listening on port ${port}`);
    });
  }

  private async handleCwmpRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ) {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      try {
        const xml = body;
        this.logger.debug(`CWMP Request: ${xml.substring(0, 200)}...`);

        const xmlResponse = await this.cwmp.handleCwmp(xml);

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

  private xmlToJson(xml: string): any {
    try {
      const parser = new (require('fast-xml-parser').XMLParser)({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
      });
      return parser.parse(xml);
    } catch {
      return { raw: xml };
    }
  }

  private convertToXml(obj: any): string {
    try {
      const builder = new (require('fast-xml-parser').XMLBuilder)({
        ignoreAttributes: false,
        format: true,
        attributeNamePrefix: '@_',
      });
      return builder.build(obj);
    } catch {
      return '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><cwmp:InformResponse><MaxEnvelopes>1</MaxEnvelopes></cwmp:InformResponse></soap:Body></soap:Envelope>';
    }
  }

  private validateAuth(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): boolean {
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
    const expectedUser =
      process.env.ACS_AUTH_USERNAME || 'alemnet';
    const expectedPass =
      process.env.ACS_AUTH_PASSWORD || 'alemnet';

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
        this.prisma.device.count({
          where: { tenantId, status: 'ONLINE' },
        }),
        this.prisma.device.count({
          where: { tenantId, status: { in: ['OFFLINE', 'ERROR'] } },
        }),
        this.prisma.device.count({ where: { tenantId } }),
        this.prisma.deviceModel.count({ where: { tenantId } }),
        this.prisma.firmware.count({ where: { tenantId } }),
        this.prisma.alert.count({
          where: { tenantId, resolved: false },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
      ]);

    const provisionedToday = await this.prisma.event.count({
      where: {
        tenantId,
        createdAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      },
    });

    return {
      online,
      offline,
      totalDevices,
      totalModels,
      totalFirmwares,
      provisionedToday,
      alerts,
    };
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
        where,
        skip,
        take: limit,
        orderBy: { lastContact: 'desc' },
        include: { model: true, client: true, firmware: true },
      }),
      this.prisma.device.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
