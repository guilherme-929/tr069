import urllib.request, json

base = 'http://127.0.0.1:3000/api'

data = json.dumps({'email': 'admin@acs.local', 'password': 'admin123'}).encode()
req = urllib.request.Request(f'{base}/auth/login', data, {'Content-Type': 'application/json'})
r = urllib.request.urlopen(req)
token = json.loads(r.read())['accessToken']

# Get virtual param definitions
req3 = urllib.request.Request(f'{base}/config?category=virtual', headers={'Authorization': f'Bearer {token}'})
r3 = urllib.request.urlopen(req3)
configs = json.loads(r3.read())
print('Virtual param definitions:')
for c in configs:
    print('  key:', c.get('key', '?'))
    print('  value:', c.get('value', '{}')[:200])
    print()

# Get computed virtual params for the device
req4 = urllib.request.Request(f'{base}/devices/cmrd6v1nl07rlzyfi90vdjy5q/virtual-params', headers={'Authorization': f'Bearer {token}'})
r4 = urllib.request.urlopen(req4)
vps = json.loads(r4.read())
print('Computed virtual params:')
for k, v in sorted(vps.items()):
    print('  ' + k + ' = ' + str(v))
