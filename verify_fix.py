import urllib.request, json

base = 'http://179.51.184.205/api'

# Login
data = json.dumps({'email': 'admin@acs.local', 'password': 'admin123'}).encode()
req = urllib.request.Request(f'{base}/auth/login', data, {'Content-Type': 'application/json'})
r = urllib.request.urlopen(req)
token = json.loads(r.read())['accessToken']

# Get device detail
req2 = urllib.request.Request(f'{base}/devices/cmrd6v1nl07rlzyfi90vdjy5q', headers={'Authorization': f'Bearer {token}'})
r2 = urllib.request.urlopen(req2)
d = json.loads(r2.read())
params = d.get('parameters', {}) or {}

# Check for object values (would crash React)
objs = {k: v for k, v in params.items() if isinstance(v, dict)}
print(f'Object values (would crash React): {len(objs)}')
for k, v in objs.items():
    print(f'  {k}: {json.dumps(v, ensure_ascii=False)}')

# Check virtual params
vps = {k: params[k] for k in params if k.startswith('VirtualParameters')}
print(f'\nVirtualParameters: {json.dumps(vps, ensure_ascii=False, indent=2)}')
