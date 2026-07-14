#!/bin/bash
# Queue single param GetParameterValues for XX530v to test if individual reads work
set -e

TOKEN=$(curl -s http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@acs.local","password":"admin123"}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["accessToken"])')

XX530V_ID="cmrd6v1nl07rlzyfi90vdjy5q"

echo "Queueing single GetParameterValues for Device.WiFi.SSID.1.SSID..."

curl -s -X POST "http://localhost:3000/api/devices/${XX530V_ID}/fetch-all" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"names": ["Device.WiFi.SSID.1.SSID"], "connectionRequest": true}' | python3 -m json.tool

echo ""
echo "Checking task count..."
docker exec tr069-postgres psql -U acs -d tr069_acs -c "SELECT type, status, COUNT(*) FROM \"Task\" WHERE \"deviceId\"='${XX530V_ID}' AND status='PENDING' GROUP BY type, status;"
