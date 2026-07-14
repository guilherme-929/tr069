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

wlans = {k: v for k, v in p.items() if 'WLANConfiguration' in k}
print('WLANConfiguration values (' + str(len(wlans)) + '):')
for k, v in sorted(wlans.items()):
    print('  ' + k + ' = ' + str(v))

print()
req3 = urllib.request.Request(f'{base}/virtual-params', headers={'Authorization': f'Bearer {token}'})
r3 = urllib.request.urlopen(req3)
vps = json.loads(r3.read())
for vp in vps:
    label = vp.get('label', '?')
    slug = vp.get('slug', '?')
    paths = vp.get('paths', [])
    transform = vp.get('transform', 'first')
    print(label + ' (slug: ' + slug + ')')
    print('  paths: ' + str(paths))
    print('  transform: ' + transform)

print()
print('Last contact:', d.get('lastContact', 'unknown'))
