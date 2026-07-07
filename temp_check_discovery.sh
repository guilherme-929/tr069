#!/bin/bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@acs.local","password":"admin123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

echo "=== DISCOVERY STATUS ==="
curl -s "http://localhost:3000/api/devices/cmr9n7d390009h85bjbptneoh/discover/status" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

echo ""
echo "=== ALL TASKS ==="
curl -s "http://localhost:3000/api/provisioning/tasks?limit=50" -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys,json
data = json.load(sys.stdin)
tasks = data.get('data', []) or data if isinstance(data, list) else []
print(f'Total tasks: {len(tasks)}')
for t in tasks:
    print(f'{t[\"type\"]:25s} {t[\"status\"]:15s} {t.get(\"deviceId\",\"\")[:20]:20s} created={t.get(\"createdAt\",\"\")[:19]}')
"

echo ""
echo "=== DEVICE PARAMETERS PREVIEW ==="
curl -s "http://localhost:3000/api/devices/cmr9n7d390009h85bjbptneoh" -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys,json
d = json.load(sys.stdin)
params = d.get('parameters', {})
discovered = params.get('__discovered__', {})
print(f'__discovered__ keys: {list(discovered.keys()) if isinstance(discovered, dict) else \"not a dict\"}')
if isinstance(discovered, dict):
    print(f'Objects: {len(discovered.get(\"_objects\", []))}')
    print(f'Leaves: {len(discovered.get(\"_leaves\", []))}')
    print(f'Fetched values: {len(discovered.get(\"_values\", {}))}')
    print(f'First 10 objects: {discovered.get(\"_objects\", [])[:10]}')
    print(f'First 20 leaves: {discovered.get(\"_leaves\", [])[:20]}')
"
