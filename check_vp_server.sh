#!/bin/bash
TOKEN=$(curl -s http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@acs.local","password":"admin123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

echo "=== Device raw parameters (WiFi only) ==="
curl -s http://localhost:3000/api/devices/cmrd6v1nl07rlzyfi90vdjy5q -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys,json
d = json.load(sys.stdin)
params = d.get('parameters',{}) or {}
for k,v in sorted(params.items()):
    if 'Device.WiFi' in k:
        print(f'  {k} = {v}')
"

echo ""
echo "=== VirtualParameters ==="
curl -s http://localhost:3000/api/devices/cmrd6v1nl07rlzyfi90vdjy5q -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys,json
d = json.load(sys.stdin)
params = d.get('parameters',{}) or {}
for k,v in sorted(params.items()):
    if k.startswith('VirtualParameters'):
        print(f'  {k} = {v}')
"

echo ""
echo "=== /virtual-params endpoint ==="
curl -s http://localhost:3000/api/devices/cmrd6v1nl07rlzyfi90vdjy5q/virtual-params -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
