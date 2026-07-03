#!/bin/bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@acs.local","password":"admin123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

DEVICE_ID="cmr3uhg6v00091hv8go5q0b15"

echo "=== 1. Re-queue a fresh WiFi Read to ensure it gets the latest task ==="
curl -s -X POST "http://localhost:3000/api/devices/$DEVICE_ID/wifi/read" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  | python3 -m json.tool

echo ""
echo "=== 2. Now send provision to push ACS_URL and WiFi settings ==="
curl -s -X POST "http://localhost:3000/api/provisioning/device/$DEVICE_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{}' \
  | python3 -m json.tool

echo ""
echo "=== 3. Check tasks now ==="
curl -s "http://localhost:3000/api/devices/$DEVICE_ID" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import sys,json
d=json.load(sys.stdin)
tasks=d.get('tasks',[])
pending=[t for t in tasks if t['status']=='PENDING']
inprog=[t for t in tasks if t['status']=='IN_PROGRESS']
print(f'Total: {len(tasks)}, Pending: {len(pending)}, InProgress: {len(inprog)}')
for t in (pending + inprog)[:5]:
    print(f'  {t[\"type\"]} [{t[\"status\"]}] {t[\"createdAt\"]}')
"
