import urllib.request, json

base = 'http://127.0.0.1:3000/api'

data = json.dumps({'email': 'admin@acs.local', 'password': 'admin123'}).encode()
req = urllib.request.Request(f'{base}/auth/login', data, {'Content-Type': 'application/json'})
r = urllib.request.urlopen(req)
token = json.loads(r.read())['accessToken']

req2 = urllib.request.Request(f'{base}/devices/cmrd6v1nl07rlzyfi90vdjy5q', headers={'Authorization': f'Bearer {token}'})
r2 = urllib.request.urlopen(req2)
d = json.loads(r2.read())
p = d.get('parameters', {}) or {}

wifi = {k: v for k, v in p.items() if 'Device.WiFi' in k or 'WLANConfiguration' in k}
print('WiFi params count:', len(wifi))
for k, v in sorted(wifi.items()):
    print(f'  {k} = {v}')

vp = {k: p[k] for k in p if k.startswith('VirtualParameters')}
print()
for k, v in sorted(vp.items()):
    print(f'{k} = {v}')
