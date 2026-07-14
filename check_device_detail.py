import urllib.request, json

base = 'http://127.0.0.1:3000/api'

data = json.dumps({'email': 'admin@acs.local', 'password': 'admin123'}).encode()
req = urllib.request.Request(f'{base}/auth/login', data, {'Content-Type': 'application/json'})
r = urllib.request.urlopen(req)
token = json.loads(r.read())['accessToken']

# Check the device detail endpoint response
req2 = urllib.request.Request(f'{base}/devices/cmrd6v1nl07rlzyfi90vdjy5q', headers={'Authorization': f'Bearer {token}'})
r2 = urllib.request.urlopen(req2)
d = json.loads(r2.read())
p = d.get('parameters', {}) or {}

# Check if Device.WiFi SSID keys exist in the response
ssid_keys = [k for k in p.keys() if '.SSID' in k and k.endswith('.SSID')]
print('SSID keys found:', len(ssid_keys))
for k in sorted(ssid_keys):
    print('  ' + k + ' = ' + str(p[k]))

# Check Enable keys
enable_keys = [k for k in p.keys() if '.Enable' in k]
print('\nEnable keys:')
for k in sorted(enable_keys):
    print('  ' + k + ' = ' + str(p[k]) + ' (type: ' + type(p[k]).__name__ + ')')

# Check if frontend would find instances
import re
instances = set()
for k in p.keys():
    m = re.match(r'^Device\.WiFi\.SSID\.(\d+)\.SSID$', k)
    if m:
        instances.add(int(m.group(1)))
print('\nInstances found by frontend regex:', sorted(instances))

# Check per-instance enable values
for i in sorted(instances):
    enable_key_enable = 'Device.WiFi.SSID.' + str(i) + '.Enable'
    val = p.get(enable_key_enable, 'NOT FOUND')
    str_val = str(val) if val is not None else 'NOT FOUND'
    print('  Instance ' + str(i) + ': Enable = ' + str_val + ' -> active=' + str(str_val == '1'))
