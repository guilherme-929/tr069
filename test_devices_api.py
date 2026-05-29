import urllib.request, json
base = 'http://177.93.157.113/api'
data = json.dumps({'email': 'admin@acs.local', 'password': 'admin123'}).encode()
req = urllib.request.Request(f'{base}/auth/login', data, {'Content-Type': 'application/json'})
r = urllib.request.urlopen(req)
token = json.loads(r.read())['accessToken']

# Test devices
req2 = urllib.request.Request(f'{base}/devices?page=1&limit=10&search=', headers={'Authorization': f'Bearer {token}'})
r2 = urllib.request.urlopen(req2)
res = json.loads(r2.read())
print(f'Devices API: {r2.status}, total: {res["total"]}')
for d in res.get('data', []):
    print(f'  {d["serial"]} / {d["modelName"]} / {d["status"]}')
