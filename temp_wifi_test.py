import urllib.request, json, time, sys

def log(*a):
    print(*a, flush=True)

base = 'http://179.51.184.205/api'
data = json.dumps({'email': 'admin@acs.local', 'password': 'admin123'}).encode()
req = urllib.request.Request(f'{base}/auth/login', data, {'Content-Type': 'application/json'})
token = json.loads(urllib.request.urlopen(req).read())['accessToken']
h = {'Authorization': f'Bearer {token}'}
did = 'cmrar2d79001bx1yn0okl5evq'


def get_device():
    req = urllib.request.Request(f'{base}/devices/{did}', headers=h)
    return json.loads(urllib.request.urlopen(req).read())


def tasks():
    return get_device().get('tasks') or []


before = [t['id'] for t in tasks()]
print('Tarefas antes:', len(before))

req = urllib.request.Request(f'{base}/devices/{did}/wifi/read', method='POST',
                             headers={**h, 'Content-Type': 'application/json'}, data=b'{}')
try:
    r = json.loads(urllib.request.urlopen(req).read())
    print('Resposta wifi/read:', json.dumps(r)[:400])
except Exception as e:
    print('wifi/read err', e)

for s in range(0, 120, 5):
    time.sleep(5)
    ts = tasks()
    novas = [t for t in ts if t['id'] not in before]
    for t in novas:
        pl = t.get('payload') or {}
        path = pl.get('parameterPath') or (pl.get('names') or ['-'])[0]
        print(f'[{s+5}s] NOVA TASK {t["type"]} status={t["status"]} path={path} err={t.get("error")}')
    d = get_device()
    p = d.get('parameters') or {}
    wifi = [k for k in p if 'WIFI.SSID' in k or ('WLANConfiguration' in k and 'SSID' in k)]
    if wifi:
        print('SSIDs apareceram:', wifi)
        break
print('fim monitor')
