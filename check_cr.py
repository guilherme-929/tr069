"""Check ConnectionRequest config for TP-Link devices"""
import urllib.request, json

base = 'http://179.51.184.205/api'
data = json.dumps({'email': 'admin@acs.local', 'password': 'admin123'}).encode()
req = urllib.request.Request(f'{base}/auth/login', data, {'Content-Type': 'application/json'})
r = urllib.request.urlopen(req)
token = json.loads(r.read())['accessToken']

for serial in ['22521Y0001317', 'V25A024003204']:
    req2 = urllib.request.Request(f'{base}/devices?search={serial}', headers={'Authorization': f'Bearer {token}'})
    r2 = urllib.request.urlopen(req2)
    devices = json.loads(r2.read())
    if not devices.get('data'):
        continue
    d = devices['data'][0]
    did = d['id']
    
    req3 = urllib.request.Request(f'{base}/devices/{did}', headers={'Authorization': f'Bearer {token}'})
    r3 = urllib.request.urlopen(req3)
    detail = json.loads(r3.read())
    params = detail.get('parameters', {}) or {}
    
    print(f'\n=== {d["modelName"]} ({serial}) ===')
    print(f'ConnectionRequestURL: {params.get("Device.ManagementServer.ConnectionRequestURL", "N/A")}')
    print(f'ConnectionRequestUsername: {params.get("Device.ManagementServer.ConnectionRequestUsername", "N/A")}')
    print(f'ConnectionRequestPassword: {params.get("Device.ManagementServer.ConnectionRequestPassword", "N/A")}')
    print(f'ACS URL: {params.get("Device.ManagementServer.URL", "N/A")}')
    
    # Also get device config
    print(f'connectionRequestUrl (override): {detail.get("connectionRequestUrl", "N/A")}')
    print(f'connectionRequestUsername: {detail.get("connectionRequestUsername", "N/A")}')
    print(f'connectionRequestPassword: {detail.get("connectionRequestPassword", "N/A")}')
