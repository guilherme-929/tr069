#!/bin/bash
echo "=== Cleaning old tasks and keeping only new discovery ==="
docker exec tr069-postgres psql -U acs -d tr069_acs << 'SQL'
DELETE FROM "Task" WHERE "deviceId" = (SELECT id FROM "Device" WHERE serial = 'ZTE0QJNQ1407460') AND type IN ('GetParameterValues', 'GetParameterNames');
SQL

echo "=== Remaining tasks ==="
docker exec tr069-postgres psql -U acs -d tr069_acs << 'SQL'
SELECT type, status FROM "Task" WHERE "deviceId" = (SELECT id FROM "Device" WHERE serial = 'ZTE0QJNQ1407460');
SQL

echo ""
echo "=== Device current state ==="
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@acs.local","password":"admin123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

echo "--- Discovery status ---"
curl -s "http://localhost:3000/api/devices/cmr9n7d390009h85bjbptneoh/discover/status" -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys,json
d = json.load(sys.stdin)
print(f'Status: {d.get(\"status\")}')
print(f'Pending discovery tasks: {d.get(\"pendingTasks\")}')
print(f'Parameters: {d.get(\"fetched\")}')
"

echo ""
echo "--- Device info ---"
curl -s "http://localhost:3000/api/devices/cmr9n7d390009h85bjbptneoh" -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys,json
d = json.load(sys.stdin)
print(f'Serial: {d.get(\"serial\")}')
print(f'Status: {d.get(\"status\")}')
print(f'CR URL: {d.get(\"connectionRequestUrl\")}')
print(f'Parameters count: {len(d.get(\"parameters\", {}))}')
"
