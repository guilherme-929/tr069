import urllib.request, json, ssl, time

base = 'http://179.51.184.205/api'
ctx = ssl._create_unverified_context()

data = json.dumps({'email': 'admin@acs.local', 'password': 'admin123'}).encode()
req = urllib.request.Request(f'{base}/auth/login', data, {'Content-Type': 'application/json'})
with urllib.request.urlopen(req, context=ctx) as r:
    token = json.loads(r.read())['accessToken']
print("Token OK")

dev_id = 'cmr9n7d390009h85bjbptneoh'

# Send connection request
print("\n=== Sending ConnectionRequest ===")
req_cr = urllib.request.Request(
    f'{base}/devices/{dev_id}/connection-request',
    method='POST',
    headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
    data=b'{}'
)
try:
    with urllib.request.urlopen(req_cr, context=ctx, timeout=10) as r:
        print(json.loads(r.read()))
except Exception as e:
    print(f"ConnectionRequest error: {e}")
