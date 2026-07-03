#!/bin/bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@acs.local","password":"admin123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

DEVICE_ID="cmr3uhg6v00091hv8go5q0b15"
echo "=== DEVICE INFO ==="
curl -s "http://localhost:3000/api/devices/$DEVICE_ID" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import sys,json
d=json.load(sys.stdin)
tasks=d.get('tasks',[])
pending=[t for t in tasks if t['status']=='PENDING']
print(f'Status: {d[\"status\"]}')
print(f'Last Inform: {d[\"lastInform\"]}')
print(f'Total tasks: {len(tasks)}, Pending: {len(pending)}')
for t in pending[:5]:
    print(f'  - {t[\"type\"]} status={t[\"status\"]} created={t[\"createdAt\"]}')
"

echo ""
echo "=== LOGS (latest 20) ==="
cd /root/tr069
docker compose logs --tail=20 backend 2>&1 | grep -iE 'inform|session|task|wifi|cwmp|connection'
