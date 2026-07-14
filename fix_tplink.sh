#!/bin/bash
set -e

echo "=== 1. Cancelling pending tasks for TP-Link devices ==="
docker exec tr069-postgres psql -U acs -d tr069_acs -c "
UPDATE \"Task\" SET status='CANCELLED', error='Cancelled by admin - TP-Link cleanup'
WHERE status='PENDING' AND \"deviceId\" IN (
  SELECT id FROM \"Device\" WHERE serial IN ('22521Y0001317', 'V25A024003204')
);
"

echo "=== 2. Checking remaining tasks ==="
docker exec tr069-postgres psql -U acs -d tr069_acs -c "
SELECT status, type, COUNT(*) as qty FROM \"Task\"
WHERE \"deviceId\" IN (SELECT id FROM \"Device\" WHERE serial IN ('22521Y0001317', 'V25A024003204'))
GROUP BY status, type ORDER BY status, type;
"

echo "=== 3. Checking current virtual param configs ==="
docker exec tr069-postgres psql -U acs -d tr069_acs -c "
SELECT key, value FROM \"Config\" WHERE category='virtual';
"

echo "=== 4. Adding TR-181 paths to vWifi-2G and vWifi-5G virtual params ==="

docker exec tr069-postgres psql -U acs -d tr069_acs -c "
UPDATE \"Config\" SET value='{
  \"paths\": [
    \"InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID\",
    \"InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Channel\",
    \"InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Status\",
    \"Device.WiFi.SSID.1.SSID\",
    \"Device.WiFi.SSID.1.Enable\"
  ],
  \"label\": \"vWifi-2G\",
  \"description\": \"WiFi 2.4GHz summary (SSID | Ch: X | Status)\",
  \"transform\": \"join\",
  \"separator\": \" | \"
}' WHERE key='virtualparam.vWifi-2G';
"

docker exec tr069-postgres psql -U acs -d tr069_acs -c "
UPDATE \"Config\" SET value='{
  \"paths\": [
    \"InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.SSID\",
    \"InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID\",
    \"InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.Channel\",
    \"InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.Channel\",
    \"InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.Status\",
    \"InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.Status\",
    \"Device.WiFi.SSID.1.SSID\",
    \"Device.WiFi.SSID.1.Enable\",
    \"Device.WiFi.SSID.2.SSID\",
    \"Device.WiFi.SSID.2.Enable\"
  ],
  \"label\": \"vWifi-5G\",
  \"description\": \"WiFi 5GHz summary (SSID | Ch: X | Status)\",
  \"transform\": \"join\",
  \"separator\": \" | \"
}' WHERE key='virtualparam.vWifi-5G';
"

echo "=== 5. Getting auth token ==="
TOKEN=$(curl -s http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@acs.local","password":"admin123"}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["accessToken"])')
echo "Token obtained"

echo "=== 6. Triggering WiFi read on XX530v ==="
curl -s -X POST http://localhost:3000/api/devices/cmrd6v1nl07rlzyfi90vdjy5q/wifi/read \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{}' | python3 -m json.tool

echo ""
echo "=== 7. Triggering WiFi read on XC220-G3 ==="
curl -s -X POST http://localhost:3000/api/devices/cmri87yx11mtxbl3jz44gs012/wifi/read \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{}' | python3 -m json.tool

echo ""
echo "=== Done! ==="
