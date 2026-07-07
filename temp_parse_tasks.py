import json, sys

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
        print("(empty)")
elif isinstance(data, dict):
    print(json.dumps(data, indent=2)[:500])
