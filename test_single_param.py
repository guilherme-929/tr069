"""Test reading single param from XX530v"""
import urllib.request, json

base = 'http://179.51.184.205/api'

data = json.dumps({'email': 'admin@acs.local', 'password': 'admin123'}).encode()
req = urllib.request.Request(f'{base}/auth/login', data, {'Content-Type': 'application/json'})
r = urllib.request.urlopen(req)
token = json.loads(r.read())['accessToken']

did = 'cmrd6v1nl07rlzyfi90vdjy5q'  # XX530v

# Try fetching a single simple param first
for test_param in [
    'Device.DeviceInfo.Manufacturer',
    'Device.DeviceInfo.ProductClass',
    'Device.DeviceInfo.SoftwareVersion',
    'Device.WiFi.SSID.1.SSID',
    'Device.WiFi.SSIDNumberOfEntries',
]:
    try:
        req2 = urllib.request.Request(
            f'{base}/devices/{did}/parameters',
            method='POST',
            headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
            data=json.dumps({'names': [test_param]}).encode()
        )
        r2 = urllib.request.urlopen(req2)
        result = json.loads(r2.read())
        print(f'{test_param}:')
        print(f'  {json.dumps(result, indent=2)[:200]}')
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        print(f'{test_param}: ERROR {e.code} - {err[:200]}')
