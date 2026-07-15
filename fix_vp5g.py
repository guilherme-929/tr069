import urllib.request, json

base = 'http://127.0.0.1:3000/api'

data = json.dumps({'email': 'admin@acs.local', 'password': 'admin123'}).encode()
req = urllib.request.Request(f'{base}/auth/login', data, {'Content-Type': 'application/json'})
r = urllib.request.urlopen(req)
token = json.loads(r.read())['accessToken']

# Get current vWifi5G config
req2 = urllib.request.Request(f'{base}/config?category=virtual', headers={'Authorization': f'Bearer {token}'})
r2 = urllib.request.urlopen(req2)
configs = json.loads(r2.read())

vp5g_id = None
for c in configs:
    if c.get('key') == 'virtualparam.vWifi5G':
        vp5g_id = c['id']
        print(f'Found vWifi5G config id={vp5g_id}')
        current = json.loads(c['value'])
        print(f'Current paths: {current.get("paths", [])}')
        break

if not vp5g_id:
    print('vWifi5G config not found!')
    exit(1)

# Update paths to include SSID.3
new_value = {
    "label": "vWifi5G",
    "paths": [
        "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID",
        "InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.SSID",
        "Device.WiFi.SSID.3.SSID",
        "Device.WiFi.SSID.2.SSID",
        "Device.WiFi.SSID.5.SSID"
    ],
    "transform": "first",
    "description": "5GHz WiFi SSID (TR-098 instance 2/5 or TR-181 instance 2/3/5)"
}

# PATCH the config
patch_data = json.dumps({
    'value': json.dumps(new_value)
}).encode()
req3 = urllib.request.Request(
    f'{base}/config/{vp5g_id}',
    data=patch_data,
    headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {token}'},
    method='PATCH'
)
r3 = urllib.request.urlopen(req3)
print(f'Updated! New paths: {new_value["paths"]}')

# Now verify virtual params for both devices
for serial, did in [('XC220-G3', 'cmri87yx11mtxbl3jz44gs012'), ('XX530v', 'cmrd6v1nl07rlzyfi90vdjy5q')]:
    req4 = urllib.request.Request(f'{base}/devices/{did}/virtual-params', headers={'Authorization': f'Bearer {token}'})
    r4 = urllib.request.urlopen(req4)
    vp = json.loads(r4.read())
    print(f'\n{serial} virtual-params:')
    for k, v in sorted(vp.items()):
        print(f'  {k} = {v}')
