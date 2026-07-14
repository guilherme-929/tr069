"""Fix TP-Link: reset pending tasks, trigger WiFi read, add TR-181 virtual params"""
import urllib.request, json

base = 'http://179.51.184.205/api'

data = json.dumps({'email': 'admin@acs.local', 'password': 'admin123'}).encode()
req = urllib.request.Request(f'{base}/auth/login', data, {'Content-Type': 'application/json'})
r = urllib.request.urlopen(req)
token = json.loads(r.read())['accessToken']
print('Token OK')

# Get device IDs
req2 = urllib.request.Request(f'{base}/devices', headers={'Authorization': f'Bearer {token}'})
r2 = urllib.request.urlopen(req2)
devices = json.loads(r2.read())

tplink_ids = {}
for d in devices.get('data', []):
    if 'XX530' in d['modelName'] or 'XC220' in d['modelName']:
        tplink_ids[d['modelName']] = d['id']
        print(f'{d["modelName"]} ({d["serial"]}): id={d["id"]}')

# Check config for virtual param definitions
try:
    req3 = urllib.request.Request(f'{base}/system-config?category=virtual', headers={'Authorization': f'Bearer {token}'})
    r3 = urllib.request.urlopen(req3)
    configs = json.loads(r3.read())
    print(f'\nCurrent virtual param configs:')
    for c in configs if isinstance(configs, list) else configs.get('data', []):
        print(f'  {c["key"]}: {c.get("value", "")[:200]}')
except urllib.error.HTTPError as e:
    err = e.read().decode()
    print(f'Config error: {e.code} - {err[:300]}')
