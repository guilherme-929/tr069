import urllib.request, json, ssl, time, sys

base = 'http://179.51.184.205/api'
ctx = ssl._create_unverified_context()

data = json.dumps({'email': 'admin@acs.local', 'password': 'admin123'}).encode()
req = urllib.request.Request(f'{base}/auth/login', data, {'Content-Type': 'application/json'})
with urllib.request.urlopen(req, context=ctx) as r:
    token = json.loads(r.read())['accessToken']
print("Token OK")

dev_id = 'cmr9n7d390009h85bjbptneoh'
last_contact = ""

for i in range(600):
    time.sleep(10)
    
    try:
        req2 = urllib.request.Request(f'{base}/devices?search=ZTE0QJNQ1407460', headers={'Authorization': f'Bearer {token}'})
        with urllib.request.urlopen(req2, context=ctx) as r:
            devs = json.loads(r.read())['data']
        dev = devs[0]
    except Exception as e:
        print(f"[{i*10}s] Error: {e}")
        # refresh token
        data = json.dumps({'email': 'admin@acs.local', 'password': 'admin123'}).encode()
        req = urllib.request.Request(f'{base}/auth/login', data, {'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, context=ctx) as r:
            token = json.loads(r.read())['accessToken']
        continue
    
    contact = dev.get('lastContact', '')
    params = dev.get('parameters', {})
    disc = params.get('__discovered__', {})
    leaves = len(disc.get('_leaves', []))
    values = len(disc.get('_values', {}))
    status = dev['status']
    conn_url = dev.get('connectionRequestUrl', '')[:60]
    
    if contact != last_contact:
        print(f"\n[!] CONNECTION at {str(contact)[11:19]} | Status={status} | Leaves={leaves} | Values={values}", flush=True)
        last_contact = contact
    
    if i % 6 == 0 or status == 'ONLINE':
        print(f"[{i*10:4d}s] S={status:7s} C={str(contact)[11:19]:8s} L={leaves:4d} V={values:4d}", flush=True)
    
    if leaves > 10:
        print(f"\n✅ DISCOVERY COMPLETE! {leaves} leaves, {values} values")
        sys.exit(0)

print("\nMonitor ended")
