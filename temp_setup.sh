#!/bin/bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@acs.local","password":"admin123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

DEVICE_ID="cmr3uhg6v00091hv8go5q0b15"
cd /root/tr069

echo "1. Creating WiFi read task..."
curl -s -X POST "http://localhost:3000/api/devices/$DEVICE_ID/wifi/read" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{}' | python3 -m json.tool

echo ""
echo "2. Creating Provision task..."
curl -s -X POST "http://localhost:3000/api/provisioning/device/$DEVICE_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{}' | python3 -m json.tool

echo ""
sleep 2
echo "3. Tasks created. Checking..."
docker compose exec -T postgres psql -U acs -d tr069_acs -c "SELECT type, status, count(*) FROM \"Task\" WHERE \"deviceId\"='$DEVICE_ID' GROUP BY type, status ORDER BY type;"
