const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const tasks = await prisma.task.findMany({
    take: 30,
    orderBy: { createdAt: "desc" },
    include: {
      device: {
        select: {
          serial: true,
          modelName: true
        }
      }
    }
  });
  
  for (const t of tasks) {
    console.log(`ID: ${t.id} | Type: ${t.type} | Status: ${t.status} | Device: ${t.device ? t.device.serial : 'N/A'}`);
    console.log(`  Payload: ${JSON.stringify(t.payload)}`);
    if (t.result) {
      console.log(`  Result: ${JSON.stringify(t.result).substring(0, 100)}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
