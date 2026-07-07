#!/bin/bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@acs.local","password":"admin123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

echo "=== DEVICE STATUS ==="
curl -s "http://localhost:3000/api/devices/cmr9n7d390009h85bjbptneoh" -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys,json
d = json.load(sys.stdin)
print(f'Serial: {d.get(\"serial\")}')
print(f'Status: {d.get(\"status\")}')
print(f'CR URL: {d.get(\"connectionRequestUrl\")}')
print(f'Last Contact: {d.get(\"lastContact\")}')
print(f'Parameters count: {len(d.get(\"parameters\", {}))}')
print(f'Parameters keys: {list(d.get(\"parameters\", {}).keys())[:25]}')
"

echo ""
echo "=== TASKS ==="
curl -s "http://localhost:3000/api/provisioning/tasks?limit=10" -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys,json
data = json.load(sys.stdin)
tasks = data.get('data', [])
print(f'Total tasks: {len(tasks)}')
for t in tasks:
    print(f'  {t[\"type\"]:25s} {t[\"status\"]:15s} attempts={t.get(\"attempts\",0)}/{t.get(\"maxAttempts\",3)}')
"
