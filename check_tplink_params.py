"""Check TP-Link device parameters in detail"""
import urllib.request, json

base = 'http://179.51.184.205/api'

# Login
data = json.dumps({'email': 'admin@acs.local', 'password': 'admin123'}).encode()
req = urllib.request.Request(f'{base}/auth/login', data, {'Content-Type': 'application/json'})
r = urllib.request.urlopen(req)
token = json.loads(r.read())['accessToken']
print('Token OK')

# Get TP-Link devices
for serial in ['22521Y0001317', 'V25A024003204']:
    req = urllib.request.Request(f'{base}/devices?search={serial}', headers={'Authorization': f'Bearer {token}'})
    r = urllib.request.urlopen(req)
    devices = json.loads(r.read())
    if not devices.get('data'):
        print(f'\n{serial}: not found via search')
        continue
    d = devices['data'][0]
    did = d['id']
    
    req2 = urllib.request.Request(f'{base}/devices/{did}', headers={'Authorization': f'Bearer {token}'})
    r2 = urllib.request.urlopen(req2)
    detail = json.loads(r2.read())
    
    params = detail.get('parameters', {}) or {}
    discovered = params.get('__discovered__', {})
    
    print(f'\n========== {serial} / {d["modelName"]} ==========')
    print(f'Total params: {len(params)}')
    print(f'Discovered leaves: {len(discovered.get("_leaves", []))}')
    print(f'Discovered objects: {len(discovered.get("_objects", []))}')
    
    # Print ALL param keys
    print(f'\nAll parameter keys:')
    for k in sorted(params.keys()):
        if k == '__discovered__':
            continue
        v = params[k]
        if isinstance(v, str) and len(v) > 80:
            v = v[:80] + '...'
        print(f'  {k} = {v}')
    
    # Print discovered leaves
    leaves = discovered.get('_leaves', [])
    print(f'\nDiscovered leaves (first 50):')
    for l in sorted(leaves)[:50]:
        print(f'  {l}')
    
    # Check if there are any pending tasks
    try:
        req3 = urllib.request.Request(f'{base}/devices/{did}/tasks', headers={'Authorization': f'Bearer {token}'})
        r3 = urllib.request.urlopen(req3)
        tasks = json.loads(r3.read())
        print(f'\nPending tasks:')
        for t in tasks if isinstance(tasks, list) else tasks.get('data', []):
            print(f'  [{t.get("status")}] {t.get("type")} - payload: {json.dumps(t.get("payload", {}))[:100]}')
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        print(f'\nTasks error: {e.code} - {err[:200]}')
