"""Check virtual parameters and WiFi for XX530v"""
import urllib.request, json

base = 'http://179.51.184.205/api'
data = json.dumps({'email': 'admin@acs.local', 'password': 'admin123'}).encode()
req = urllib.request.Request(f'{base}/auth/login', data, {'Content-Type': 'application/json'})
r = urllib.request.urlopen(req)
token = json.loads(r.read())['accessToken']

did = 'cmrd6v1nl07rlzyfi90vdjy5q'

# Get device with params
req2 = urllib.request.Request(f'{base}/devices/{did}', headers={'Authorization': f'Bearer {token}'})
r2 = urllib.request.urlopen(req2)
detail = json.loads(r2.read())
params = detail.get('parameters', {}) or {}

# Show WiFi params
print('=== WiFi params stored ===')
wifi = {k: v for k, v in params.items() if 'Device.WiFi' in k}
for k, v in sorted(wifi.items()):
    print(f'  {k} = {v}')

# Show virtual params
print('\n=== Virtual Parameters ===')
vp = {k: v for k, v in params.items() if k.startswith('VirtualParameters')}
for k, v in sorted(vp.items()):
    print(f'  {k} = {v}')

# API virtual-params endpoint
print('\n=== /virtual-params API ===')
req3 = urllib.request.Request(f'{base}/devices/{did}/virtual-params', headers={'Authorization': f'Bearer {token}'})
r3 = urllib.request.urlopen(req3)
vp2 = json.loads(r3.read())
for k, v in sorted(vp2.items()):
    print(f'  {k} = {v}')
