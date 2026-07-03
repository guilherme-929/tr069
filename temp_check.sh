#!/bin/bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@acs.local","password":"admin123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")
echo "TOKEN: $TOKEN"
echo "---"
curl -s "http://localhost:3000/api/devices?limit=5" -H "Authorization: Bearer $TOKEN" 2>&1
echo "---"
# Get details of first device
DEVICE_ID=$(curl -s "http://localhost:3000/api/devices?limit=1" -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data'][0]['id'] if d['data'] else '')")
echo "DEVICE_ID: $DEVICE_ID"
if [ -n "$DEVICE_ID" ]; then
  echo "---DEVICE_DETAIL---"
  curl -s "http://localhost:3000/api/devices/$DEVICE_ID" -H "Authorization: Bearer $TOKEN" 2>&1
  echo "---PARAMETERS---"
  curl -s "http://localhost:3000/api/devices/$DEVICE_ID" -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); p=d.get('parameters',{}); [print(f'{k} = {v}') for k,v in p.items()]" 2>/dev/null
fi
