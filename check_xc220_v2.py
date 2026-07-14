import urllib.request, json

base = 'http://127.0.0.1:3000/api'

data = json.dumps({'email': 'admin@acs.local', 'password': 'admin123'}).encode()
req = urllib.request.Request(f'{base}/auth/login', data, {'Content-Type': 'application/json'})
r = urllib.request.urlopen(req)
token = json.loads(r.read())['accessToken']

# XC220-G3
did = 'cmri87yx11mtxbl3jz44gs012'

req2 = urllib.request.Request(f'{base}/devices/{did}', headers={'Authorization': f'Bearer {token}'})
r2 = urllib.request.urlopen(req2)
detail = json.loads(r2.read())
p = detail.get('parameters', {}) or {}

# Check for object values (would crash React)
objs = {k: v for k, v in p.items() if isinstance(v, dict) and not k.startswith('_')}
print(f'Object values (would crash React): {len(objs)}')
for k, v in sorted(objs.items()):
    print(f'  {k}: {json.dumps(v, ensure_ascii=False)[:100]}')

# Check WiFi data
wifi = {k: v for k, v in p.items() if 'WiFi' in k or 'WLAN' in k}
print(f'\nWiFi/WLAN params: {len(wifi)}')
for k, v in sorted(wifi.items()):
    print(f'  {k} = {v}')

# Check VirtualParameters
vps = {k: p[k] for k in p if k.startswith('VirtualParameters')}
if vps:
    print(f'\nVirtualParameters:')
    for k, v in sorted(vps.items()):
        print(f'  {k} = {v}')
else:
    print('\nNo VirtualParameters found')

print(f'\nLast contact: {detail.get("lastContact", "unknown")}')
