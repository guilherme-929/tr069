import urllib.request, json

base = 'http://127.0.0.1:3000/api'

data = json.dumps({'email': 'admin@acs.local', 'password': 'admin123'}).encode()
req = urllib.request.Request(f'{base}/auth/login', data, {'Content-Type': 'application/json'})
r = urllib.request.urlopen(req)
token = json.loads(r.read())['accessToken']

req3 = urllib.request.Request(f'{base}/config?category=virtual', headers={'Authorization': f'Bearer {token}'})
r3 = urllib.request.urlopen(req3)
configs = json.loads(r3.read())
for c in configs:
    key = c.get('key', '')
    if 'Wifi5G' in key or 'wifi5' in key:
        print('Full value for', key)
        print(c.get('value', '{}'))
        print()
        print('ID:', c.get('id', '?'))
