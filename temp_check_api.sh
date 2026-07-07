#!/bin/bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@acs.local","password":"admin123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")
echo "=== DEVICE LIST ==="
curl -s "http://localhost:3000/api/devices?limit=5" -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys,json
data = json.load(sys.stdin)
for d in data.get('data', []):
    print(f\"ID: {d['id']}\")
    print(f\"  Serial: {d.get('serial')}\")
    print(f\"  connectionRequestUrl: {d.get('connectionRequestUrl')}\")
    print(f\"  ipAddress: {d.get('ipAddress')}\")
    print(f\"  status: {d.get('status')}\")
    print(f\"  modelName: {d.get('modelName')}\")
    print(f\"  parameters count: {len(d.get('parameters', {})) if isinstance(d.get('parameters'), dict) else 0}\")
    print()
"
