"""Trigger WiFi read on TP-Link devices and check results"""
import urllib.request, json

base = 'http://179.51.184.205/api'

data = json.dumps({'email': 'admin@acs.local', 'password': 'admin123'}).encode()
req = urllib.request.Request(f'{base}/auth/login', data, {'Content-Type': 'application/json'})
r = urllib.request.urlopen(req)
token = json.loads(r.read())['accessToken']
print('Token OK\n')

# Get device IDs
req2 = urllib.request.Request(f'{base}/devices', headers={'Authorization': f'Bearer {token}'})
r2 = urllib.request.urlopen(req2)
devices = json.loads(r2.read())

tplink_ids = {}
for d in devices.get('data', []):
    if 'XX530' in d['modelName'] or 'XC220' in d['modelName']:
        tplink_ids[d['modelName']] = d['id']
        print(f'{d["modelName"]} ({d["serial"]}): id={d["id"]}')

# Trigger WiFi read on XX530v (it has public IP, so connection request should work)
if 'XX530v' in tplink_ids:
    did = tplink_ids['XX530v']
    print(f'\n--- Triggering WiFi read on XX530v ({did}) ---')
    try:
        req3 = urllib.request.Request(
            f'{base}/devices/{did}/wifi/read',
            method='POST',
            headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
            data=b'{}'
        )
        r3 = urllib.request.urlopen(req3)
        result = json.loads(r3.read())
        print(json.dumps(result, indent=2))
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        print(f'WiFi read error: {e.code} - {err[:500]}')

# Also trigger targeted discovery for Device.WiFi. on XC220-G3
if 'XC220-G3' in tplink_ids:
    did = tplink_ids['XC220-G3']
    print(f'\n--- Triggering WiFi read on XC220-G3 ({did}) ---')
    try:
        req4 = urllib.request.Request(
            f'{base}/devices/{did}/wifi/read',
            method='POST',
            headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
            data=b'{}'
        )
        r4 = urllib.request.urlopen(req4)
        result2 = json.loads(r4.read())
        print(json.dumps(result2, indent=2))
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        print(f'WiFi read error: {e.code} - {err[:500]}')

# Wait a bit then check parameters again
print('\n\n--- Waiting 5s and checking if WiFi params appeared ---')
import time
time.sleep(5)

for model, did in tplink_ids.items():
    req5 = urllib.request.Request(f'{base}/devices/{did}', headers={'Authorization': f'Bearer {token}'})
    r5 = urllib.request.urlopen(req5)
    detail = json.loads(r5.read())
    params = detail.get('parameters', {}) or {}
    
    wifi_params = {k: v for k, v in params.items() if 'WiFi' in k or 'WLAN' in k or 'wifi' in k.lower()}
    print(f'\n{model}: {len(wifi_params)} WiFi params')
    for k, v in sorted(wifi_params.items())[:30]:
        if isinstance(v, str) and len(v) > 80:
            v = v[:80] + '...'
        print(f'  {k} = {v}')
