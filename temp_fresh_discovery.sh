#!/bin/bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@acs.local","password":"admin123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

echo "=== Triggering discovery ==="
curl -s -X POST "http://localhost:3000/api/devices/cmr9n7d390009h85bjbptneoh/discover" -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys,json
d = json.load(sys.stdin)
print(f'Task ID: {d.get(\"task\",{}).get(\"id\")}')
print(f'Message: {d.get(\"message\")}'
"

echo ""
echo "=== Tasks after cleanup + discovery ==="
curl -s "http://localhost:3000/api/devices/cmr9n7d390009h85bjbptneoh/discover/status" -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys,json
d = json.load(sys.stdin)
print(f'Status: {d.get(\"status\")}')
print(f'Pending tasks: {d.get(\"pendingTasks\")}')
print(f'Parameters: {d.get(\"fetched\")}')
"

echo ""
echo "=== Backend logs ==="
docker logs tr069-backend --since 2m 2>&1 | grep -E 'CWMP req|discover|discovery|pending tasks' | tail -10
