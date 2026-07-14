"""Check TP-Link devices after fix"""
import urllib.request, json

base = 'http://179.51.184.205/api'

data = json.dumps({'email': 'admin@acs.local', 'password': 'admin123'}).encode()
req = urllib.request.Request(f'{base}/auth/login', data, {'Content-Type': 'application/json'})
r = urllib.request.urlopen(req)
token = json.loads(r.read())['accessToken']

for serial in ['22521Y0001317', 'V25A024003204']:
    req = urllib.request.Request(f'{base}/devices?search={serial}', headers={'Authorization': f'Bearer {token}'})
    r = urllib.request.urlopen(req)
    devices = json.loads(r.read())
    if not devices.get('data'):
        continue
    d = devices['data'][0]
    did = d['id']
    
    req2 = urllib.request.Request(f'{base}/devices/{did}', headers={'Authorization': f'Bearer {token}'})
    r2 = urllib.request.urlopen(req2)
    detail = json.loads(r2.read())
    params = detail.get('parameters', {}) or {}
    
    print(f'\n========== {d["modelName"]} ({serial}) ==========')
    print(f'Total params: {len(params)}')
    
    # Check for WiFi params
    wifi_vals = {k: v for k, v in params.items() if ('Device.WiFi.SSID' in k or 'WLANConfiguration' in k) and not k.startswith('__')}
    
    if wifi_vals:
        print(f'WiFi params found ({len(wifi_vals)}):')
        for k, v in sorted(wifi_vals.items()):
            if isinstance(v, str) and len(v) > 80:
                v = v[:80] + '...'
            print(f'  {k} = {v}')
    else:
        print(f'No WiFi params stored yet.')
    
    # Check virtual params
    vp = {k: v for k, v in params.items() if k.startswith('VirtualParameters')}
    if vp:
        print(f'\nVirtualParameters:')
        for k, v in sorted(vp.items()):
            print(f'  {k} = {v}')
    else:
        print(f'\nNo VirtualParameters')
    
    # Also check via /virtual-params endpoint
    try:
        req3 = urllib.request.Request(f'{base}/devices/{did}/virtual-params', headers={'Authorization': f'Bearer {token}'})
        r3 = urllib.request.urlopen(req3)
        vp2 = json.loads(r3.read())
        print(f'\n/virtual-params: {json.dumps(vp2, indent=2)[:200]}')
    except urllib.error.HTTPError as e:
        pass
