#!/bin/bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@acs.local","password":"admin123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

echo "=== DEVICE DETAIL ==="
curl -s "http://localhost:3000/api/devices/cmr9n7d390009h85bjbptneoh" -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys,json
d = json.load(sys.stdin)
print(f\"Serial: {d.get('serial')}\")
print(f\"Status: {d.get('status')}\")
print(f\"CR URL: {d.get('connectionRequestUrl')}\")
print(f\"IP: {d.get('ipAddress')}\")
print(f\"WAN: {d.get('wanIp')}\")
print(f\"Last Contact: {d.get('lastContact')}\")
print(f\"Parameters keys: {list(d.get('parameters', {}).keys())[:20]}\")
print(f\"Params total: {len(d.get('parameters', {}))}\")
"

echo ""
echo "=== TASKS ==="
curl -s "http://localhost:3000/api/provisioning/tasks?limit=20" -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys,json
data = json.load(sys.stdin)
tasks = data.get('data', []) or data if isinstance(data, list) else []
for t in tasks:
    print(f\"Type: {t['type']}, Status: {t['status']}, Device: {t.get('deviceId','')[:20]}, Created: {t.get('createdAt','')[:19]}\")
    if t.get('result'):
        print(f\"  Result keys: {len(t.get('result'))}\")
"

echo ""
echo "=== EVENTS ==="
curl -s "http://localhost:3000/api/devices/cmr9n7d390009h85bjbptneoh" -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys,json
d = json.load(sys.stdin)
p = d.get('parameters', {})
for k,v in p.items():
    if 'connection' in k.lower() or 'management' in k.lower() or 'url' in k.lower():
        print(f'{k} = {v}')
"
