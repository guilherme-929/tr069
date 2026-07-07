const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const device = await prisma.device.findUnique({ where: { serial: 'ZTE0QJNQ1407460' } });
  console.log('=== DEVICE INFO ===');
  console.log('serial:', device.serial);
  console.log('connectionRequestUrl:', device.connectionRequestUrl);
  console.log('ipAddress:', device.ipAddress);
  console.log('wanIp:', device.wanIp);
  console.log('status:', device.status);
  console.log('');
  console.log('=== PARAMETERS (ConnectionRequestURL related) ===');
  const params = device.parameters || {};
  Object.keys(params).forEach(k => {
    if (k.toLowerCase().includes('connectionrequest') || k.toLowerCase().includes('managementserver')) {
      console.log(k, '=', params[k]);
    }
  });
  console.log('');
  console.log('=== TASK COUNT ===');
  const pending = await prisma.task.count({ where: { deviceId: device.id, status: 'PENDING' } });
  const inProgress = await prisma.task.count({ where: { deviceId: device.id, status: 'IN_PROGRESS' } });
  const completed = await prisma.task.count({ where: { deviceId: device.id, status: 'COMPLETED' } });
  console.log('pending:', pending, 'in_progress:', inProgress, 'completed:', completed);
  
  console.log('');
  console.log('=== RECENT TASKS ===');
  const tasks = await prisma.task.findMany({
    where: { deviceId: device.id },
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  tasks.forEach(t => {
    console.log(t.type, t.status, t.createdAt);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
