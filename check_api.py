import urllib.request, json

base = 'http://127.0.0.1:3000/api'

data = json.dumps({'email': 'admin@acs.local', 'password': 'admin123'}).encode()
req = urllib.request.Request(f'{base}/auth/login', data, {'Content-Type': 'application/json'})
r = urllib.request.urlopen(req)
token = json.loads(r.read())['accessToken']

# Check devices response format
req_devs = urllib.request.Request(f'{base}/devices?search=XC220', headers={'Authorization': f'Bearer {token}'})
r_devs = urllib.request.urlopen(req_devs)
devs = json.loads(r_devs.read())
print('Type:', type(devs).__name__)
print('Response preview:', json.dumps(devs, ensure_ascii=False)[:500])

# Try without search
req_devs2 = urllib.request.Request(f'{base}/devices?limit=5', headers={'Authorization': f'Bearer {token}'})
r_devs2 = urllib.request.urlopen(req_devs2)
devs2 = json.loads(r_devs2.read())
print('\nAll devices type:', type(devs2).__name__)
print('Preview:', json.dumps(devs2, ensure_ascii=False)[:500])
