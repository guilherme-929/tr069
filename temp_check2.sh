#!/bin/bash
# Get auth token
curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@acs.local","password":"admin123"}' > /tmp/login.json

TOKEN=$(python3 -c 'import json; f=open("/tmp/login.json"); d=json.load(f); print(d.get("accessToken",""))')

echo "=== All Tasks ==="
curl -s "http://localhost:3000/api/tasks?limit=100" \
  -H "Authorization: Bearer $TOKEN" | python3 -c '
import sys,json
d=json.load(sys.stdin)
data = d.get("data", [])
for t in data:
    print(f"  {t.get(\"type\",\"?\")}: status={t.get(\"status\",\"?\")}, attempts={t.get(\"attempts\",0)}, error={t.get(\"error\",\"\")}")
if not data:
    print("  (no tasks)")
'
