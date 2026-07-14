"""Check pending tasks for TP-Link devices"""
import urllib.request, json

base = 'http://179.51.184.205/api'

data = json.dumps({'email': 'admin@acs.local', 'password': 'admin123'}).encode()
req = urllib.request.Request(f'{base}/auth/login', data, {'Content-Type': 'application/json'})
r = urllib.request.urlopen(req)
token = json.loads(r.read())['accessToken']

# Check tasks endpoint
try:
    req2 = urllib.request.Request(f'{base}/tasks?status=PENDING&take=50', headers={'Authorization': f'Bearer {token}'})
    r2 = urllib.request.urlopen(req2)
    tasks = json.loads(r2.read())
    print(f'Pending tasks:')
    if isinstance(tasks, list):
        for t in tasks:
            print(f'  [{t.get("status")}] device={t.get("deviceId")} type={t.get("type")} created={t.get("createdAt","")[:19]}')
    else:
        data_list = tasks.get('data', tasks.get('tasks', []))
        for t in data_list:
            print(f'  [{t.get("status")}] device={t.get("deviceId")} type={t.get("type")} created={t.get("createdAt","")[:19]}')
        print(f'Total: {tasks.get("total", len(data_list))}')
except urllib.error.HTTPError as e:
    err = e.read().decode()
    print(f'Tasks error: {e.code} - {err[:300]}')

# Also check status of all tasks for XX530v
try:
    req3 = urllib.request.Request(f'{base}/devices', headers={'Authorization': f'Bearer {token}'})
    r3 = urllib.request.urlopen(req3)
    devices = json.loads(r3.read())
    for d in devices.get('data', []):
        if 'xx530' in d.get('modelName', '').lower() or 'xc220' in d.get('modelName', '').lower():
            print(f'\n{d["modelName"]} ({d["serial"]}):')
            print(f'  Parameters count: {len(d.get("parameters", {})) if isinstance(d.get("parameters"), dict) else "N/A"}')
            print(f'  Has __discovered__: {"__discovered__" in (d.get("parameters", {}) or {})}')
            discovered = (d.get("parameters", {}) or {}).get("__discovered__", {})
            print(f'  Leaves count: {len(discovered.get("_leaves", []))}')
            print(f'  Objects count: {len(discovered.get("_objects", []))}')
except urllib.error.HTTPError as e:
    err = e.read().decode()
    print(f'Devices error: {e.code} - {err[:200]}')
