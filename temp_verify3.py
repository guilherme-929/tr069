import urllib.request, json, time

base = 'http://179.51.184.205/api'
data = json.dumps({'email': 'admin@acs.local', 'password': 'admin123'}).encode()
req = urllib.request.Request(f'{base}/auth/login', data, {'Content-Type': 'application/json'})
token = json.loads(urllib.request.urlopen(req).read())['accessToken']
h = {'Authorization': f'Bearer {token}'}
did = 'cmrar2d79001bx1yn0okl5evq'


def get_device():
    req = urllib.request.Request(f'{base}/devices/{did}', headers=h)
    return json.loads(urllib.request.urlopen(req).read())


print('Disparando wifi/read...')
req = urllib.request.Request(f'{base}/devices/{did}/wifi/read', method='POST',
                             headers={**h, 'Content-Type': 'application/json'}, data=b'{}')
try:
    r = json.loads(urllib.request.urlopen(req).read())
    print('resp:', json.dumps(r)[:200])
except Exception as e:
    print('err', e)

for s in range(0, 120, 5):
    time.sleep(5)
    try:
        d = get_device()
    except Exception as e:
        print(f'[{s+5}s] erro: {e}')
        continue
    p = d.get('parameters') or {}
    wifi = [k for k in p if 'WIFI.SSID' in k or ('WLANConfiguration' in k and 'SSID' in k) or 'WIFI.AccessPoint' in k]
    if wifi:
        print('SSIDs encontrados:')
        for k in sorted(wifi):
            print('  ', k, '=', p[k])
        break
    ts = d.get('tasks') or []
    pend = [t for t in ts if t['status'] in ('PENDING', 'IN_PROGRESS')]
    if pend:
        for t in pend:
            pl = t.get('payload') or {}
            names = pl.get('names') or []
            path = (names[0] if names else pl.get('parameterPath', '-'))
            print(f'[{s+5}s] {t["type"]} status={t["status"]} first={path}')
    else:
        print(f'[{s+5}s] sem tasks pendentes')
print('fim')