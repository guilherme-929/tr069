import urllib.request, json

base = 'http://127.0.0.1:3000/api'

data = json.dumps({'email': 'admin@acs.local', 'password': 'admin123'}).encode()
req = urllib.request.Request(f'{base}/auth/login', data, {'Content-Type': 'application/json'})
r = urllib.request.urlopen(req)
token = json.loads(r.read())['accessToken']

# Find XC220-G3
req_devs = urllib.request.Request(f'{base}/devices?search=XC220', headers={'Authorization': f'Bearer {token}'})
r_devs = urllib.request.urlopen(req_devs)
devs = json.loads(r_devs.read())

print('Devices found:', len(devs))

for d in devs:
    did = d['id']
    serial = d['serial']
    
    # Get full device
    req2 = urllib.request.Request(f'{base}/devices/{did}', headers={'Authorization': f'Bearer {token}'})
    r2 = urllib.request.urlopen(req2)
    detail = json.loads(r2.read())
    p = detail.get('parameters', {}) or {}
    
    # Check for object values
    objs = {k: v for k, v in p.items() if isinstance(v, dict) and not k.startswith('_')}
    print(f'\n{serial} ({did}): object values = {len(objs)}')
    for k, v in sorted(objs.items()):
        print(f'  {k}: {json.dumps(v, ensure_ascii=False)[:100]}')
    
    # Check WiFi data
    wifi = {k: v for k, v in p.items() if 'WiFi' in k or 'WLAN' in k}
    print(f'  WiFi/WLAN params: {len(wifi)}')
    for k in sorted(wifi.keys())[:10]:
        print(f'    {k} = {p[k]}')
    if len(wifi) > 10:
        print(f'    ... and {len(wifi) - 10} more')
    
    # Check VirtualParameters
    vps = {k: p[k] for k in p if k.startswith('VirtualParameters')}
    if vps:
        print(f'  VirtualParameters:')
        for k, v in sorted(vps.items()):
            print(f'    {k} = {v}')
    
    print(f'  Last contact: {detail.get("lastContact", "unknown")}')
