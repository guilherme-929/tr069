/** Seed GenieACS provisions into Script table */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const provisions = [
  // Auto-generated from GenieACS provisions
  {
    "name": "bootstrap",
    "type": "provision",
    "channel": "bootstrap",
    "precondition": null,
    "actions": [{ "type": "log", "message": "Bootstrap: clearing cached data models" }]
  },
  {
    "name": "default",
    "type": "provision",
    "channel": "default",
    "precondition": null,
    "actions": [
      { "type": "getParameter", "path": "InternetGatewayDevice.DeviceInfo.HardwareVersion" },
      { "type": "getParameter", "path": "InternetGatewayDevice.DeviceInfo.SoftwareVersion" },
      { "type": "getParameter", "path": "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANIPConnection.*.MACAddress" },
      { "type": "getParameter", "path": "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANIPConnection.*.ExternalIPAddress" },
      { "type": "getParameter", "path": "InternetGatewayDevice.LANDevice.*.WLANConfiguration.*.SSID" },
      { "type": "getParameter", "path": "InternetGatewayDevice.LANDevice.*.WLANConfiguration.*.KeyPassphrase" },
      { "type": "getParameter", "path": "InternetGatewayDevice.LANDevice.*.Hosts.Host.*.HostName" },
      { "type": "getParameter", "path": "InternetGatewayDevice.LANDevice.*.Hosts.Host.*.IPAddress" },
      { "type": "getParameter", "path": "InternetGatewayDevice.LANDevice.*.Hosts.Host.*.MACAddress" }
    ]
  },
  {
    "name": "inform",
    "type": "provision",
    "channel": "inform",
    "precondition": null,
    "actions": [
      { "type": "setParameter", "path": "InternetGatewayDevice.ManagementServer.PeriodicInformEnable", "value": true },
      { "type": "setParameter", "path": "InternetGatewayDevice.ManagementServer.PeriodicInformInterval", "value": 300 },
      { "type": "setParameter", "path": "Device.ManagementServer.PeriodicInformEnable", "value": true },
      { "type": "setParameter", "path": "Device.ManagementServer.PeriodicInformInterval", "value": 300 }
    ]
  },
  {
    "name": "ACS_padronizacao",
    "type": "provision",
    "channel": "inform",
    "precondition": null,
    "actions": [
      { "type": "clearTag", "tag": "acs" },
      { "type": "setParameter", "path": "Device.ManagementServer.URL", "value": "http://acs.alemnet.net.br:7547" },
      { "type": "setParameter", "path": "InternetGatewayDevice.ManagementServer.URL", "value": "http://acs.alemnet.net.br:7547" },
      { "type": "setParameter", "path": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.3WANIPConnection.1.X_CT-COM_PingResponseEnable", "value": true }
    ]
  },
  {
    "name": "URL_ACS",
    "type": "provision",
    "channel": "inform",
    "precondition": null,
    "actions": [
      { "type": "log", "message": "URL_ACS: Verifying and setting ACS URL" }
    ]
  },
  {
    "name": "informeVirtual",
    "type": "provision",
    "channel": "inform",
    "precondition": "Tags.ignorar IS NULL",
    "actions": [
      { "type": "log", "message": "Coletando Virtual Parameters" }
    ]
  },
  {
    "name": "defaultFIX",
    "type": "provision",
    "channel": "inform",
    "precondition": null,
    "actions": [
      { "type": "clearTag", "tag": "defaultFIX" },
      { "type": "clearTag", "tag": "DEFAULTFIX" },
      { "type": "log", "message": "defaultFIX: Verifying UPNP and default parameters" }
    ]
  },
  {
    "name": "coletaBoot",
    "type": "provision",
    "channel": "inform",
    "precondition": null,
    "actions": [
      { "type": "log", "message": "Coleta de valores apos boot" }
    ]
  },
  {
    "name": "summon",
    "type": "provision",
    "channel": "inform",
    "precondition": "Tags.SUMMON IS NOT NULL OR Tags.summon IS NOT NULL",
    "actions": [
      { "type": "clearTag", "tag": "summon" },
      { "type": "clearTag", "tag": "SUMMON" },
      { "type": "getParameter", "path": "InternetGatewayDevice.LANDevice.*.WLANConfiguration.*.SSID" },
      { "type": "getParameter", "path": "InternetGatewayDevice.LANDevice.*.WLANConfiguration.*.KeyPassphrase" },
      { "type": "getParameter", "path": "InternetGatewayDevice.LANDevice.*.Hosts.Host.*.HostName" },
      { "type": "getParameter", "path": "InternetGatewayDevice.LANDevice.*.Hosts.Host.*.IPAddress" },
      { "type": "getParameter", "path": "InternetGatewayDevice.LANDevice.*.Hosts.Host.*.MACAddress" }
    ]
  },
  {
    "name": "reboot",
    "type": "provision",
    "channel": "inform",
    "precondition": "Tags.REBOOT IS NOT NULL OR Tags.reboot IS NOT NULL",
    "actions": [
      { "type": "clearTag", "tag": "reboot" },
      { "type": "clearTag", "tag": "REBOOT" },
      { "type": "reboot" }
    ]
  },
  {
    "name": "TrocaOLT",
    "type": "provision",
    "channel": "inform",
    "precondition": "Tags.OLT IS NOT NULL OR Tags.olt IS NOT NULL",
    "actions": [
      { "type": "clearTag", "tag": "olt" },
      { "type": "clearTag", "tag": "OLT" },
      { "type": "log", "message": "TrocaOLT: Verifying ManagementServer Username" }
    ]
  },
  {
    "name": "TrocaPadrao",
    "type": "provision",
    "channel": "inform",
    "precondition": "Tags.troca IS NOT NULL OR Tags.TROCA IS NOT NULL OR Tags.trocar IS NOT NULL",
    "actions": [
      { "type": "clearTag", "tag": "troca" },
      { "type": "setParameter", "path": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANIPConnection.1.NATEnabled", "value": false }
    ]
  },
  {
    "name": "setInform",
    "type": "provision",
    "channel": "inform",
    "precondition": null,
    "actions": [
      { "type": "clearTag", "tag": "inform" },
      { "type": "setParameter", "path": "InternetGatewayDevice.ManagementServer.PeriodicInformInterval", "value": 600 }
    ]
  },
  {
    "name": "ZTE-F670L",
    "type": "provision",
    "channel": "inform",
    "precondition": "DeviceID.ProductClass = \"F670L\"",
    "actions": [
      { "type": "setParameter", "path": "InternetGatewayDevice.ManagementServer.PeriodicInformEnable", "value": true },
      { "type": "setParameter", "path": "InternetGatewayDevice.ManagementServer.PeriodicInformInterval", "value": 60 }
    ]
  },
  {
    "name": "Set-LAN-DNS-UN1200",
    "type": "provision",
    "channel": "inform",
    "precondition": "DeviceID.ProductClass = \"UN1200X-AC\"",
    "actions": [
      { "type": "clearTag", "tag": "dns" },
      { "type": "clearTag", "tag": "DNS" },
      { "type": "setParameter", "path": "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DNSServers", "value": "179.51.184.203,179.51.184.194" }
    ]
  },
  {
    "name": "Set-inform-AC10",
    "type": "provision",
    "channel": "inform",
    "precondition": "DeviceID.ProductClass = \"AC10\"",
    "actions": [
      { "type": "setParameter", "path": "InternetGatewayDevice.ManagementServer.PeriodicInformEnable", "value": true },
      { "type": "setParameter", "path": "InternetGatewayDevice.ManagementServer.PeriodicInformInterval", "value": 600 }
    ]
  },
  {
    "name": "testeAndre",
    "type": "provision",
    "channel": "inform",
    "precondition": "Tags.colaborador IS NOT NULL",
    "actions": [
      { "type": "log", "message": "testeAndre: Coletando parametros de firewall" }
    ]
  },
  {
    "name": "trocaWAN",
    "type": "provision",
    "channel": "inform",
    "precondition": null,
    "actions": [
      { "type": "log", "message": "trocaWAN: Migrating WAN config" }
    ]
  },
  {
    "name": "FWUPgrade_AC10_Hard_V3.1",
    "type": "provision",
    "channel": "inform",
    "precondition": "DeviceID.ProductClass = \"AC10\"",
    "actions": [
      { "type": "log", "message": "FWUPgrade_AC10: checking firmware" }
    ]
  },
  {
    "name": "FWUPgrade_EG8145V5-V2",
    "type": "provision",
    "channel": "inform",
    "precondition": "DeviceID.ProductClass = \"EG8145V5-V2\"",
    "actions": [
      { "type": "log", "message": "FWUPgrade_EG8145V5: checking firmware" }
    ]
  },
  {
    "name": "FWUPgrade_EG8145X6",
    "type": "provision",
    "channel": "inform",
    "precondition": "DeviceID.ProductClass = \"EG8145X6\"",
    "actions": [
      { "type": "log", "message": "FWUPgrade_EG8145X6: checking firmware" }
    ]
  },
  {
    "name": "FWUPgrade_MP-X421RQ-F",
    "type": "provision",
    "channel": "inform",
    "precondition": "DeviceID.ProductClass = \"MP_X421RQ_F\"",
    "actions": [
      { "type": "log", "message": "FWUPgrade_MP-X421RQ: checking firmware" }
    ]
  },
  {
    "name": "FWUPgrade_MP_G421R",
    "type": "provision",
    "channel": "inform",
    "precondition": "DeviceID.ProductClass = \"MP_G421R\"",
    "actions": [
      { "type": "log", "message": "FWUPgrade_MP_G421R: checking firmware" }
    ]
  },
  {
    "name": "FWUPgrade_UN1200X",
    "type": "provision",
    "channel": "inform",
    "precondition": "DeviceID.ProductClass = \"UN1200X-AC\"",
    "actions": [
      { "type": "log", "message": "FWUPgrade_UN1200X: checking firmware" }
    ]
  }
];

async function seed() {
  const tenant = await prisma.tenant.findFirst({ where: { slug: 'default-isp' } })
    || await prisma.tenant.findFirst();
  if (!tenant) {
    console.log('No tenant found. Skipping script seed.');
    return;
  }

  let count = 0;
  for (const p of provisions) {
    const existing = await prisma.script.findUnique({ where: { name: p.name } });
    if (!existing) {
      await prisma.script.create({
        data: {
          ...p,
          tenantId: tenant.id,
        },
      });
      count++;
      console.log(`  Created script: ${p.name}`);
    } else {
      console.log(`  Already exists: ${p.name}`);
    }
  }
  console.log(`\nSeeded ${count} GenieACS scripts.`);
}

seed()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
