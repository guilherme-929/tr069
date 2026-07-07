#!/bin/bash
set -e

# Login
curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@acs.local","password":"admin123"}' > /tmp/login.json

TOKEN=$(python3 -c 'import json; f=open("/tmp/login.json"); d=json.load(f); print(d.get("accessToken",""))')

# Get all tasks
curl -s "http://localhost:3000/api/provisioning/tasks?limit=100&status=ALL" \
  -H "Authorization: Bearer $TOKEN" > /tmp/tasks.json

python3 << 'SCRIPT'
import json
with open("/tmp/tasks.json") as f:
    d = json.load(f)
data = d.get("data", d)
if isinstance(data, list):
    for t in data:
        typ = t.get("type", "?")
        st = t.get("status", "?")
        att = t.get("attempts", 0)
        err = t.get("error", "")[:80]
        print("  %s: status=%s, attempts=%s, error=%s" % (typ, st, att, err))
    if not data:
        print("(no tasks)")
elif isinstance(data, dict):
    print(json.dumps(data, indent=2)[:500])
SCRIPT

# Get device info
curl -s "http://localhost:3000/api/devices?page=1&limit=20" \
  -H "Authorization: Bearer $TOKEN" > /tmp/devices.json

python3 << 'SCRIPT'
import json
with open("/tmp/devices.json") as f:
    d = json.load(f)
for dev in d.get("data", []):
    print("Device: %s" % dev.get("serial", "?"))
    print("  status: %s" % dev.get("status", "?"))
    params = dev.get("parameters", {})
    if isinstance(params, dict):
        discovered = params.get("__discovered__", {})
        if isinstance(discovered, dict):
            vals = discovered.get("_values", {})
            leaves = discovered.get("_leaves", [])
            print("  discovered leaves: %d" % len(leaves))
            print("  fetched values: %d" % len(vals))
            if vals:
                for k, v in list(vals.items())[:5]:
                    print("    %s = %s" % (k, v))
SCRIPT
