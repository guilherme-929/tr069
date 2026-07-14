"""Check TP-Link discovered leaves for WiFi-related paths"""
import urllib.request, json

base = 'http://179.51.184.205/api'

data = json.dumps({'email': 'admin@acs.local', 'password': 'admin123'}).encode()
req = urllib.request.Request(f'{base}/auth/login', data, {'Content-Type': 'application/json'})
r = urllib.request.urlopen(req)
token = json.loads(r.read())['accessToken']

# Get XX530v details
req2 = urllib.request.Request(f'{base}/devices?search=22521Y0001317', headers={'Authorization': f'Bearer {token}'})
r2 = urllib.request.urlopen(req2)
devices = json.loads(r2.read())
d = devices['data'][0]
did = d['id']

req3 = urllib.request.Request(f'{base}/devices/{did}', headers={'Authorization': f'Bearer {token}'})
r3 = urllib.request.urlopen(req3)
detail = json.loads(r3.read())
params = detail.get('parameters', {}) or {}
discovered = params.get('__discovered__', {})
leaves = discovered.get('_leaves', [])

# Find all WiFi-related leaves
wifi_leaves = [l for l in leaves if 'WiFi' in l or 'WLAN' in l or 'wifi' in l]
print(f'XX530v: {len(wifi_leaves)} WiFi/WLAN-related leaves out of {len(leaves)} total')
for l in sorted(wifi_leaves)[:50]:
    print(f'  {l}')

# Also check Device.WiFi.* leaves
tr181_wifi = [l for l in leaves if l.startswith('Device.WiFi.')]
print(f'\nDevice.WiFi.* leaves: {len(tr181_wifi)}')
for l in sorted(tr181_wifi)[:30]:
    print(f'  {l}')

# Check SSID leaves
ssid_leaves = [l for l in leaves if l.endswith('.SSID')]
print(f'\nSSID leaves: {len(ssid_leaves)}')
for l in sorted(ssid_leaves)[:30]:
    print(f'  {l}')

# Now check XC220-G3  
req4 = urllib.request.Request(f'{base}/devices?search=V25A024003204', headers={'Authorization': f'Bearer {token}'})
r4 = urllib.request.urlopen(req4)
devices2 = json.loads(r4.read())
d2 = devices2['data'][0]
did2 = d2['id']

req5 = urllib.request.Request(f'{base}/devices/{did2}', headers={'Authorization': f'Bearer {token}'})
r5 = urllib.request.urlopen(req5)
detail2 = json.loads(r5.read())
params2 = detail2.get('parameters', {}) or {}
discovered2 = params2.get('__discovered__', {})
leaves2 = discovered2.get('_leaves', [])

wifi2 = [l for l in leaves2 if 'WiFi' in l or 'WLAN' in l or 'wifi' in l]
print(f'\n\nXC220-G3: {len(wifi2)} WiFi/WLAN-related leaves out of {len(leaves2)} total')
for l in sorted(wifi2)[:50]:
    print(f'  {l}')

tr181_wifi2 = [l for l in leaves2 if l.startswith('Device.WiFi.')]
print(f'\nDevice.WiFi.* leaves (XC220-G3): {len(tr181_wifi2)}')
for l in sorted(tr181_wifi2)[:30]:
    print(f'  {l}')
