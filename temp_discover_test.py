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


def log(*a):
    print(*a, flush=True)


log('Disparando FULL DISCOVER...')
req = urllib.request.Request(f'{base}/devices/{did}/discover', method='POST', headers=h, data=b'{}')
try:
    r = json.loads(urllib.request.urlopen(req).read())
    log('discover resp:', json.dumps(r)[:200])
except Exception as e:
    log('discover err', e)

for s in range(0, 150, 5):
    time.sleep(5)
    d = get_device()
    p = d.get('parameters') or {}
    wifi = [k for k in p if 'WIFI.SSID' in k or 'WIFI.AccessPoint' in k or ('WLANConfiguration' in k and 'SSID' in k)]
    tasks = d.get('tasks') or []
    pend = [t for t in tasks if t['status'] in ('PENDING', 'IN_PROGRESS')]
    log(f'[{s+5}s] wifi-params={len(wifi)} tasks-ativas={len(pend)}')
    if wifi:
        log('SSIDs encontrados:')
        for k in sorted(wifi):
            log('  ', k, '=', p[k])
        break
    if s + 5 >= 150:
        log('timeout sem SSID')
log('fim')
