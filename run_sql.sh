#!/bin/bash
docker exec -i tr069-postgres psql -U acs -d tr069_acs <<'EOSQL'
SELECT error FROM "Task" WHERE id = '6283a1a0-0001-4000-8000-000000000001';

-- Also check recent FAILED tasks for this device to understand failure reason
SELECT id, type, error FROM "Task" WHERE "deviceId" = 'cmrc2kdn6000liuphgwpkscrj' AND status = 'FAILED' AND "createdAt" >= NOW() - INTERVAL '5 hours' LIMIT 5;

DELETE FROM "Task" WHERE id IN ('6283a1a0-0001-4000-8000-000000000001', '76c0a0a0-ebd3-4185-8b28-63d62e1df90a', 'c8fee76f-7abb-4ccb-9411-fec546ac6916');

INSERT INTO "Task" (id, "deviceId", type, status, payload, "tenantId", "createdAt", "updatedAt")
VALUES ('6283a1a0-0001-4000-8000-000000000001', 'cmrc2kdn6000liuphgwpkscrj', 'GetParameterValues', 'PENDING', 
  '{"names":[
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.AssociatedDevice.1.AssociatedDeviceMACAddress",
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.AssociatedDevice.1.AssociatedDeviceIPAddress",
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.AssociatedDevice.1.X_ZTE-COM_AssociatedDeviceName",
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.AssociatedDevice.2.AssociatedDeviceMACAddress",
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.AssociatedDevice.2.AssociatedDeviceIPAddress",
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.AssociatedDevice.2.X_ZTE-COM_AssociatedDeviceName",
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.AssociatedDevice.3.AssociatedDeviceMACAddress",
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.AssociatedDevice.3.AssociatedDeviceIPAddress",
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.AssociatedDevice.3.X_ZTE-COM_AssociatedDeviceName",
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.AssociatedDevice.4.AssociatedDeviceMACAddress",
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.AssociatedDevice.4.AssociatedDeviceIPAddress",
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.AssociatedDevice.4.X_ZTE-COM_AssociatedDeviceName",
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.AssociatedDevice.5.AssociatedDeviceMACAddress",
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.AssociatedDevice.5.AssociatedDeviceIPAddress",
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.AssociatedDevice.5.X_ZTE-COM_AssociatedDeviceName"
  ]}',
  'cmpr8l0fc0000zteztuzi8qzl', NOW() - INTERVAL '3 hours', NOW());

DELETE FROM "Task" WHERE id = '6283a1a0-0005-4000-8000-000000000005';

INSERT INTO "Task" (id, "deviceId", type, status, payload, "tenantId", "createdAt", "updatedAt")
VALUES ('6283a1a0-0005-4000-8000-000000000005', 'cmrc2kdn6000liuphgwpkscrj', 'GetParameterValues', 'PENDING', 
  '{"names":[
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.AssociatedDevice.1.AssociatedDeviceMACAddress",
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.AssociatedDevice.1.AssociatedDeviceIPAddress",
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.AssociatedDevice.1.X_ZTE-COM_AssociatedDeviceName",
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.AssociatedDevice.2.AssociatedDeviceMACAddress",
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.AssociatedDevice.2.AssociatedDeviceIPAddress",
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.AssociatedDevice.2.X_ZTE-COM_AssociatedDeviceName",
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.AssociatedDevice.3.AssociatedDeviceMACAddress",
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.AssociatedDevice.3.AssociatedDeviceIPAddress",
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.AssociatedDevice.3.X_ZTE-COM_AssociatedDeviceName",
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.AssociatedDevice.4.AssociatedDeviceMACAddress",
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.AssociatedDevice.4.AssociatedDeviceIPAddress",
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.AssociatedDevice.4.X_ZTE-COM_AssociatedDeviceName"
  ]}',
  'cmpr8l0fc0000zteztuzi8qzl', NOW() - INTERVAL '3 hours', NOW());

SELECT id, type, status, "deviceId", "createdAt" FROM "Task" WHERE id IN ('6283a1a0-0001-4000-8000-000000000001', '6283a1a0-0005-4000-8000-000000000005');
EOSQL