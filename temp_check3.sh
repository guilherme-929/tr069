#!/bin/bash
curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@acs.local","password":"admin123"}' > /tmp/login.json

TOKEN=$(python3 -c '
import json
with open("/tmp/login.json") as f:
    d = json.load(f)
print(d.get("accessToken", ""))
')

curl -s "http://localhost:3000/api/tasks?limit=100" \
  -H "Authorization: Bearer $TOKEN" > /tmp/tasks.json

python3 << 'PYEOF'
import json
with open("/tmp/tasks.json") as f:
    d = json.load(f)
data = d.get("data", [])
if not data:
    print("(no tasks found)")
else:
    for t in data:
        typ = t.get("type", "?")
        st = t.get("status", "?")
        att = t.get("attempts", 0)
        err = t.get("error", "")
        print("  %s: status=%s, attempts=%s, error=%s" % (typ, st, att, err))
PYEOF
