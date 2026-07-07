#!/bin/bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@acs.local","password":"admin123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")
echo "=== Current tasks ==="
curl -s "http://localhost:3000/api/provisioning/tasks?limit=5" -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys,json
data = json.load(sys.stdin)
tasks = data.get('data', [])
print(f'Total tasks: {len(tasks)}')
for t in tasks[:5]:
    print(f'{t[\"type\"]} {t[\"status\"]}')
"
echo ""
echo "=== Triggering new discovery ==="
curl -s -X POST "http://localhost:3000/api/devices/cmr9n7d390009h85bjbptneoh/discover" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
echo ""
echo "=== Check discovery status ==="
sleep 2
curl -s "http://localhost:3000/api/devices/cmr9n7d390009h85bjbptneoh/discover/status" -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys,json
d = json.load(sys.stdin)
print(f'Status: {d.get(\"status\")}')
print(f'Objects: {d.get(\"objects\")}')
print(f'Leaves: {d.get(\"leaves\")}')
print(f'Fetched: {d.get(\"fetched\")}')
print(f'Pending tasks: {d.get(\"pendingTasks\")}')
"
