#!/bin/bash
set -e

echo "=== Waiting for backend to be healthy ==="
sleep 5

TOKEN=$(curl -s http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@acs.local","password":"admin123"}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["accessToken"])')
echo "Token OK"

# Cancel any existing GetParameterValues tasks for XX530v
echo "=== Cancelling old tasks ==="
docker exec tr069-postgres psql -U acs -d tr069_acs -c "UPDATE \"Task\" SET status='CANCELLED', error='Retry with fixed XML' WHERE status='PENDING' AND \"deviceId\" = (SELECT id FROM \"Device\" WHERE serial='22521Y0001317') AND type='GetParameterValues';"

# Queue WiFi read with correct TR-181 paths
echo ""
echo "=== Triggering WiFi read on XX530v ==="
curl -s -X POST http://localhost:3000/api/devices/cmrd6v1nl07rlzyfi90vdjy5q/wifi/read \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{}' | python3 -m json.tool

echo ""
echo "=== Pending tasks ==="
docker exec tr069-postgres psql -U acs -d tr069_acs -c "SELECT d.serial, d.\"modelName\", t.type, t.status, COUNT(*) as qty FROM \"Task\" t JOIN \"Device\" d ON d.id = t.\"deviceId\" WHERE t.status='PENDING' GROUP BY d.serial, d.\"modelName\", t.type, t.status;"
