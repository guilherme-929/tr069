"""Check API data"""
import urllib.request, json

base = 'http://179.51.184.205/api'

# Login
data = json.dumps({'email': 'admin@acs.local', 'password': 'admin123'}).encode()
req = urllib.request.Request(f'{base}/auth/login', data, {'Content-Type': 'application/json'})
r = urllib.request.urlopen(req)
token = json.loads(r.read())['accessToken']
print(f'Token OK')

# Dashboard stats
req2 = urllib.request.Request(f'{base}/acs/stats', headers={'Authorization': f'Bearer {token}'})
r2 = urllib.request.urlopen(req2)
print(f'Stats: {json.dumps(json.loads(r2.read()), indent=2)}')

# Devices
req3 = urllib.request.Request(f'{base}/devices', headers={'Authorization': f'Bearer {token}'})
r3 = urllib.request.urlopen(req3)
devices = json.loads(r3.read())
print(f'\nDevices total: {devices["total"]}')
for d in devices.get('data', []):
    print(f'  - {d["serial"]} / {d["modelName"]} / {d["status"]} / IP: {d["ipAddress"]} / lastContact: {d["lastContact"]}')

# Logs
req4 = urllib.request.Request(f'{base}/logs', headers={'Authorization': f'Bearer {token}'})
try:
    r4 = urllib.request.urlopen(req4)
    logs = json.loads(r4.read())
    print(f'\nLogs total: {logs.get("total", "?")}')
    for l in logs.get('data', [])[:10]:
        print(f'  - {l.get("action","")} / {l.get("entity","")} / {l.get("detail","")[:100]}')
except urllib.error.HTTPError as e:
    err = e.read().decode()
    print(f'\nLogs API error: {e.code} - {err[:300]}')

# Try events endpoint path
for path in ['/events', '/api/events']:
    try:
        req5 = urllib.request.Request(f'http://179.51.184.205{path}', headers={'Authorization': f'Bearer {token}'})
        r5 = urllib.request.urlopen(req5)
        print(f'\nEvents ({path}): {json.dumps(json.loads(r5.read()), indent=2)[:500]}')
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        print(f'\nEvents ({path}): {e.code} - {err[:200]}')
