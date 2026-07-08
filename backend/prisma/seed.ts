import { PrismaClient, Role, FirmwareStatus, DeviceStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  const tenant = await prisma.tenant.findFirst({ where: { slug: 'default-isp' } });
  if (tenant) {
    console.log('📋 Database already has seed data, skipping...');
    return;
  }

  const adminPassword = await bcrypt.hash('admin123', 12);
  const techPassword = await bcrypt.hash('tech123', 12);
  const operPassword = await bcrypt.hash('oper123', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@acs.local' },
    update: {},
    create: {
      email: 'admin@acs.local',
      password: adminPassword,
      name: 'Admin Principal',
      role: Role.ADMIN,
      tenantId: tenant.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'tecnico@acs.local' },
    update: {},
    create: {
      email: 'tecnico@acs.local',
      password: techPassword,
      name: 'Técnico Suporte',
      role: Role.TECHNICIAN,
      tenantId: tenant.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'operador@acs.local' },
    update: {},
    create: {
      email: 'operador@acs.local',
      password: operPassword,
      name: 'Operador NOC',
      role: Role.OPERATOR,
      tenantId: tenant.id,
    },
  });

  const models = [
    { manufacturer: 'ZTE', name: 'F660v8', hwVersion: 'v1.2.0', dataModel: 'TR-181', defaultParameters: { 'Device.ManagementServer.URL': 'http://acs.local:7547/cwmp', 'Device.ManagementServer.PeriodicInformInterval': '300' } },
    { manufacturer: 'ZTE', name: 'F680v7', hwVersion: 'v2.0.1', dataModel: 'TR-181', defaultParameters: { 'Device.ManagementServer.URL': 'http://acs.local:7547/cwmp', 'Device.ManagementServer.PeriodicInformInterval': '300' } },
    { manufacturer: 'Huawei', name: 'HG8245H', hwVersion: 'v4.0', dataModel: 'TR-098', defaultParameters: { 'InternetGatewayDevice.ManagementServer.URL': 'http://acs.local:7547/cwmp', 'InternetGatewayDevice.ManagementServer.PeriodicInformInterval': '300' } },
    { manufacturer: 'Huawei', name: 'HG8245W5', hwVersion: 'v5.0', dataModel: 'TR-181', defaultParameters: { 'Device.ManagementServer.URL': 'http://acs.local:7547/cwmp', 'Device.ManagementServer.PeriodicInformInterval': '300' } },
    { manufacturer: 'Nokia', name: 'G-240W-B', hwVersion: 'v3.1', dataModel: 'TR-181', defaultParameters: { 'Device.ManagementServer.URL': 'http://acs.local:7547/cwmp', 'Device.ManagementServer.PeriodicInformInterval': '300' } },
    { manufacturer: 'Intelbras', name: 'RG1200', hwVersion: 'v1.0', dataModel: 'TR-181', defaultParameters: { 'Device.ManagementServer.URL': 'http://acs.local:7547/cwmp', 'Device.ManagementServer.PeriodicInformInterval': '300' } },
    { manufacturer: 'TP-Link', name: 'Archer AX55', hwVersion: 'v1.2.0', dataModel: 'TR-181', defaultParameters: { 'Device.ManagementServer.URL': 'http://acs.local:7547/cwmp', 'Device.ManagementServer.PeriodicInformInterval': '300' } },
    { manufacturer: 'FiberHome', name: 'HG6245D', hwVersion: 'v2.1', dataModel: 'TR-181', defaultParameters: { 'Device.ManagementServer.URL': 'http://acs.local:7547/cwmp', 'Device.ManagementServer.PeriodicInformInterval': '300' } },
  ];

  const createdModels = [];
  for (const m of models) {
    const model = await prisma.deviceModel.upsert({
      where: { manufacturer_name_tenantId: { manufacturer: m.manufacturer, name: m.name, tenantId: tenant.id } },
      update: {},
      create: { ...m, tenantId: tenant.id },
    });
    createdModels.push(model);
  }

  const firmwares = [
    { version: 'v2.4.1-stable', status: FirmwareStatus.LATEST, changelog: 'Security patches and mesh stability improvements', modelId: createdModels[6].id },
    { version: 'v2.4.0-stable', status: FirmwareStatus.STABLE, changelog: 'Wi-Fi 6 optimization and bug fixes', modelId: createdModels[6].id },
    { version: 'v105.R018', status: FirmwareStatus.STABLE, changelog: 'Fiber sync optimization for GPON networks', modelId: createdModels[2].id },
    { version: 'v7.2.1', status: FirmwareStatus.LATEST, changelog: 'Security update for CVE-2024-xxx', modelId: createdModels[0].id },
    { version: 'v3.5.0', status: FirmwareStatus.STABLE, changelog: 'Improved VoIP stability', modelId: createdModels[4].id },
  ];

  for (const f of firmwares) {
    await prisma.firmware.create({
      data: { ...f, tenantId: tenant.id, fileName: `${f.version}.bin`, fileSize: Math.floor(Math.random() * 50000000) + 10000000 },
    });
  }

  const clients = [
    { name: 'João Silva', document: '123.456.789-00', contract: 'CONT-001', email: 'joao@email.com', phone: '(11) 99999-0001', plan: 'Fiber 300MB' },
    { name: 'Maria Oliveira', document: '987.654.321-00', contract: 'CONT-002', email: 'maria@email.com', phone: '(11) 99999-0002', plan: 'Fiber 500MB' },
    { name: 'Tech Solutions Ltda', document: '00.123.456/0001-00', contract: 'CONT-003', email: 'contato@techsol.com', phone: '(11) 99999-0003', plan: 'Business 1GB' },
    { name: 'Ana Costa', document: '456.789.123-00', contract: 'CONT-004', email: 'ana@email.com', phone: '(11) 99999-0004', plan: 'Fiber 200MB' },
    { name: 'Condomínio Residencial Parque', document: '11.222.333/0001-00', contract: 'CONT-005', email: 'adm@parque.com', phone: '(11) 99999-0005', plan: 'Multi-tenant 500MB' },
  ];

  const createdClients = [];
  for (const c of clients) {
    const client = await prisma.client.create({ data: { ...c, tenantId: tenant.id } });
    createdClients.push(client);
  }

  const devices = [
    { serial: 'ZTEGC0A1B2C3', mac: '00:1A:2B:3C:4D:5E', modelName: 'F660v8', status: DeviceStatus.ONLINE, ipAddress: '10.24.8.112', firmwareVersion: 'v7.2.1', lastInform: new Date(), lastContact: new Date(Date.now() - 120000), modelId: createdModels[0].id, clientId: createdClients[0].id },
    { serial: 'ZTEGC0A1B2C4', mac: '00:1A:2B:3C:4D:5F', modelName: 'F680v7', status: DeviceStatus.ONLINE, ipAddress: '10.24.8.113', firmwareVersion: 'v6.1.0', lastInform: new Date(), lastContact: new Date(Date.now() - 300000), modelId: createdModels[1].id, clientId: createdClients[1].id },
    { serial: 'HWTC98765432', mac: 'E4:5F:01:99:A2:BC', modelName: 'HG8245H', status: DeviceStatus.ONLINE, ipAddress: '10.24.9.45', firmwareVersion: 'v105.R018', lastInform: new Date(), lastContact: new Date(Date.now() - 480000), modelId: createdModels[2].id, clientId: createdClients[2].id },
    { serial: 'HWTC98765433', mac: 'E4:5F:01:99:A2:BD', modelName: 'HG8245W5', status: DeviceStatus.OFFLINE, ipAddress: '10.24.9.46', firmwareVersion: 'v2.0.1', lastInform: new Date(), lastContact: new Date(Date.now() - 86400000), modelId: createdModels[3].id, clientId: createdClients[3].id },
    { serial: 'ALCL1234ABCD', mac: '88:A9:C2:B4:77:F1', modelName: 'G-240W-B', status: DeviceStatus.OFFLINE, ipAddress: '10.24.4.19', firmwareVersion: 'v3.5.0', lastInform: new Date(), lastContact: new Date(Date.now() - 50400000), modelId: createdModels[4].id, clientId: createdClients[4].id },
    { serial: 'INTB00112233', mac: 'BC:A9:C2:B4:77:00', modelName: 'RG1200', status: DeviceStatus.ONLINE, ipAddress: '10.24.10.5', firmwareVersion: 'v1.0.4', lastInform: new Date(), lastContact: new Date(Date.now() - 60000), modelId: createdModels[5].id, clientId: createdClients[0].id },
    { serial: 'TPLK55443322', mac: 'AA:BB:CC:DD:EE:01', modelName: 'Archer AX55', status: DeviceStatus.ONLINE, ipAddress: '10.24.11.22', firmwareVersion: 'v2.4.1-stable', lastInform: new Date(), lastContact: new Date(Date.now() - 180000), modelId: createdModels[6].id, clientId: createdClients[1].id },
    { serial: 'FBHM77889900', mac: 'AA:BB:CC:DD:EE:02', modelName: 'HG6245D', status: DeviceStatus.CRITICAL, ipAddress: '10.24.12.8', firmwareVersion: 'v1.0.9', lastInform: new Date(), lastContact: new Date(Date.now() - 300000), modelId: createdModels[7].id, clientId: createdClients[2].id },
  ];

  for (const d of devices) {
    await prisma.device.create({
      data: {
        ...d,
        tenantId: tenant.id,
        parameters: {
          'Device.DeviceInfo.SoftwareVersion': d.firmwareVersion,
          'Device.DeviceInfo.UpTime': Math.floor(Math.random() * 604800).toString(),
          'Device.IP.Interface.1.IPv4Address': d.ipAddress,
          'Device.ManagementServer.URL': 'http://acs.local:7547/cwmp',
          'Device.ManagementServer.PeriodicInformInterval': '300',
        },
      },
    });
  }

  await prisma.log.create({
    data: {
      action: 'SEED',
      entity: 'SYSTEM',
      detail: 'Database seeded successfully',
      userId: admin.id,
      tenantId: tenant.id,
    },
  });

  console.log('✅ Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });