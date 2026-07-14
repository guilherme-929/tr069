#!/bin/bash
set -e

echo "=== 1. Cancel wrong TR-098 tasks for XX530v and queue correct TR-181 tasks ==="

# Cancel all PENDING tasks for XX530v
docker exec tr069-postgres psql -U acs -d tr069_acs -c "
UPDATE \"Task\" SET status='CANCELLED', error='Replaced with TR-181 WiFi read'
WHERE status='PENDING' AND \"deviceId\" = (SELECT id FROM \"Device\" WHERE serial='22521Y0001317');
"

# Queue correct Device.WiFi.SSID GetParameterValues for XX530v
# Read SSIDs for instances 1-4 (main SSIDs)
docker exec tr069-postgres psql -U acs -d tr069_acs -c "
INSERT INTO \"Task\" (id, \"deviceId\", type, status, payload, \"tenantId\", \"createdAt\", \"updatedAt\")
SELECT
  gen_random_uuid()::text,
  (SELECT id FROM \"Device\" WHERE serial='22521Y0001317'),
  'GetParameterValues',
  'PENDING',
  jsonb_build_object('names', ARRAY[
    'Device.WiFi.SSID.1.SSID',
    'Device.WiFi.SSID.1.Enable',
    'Device.WiFi.SSID.2.SSID',
    'Device.WiFi.SSID.2.Enable',
    'Device.WiFi.SSID.3.SSID',
    'Device.WiFi.SSID.3.Enable',
    'Device.WiFi.SSID.4.SSID',
    'Device.WiFi.SSID.4.Enable'
  ]),
  (SELECT \"tenantId\" FROM \"Device\" WHERE serial='22521Y0001317'),
  NOW(), NOW()
;
"

echo "=== 2. Update virtual parameter definitions to include TR-181 paths ==="

docker exec tr069-postgres psql -U acs -d tr069_acs -c "
UPDATE \"Config\" SET value='{
  \"label\": \"vWifi2G\",
  \"paths\": [
    \"InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID\",
    \"Device.WiFi.SSID.1.SSID\"
  ],
  \"transform\": \"first\",
  \"description\": \"2.4GHz WiFi SSID (TR-098 + TR-181 fallback)\"
}' WHERE key='virtualparam.vWifi2G';
"

docker exec tr069-postgres psql -U acs -d tr069_acs -c "
UPDATE \"Config\" SET value='{
  \"label\": \"vWifi5G\",
  \"paths\": [
    \"InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID\",
    \"InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.SSID\",
    \"Device.WiFi.SSID.2.SSID\",
    \"Device.WiFi.SSID.5.SSID\"
  ],
  \"transform\": \"first\",
  \"description\": \"5GHz WiFi SSID (TP-Link instance 2 or 5)\"
}' WHERE key='virtualparam.vWifi5G';
"

echo "=== 3. Verify config ==="
docker exec tr069-postgres psql -U acs -d tr069_acs -c "
SELECT key, value FROM \"Config\" WHERE key IN ('virtualparam.vWifi2G', 'virtualparam.vWifi5G');
"

echo "=== 4. Get auth token ==="
TOKEN=$(curl -s http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@acs.local","password":"admin123"}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["accessToken"])')
echo "Token OK"

echo ""
echo "=== 5. Check pending tasks ==="
docker exec tr069-postgres psql -U acs -d tr069_acs -c "
SELECT d.serial, d.\"modelName\", t.type, COUNT(*) as qty
FROM \"Task\" t JOIN \"Device\" d ON d.id = t.\"deviceId\"
WHERE t.status='PENDING' GROUP BY d.serial, d.\"modelName\", t.type;
"

echo ""
echo "=== Done. Waiting for CPE to process tasks... ==="
