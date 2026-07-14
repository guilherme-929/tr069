"""Check TP-Link devices and virtual parameters"""
import urllib.request, json

base = 'http://179.51.184.205/api'

# Login
data = json.dumps({'email': 'admin@acs.local', 'password': 'admin123'}).encode()
req = urllib.request.Request(f'{base}/auth/login', data, {'Content-Type': 'application/json'})
r = urllib.request.urlopen(req)
token = json.loads(r.read())['accessToken']
print('Token OK')

# List all devices
req2 = urllib.request.Request(f'{base}/devices', headers={'Authorization': f'Bearer {token}'})
r2 = urllib.request.urlopen(req2)
devices = json.loads(r2.read())
print(f'\nDevices total: {devices["total"]}')
for d in devices.get('data', []):
    print(f'  [{d["status"]}] {d["serial"]} / {d["modelName"]} / IP: {d["ipAddress"]} / lastContact: {d["lastContact"]}')

# Find TP-Link devices
tplink_devices = [d for d in devices.get('data', []) if 'tp' in d.get('modelName', '').lower() or 'tp' in d.get('manufacturer', '').lower() or 'tp' in d.get('serial', '').lower() or d.get('manufacturer', '').lower() == 'tp-link']
if not tplink_devices:
    tplink_devices = [d for d in devices.get('data', []) if 'xx530' in d.get('modelName', '').lower() or 'xc220' in d.get('modelName', '').lower()]
if not tplink_devices:
    tplink_devices = [d for d in devices.get('data', []) if 'tp' in str(d).lower()]

print(f'\n--- TP-Link devices found: {len(tplink_devices)} ---')

for d in tplink_devices:
    did = d['id']
    print(f'\n========== {d["serial"]} / {d["modelName"]} ==========')
    print(f'  Status: {d["status"]}')
    print(f'  IP: {d["ipAddress"]}')
    
    # Get device details with parameters
    req3 = urllib.request.Request(f'{base}/devices/{did}', headers={'Authorization': f'Bearer {token}'})
    r3 = urllib.request.urlopen(req3)
    detail = json.loads(r3.read())
    
    params = detail.get('parameters', {}) or {}
    
    # Check virtual params
    vp = {k: v for k, v in params.items() if k.startswith('VirtualParameters')}
    print(f'  VirtualParameters: {json.dumps(vp, indent=4) if vp else "NONE"}')
    
    # Check WiFi params (TR-181)
    wifi_params = {k: v for k, v in params.items() if 'Device.WiFi' in k or 'WLANConfiguration' in k}
    print(f'  WiFi params found: {len(wifi_params)}')
    
    # Show SSIDs
    ssids = {k: v for k, v in wifi_params.items() if k.endswith('.SSID')}
    if ssids:
        print(f'\n  SSIDs found:')
        for k, v in sorted(ssids.items()):
            print(f'    {k} = {v}')
    else:
        print(f'\n  NO SSIDs found in parameters')
        print(f'  Showing first 20 WiFi-related keys:')
        wf_keys = sorted(wifi_params.keys())[:30]
        for k in wf_keys:
            print(f'    {k} = {params[k]}')
    
    # Check if device has any WiFi data at all
    has_wifi_params = any('wifi' in k.lower() for k in params.keys())
    print(f'\n  Has ANY wifi-related parameters: {has_wifi_params}')
    
    # Get virtual params endpoint
    try:
        req4 = urllib.request.Request(f'{base}/devices/{did}/virtual-params', headers={'Authorization': f'Bearer {token}'})
        r4 = urllib.request.urlopen(req4)
        vp2 = json.loads(r4.read())
        print(f'\n  /virtual-params endpoint: {json.dumps(vp2, indent=4) if vp2 else "EMPTY"}')
    except urllib.error.HTTPError as e:
        print(f'\n  /virtual-params error: {e.code} - {e.read().decode()[:200]}')
    
    # Show a few more interesting params
    print(f'\n  Manufacturer: {params.get("Device.DeviceInfo.Manufacturer", params.get("InternetGatewayDevice.DeviceInfo.Manufacturer", "N/A"))}')
    print(f'  ProductClass: {params.get("Device.DeviceInfo.ProductClass", params.get("InternetGatewayDevice.DeviceInfo.ProductClass", "N/A"))}')
    print(f'  SoftwareVersion: {params.get("Device.DeviceInfo.SoftwareVersion", params.get("InternetGatewayDevice.DeviceInfo.SoftwareVersion", "N/A"))}')
    print(f'  Total params stored: {len(params)}')

# Also check non-TP-Link devices to see if vWifi-5G works on them
print(f'\n\n--- Checking ZTE devices for comparison ---')
zte_devices = [d for d in devices.get('data', []) if 'zte' in d.get('modelName', '').lower() or 'zte' in d.get('manufacturer', '').lower()]
for d in zte_devices:
    did = d['id']
    req3 = urllib.request.Request(f'{base}/devices/{did}', headers={'Authorization': f'Bearer {token}'})
    r3 = urllib.request.urlopen(req3)
    detail = json.loads(r3.read())
    params = detail.get('parameters', {}) or {}
    vp = {k: v for k, v in params.items() if k.startswith('VirtualParameters')}
    print(f'\n  {d["serial"]} / {d["modelName"]}')
    print(f'  VirtualParameters: {json.dumps(vp, indent=4) if vp else "NONE"}')
    
    ssids2 = {k: v for k, v in params.items() if k.endswith('.SSID') and 'WLANConfiguration' in k}
    if ssids:
        print(f'  SSIDs: {json.dumps(ssids2, indent=4)}')
