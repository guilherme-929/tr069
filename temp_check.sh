#!/bin/bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@acs.local","password":"admin123"}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["accessToken"])')
echo "=== Device List ==="
curl -s 'http://localhost:3000/api/devices?page=1&limit=20' -H "Authorization: Bearer $TOKEN" | python3 -c '
import sys,json
d=json.load(sys.stdin)
for dev in d.get("data",[]):
    s=dev.get("serial","?")
    st=dev.get("status","?")
    lc=dev.get("lastContact","?")
    print(f"{s}: status={st}, lastContact={lc}")
'
echo "=== Pending/In-Progress Tasks ==="
curl -s 'http://localhost:3000/api/tasks?status=PENDING,IN_PROGRESS&limit=50' -H "Authorization: Bearer $TOKEN" | python3 -c '
import sys,json
d=json.load(sys.stdin)
for t in d.get("data",[]):
    print(f"  {t["id"]}: type={t["type"]}, status={t["status"]}, attempts={t.get("attempts",0)}")
'
