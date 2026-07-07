const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
async function run() {
  const d = await p.device.findUnique({ where: { serial: "ZTE0QJNQ1407460" } });
  if (d) {
    console.log("Status:", d.status);
    const params = d.parameters || {};
    const keys = Object.keys(params).filter(k => !k.startsWith("__"));
    console.log("Parameter count:", keys.length);
    console.log("First 20 params:");
    keys.slice(0, 20).forEach(k => console.log("  " + k + " = " + params[k]));
    console.log("Discovered:", JSON.stringify(params.__discovered__, null, 2));
  } else {
    console.log("Device not found");
  }
  await p.$disconnect();
}
run().catch(e => { console.error(e); process.exit(1); });
