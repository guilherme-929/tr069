import urllib.request, json

base = 'http://127.0.0.1:3000/api'

data = json.dumps({'email': 'admin@acs.local', 'password': 'admin123'}).encode()
req = urllib.request.Request(f'{base}/auth/login', data, {'Content-Type': 'application/json'})
r = urllib.request.urlopen(req)
token = json.loads(r.read())['accessToken']

# Check XC220-G3 virtual params
did_xc220 = 'cmri87yx11mtxbl3jz44gs012'
req = urllib.request.Request(f'{base}/devices/{did_xc220}/virtual-params', headers={'Authorization': f'Bearer {token}'})
r = urllib.request.urlopen(req)
vp = json.loads(r.read())
print('XC220-G3 virtual-params:')
for k, v in sorted(vp.items()):
    print(f'  {k} = {v}')

# Check XX530v virtual params
did_xx530 = 'cmrd6v1nl07rlzyfi90vdjy5q'
req = urllib.request.Request(f'{base}/devices/{did_xx530}/virtual-params', headers={'Authorization': f'Bearer {token}'})
r = urllib.request.urlopen(req)
vp = json.loads(r.read())
print('\nXX530v virtual-params:')
for k, v in sorted(vp.items()):
    print(f'  {k} = {v}')
