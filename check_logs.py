"""Check recent logs for TP-Link devices"""
import urllib.request, json, datetime

base = 'http://179.51.184.205/api'

data = json.dumps({'email': 'admin@acs.local', 'password': 'admin123'}).encode()
req = urllib.request.Request(f'{base}/auth/login', data, {'Content-Type': 'application/json'})
r = urllib.request.urlopen(req)
token = json.loads(r.read())['accessToken']

# Check device last contact via list
req2 = urllib.request.Request(f'{base}/devices', headers={'Authorization': f'Bearer {token}'})
r2 = urllib.request.urlopen(req2)
devices = json.loads(r2.read())
for d in devices.get('data', []):
    print(f'{d["modelName"]:15s} ({d["serial"]}): lastContact={d["lastContact"]} status={d["status"]}')

# Try to check logs - see if there are any recent events
try:
    req3 = urllib.request.Request(f'{base}/logs?take=10', headers={'Authorization': f'Bearer {token}'})
    r3 = urllib.request.urlopen(req3)
    logs = json.loads(r3.read())
    print(f'\nRecent logs:')
    for l in (logs.get('data', []) if isinstance(logs, dict) else logs)[:10]:
        dt = l.get('createdAt', '')[:19] if l.get('createdAt') else ''
        print(f'  [{dt}] {l.get("action","")} / {l.get("entity","")} / {l.get("detail","")[:120]}')
except Exception as e:
    print(f'Logs error: {e}')
