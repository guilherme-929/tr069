#!/bin/bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@acs.local","password":"admin123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

echo "=== Sending Connection Request ==="
curl -s -X POST "http://localhost:3000/api/devices/cmr9n7d390009h85bjbptneoh/connection-request" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

echo ""
echo "=== Watching for CPE reconnect (30s) ==="
sleep 30
docker logs tr069-backend --since 1m 2>&1 | grep -E 'CWMP req|reconnected|sending command|pending tasks|ConnectionRequest'
