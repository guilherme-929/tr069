"""Deep check: tasks, sessions, discovery status"""
import urllib.request, json, ssl

base = 'http://179.51.184.205/api'

# Login
data = json.dumps({'email': 'admin@acs.local', 'password': 'admin123'}).encode()
req = urllib.request.Request(f'{base}/auth/login', data, {'Content-Type': 'application/json'})
r = urllib.request.urlopen(req)
token = json.loads(r.read())['accessToken']

# Device IDs
devices_data = {
    'cmrc2kdn6000liuphgwpkscrj': ('ZTE0QJNQ1407460', 'F670L'),
    'cmrd6v1nl07rlzyfi90vdjy5q': ('22521Y0001317', 'XX530v'),
    'cmri87yx11mtxbl3jz44gs012': ('V25A024003204', 'XC220-G3'),
}

# 1. Check tasks for each device
print('=== CHECKING TASKS PER DEVICE ===')
for did, (serial, model) in devices_data.items():
    try:
        req = urllib.request.Request(f'{base}/devices/{did}', headers={'Authorization': f'Bearer {token}'})
        r = urllib.request.urlopen(req)
        d = json.loads(r.read())
        
        tasks = d.get('tasks', [])
        print(f'\n{serial} ({model}):')
        if tasks:
            for t in tasks:
                print(f'  Task: {t.get("type")} | Status: {t.get("status")} | Attempts: {t.get("attempts")}/{t.get("maxAttempts")}')
                if t.get('error'):
                    print(f'  Error: {t["error"]}')
        else:
            print(f'  No tasks')
        
        # Check discover status
        try:
            req2 = urllib.request.Request(f'{base}/devices/{did}/discover/status', headers={'Authorization': f'Bearer {token}'})
            r2 = urllib.request.urlopen(req2)
            status = json.loads(r2.read())
            print(f'  Discovery status: {json.dumps(status, indent=4)}')
        except Exception as e:
            print(f'  Discovery: {e}')
            
    except Exception as e:
        print(f'  {serial}: Error {e}')

# 2. Check pending tasks in database directly
print('\n=== CHECKING PENDING TASKS DIRECTLY ===')
# Try queue/stats endpoint
try:
    req = urllib.request.Request(f'{base}/queue/stats', headers={'Authorization': f'Bearer {token}'})
    r = urllib.request.urlopen(req)
    print(f'Queue stats: {json.loads(r.read())}')
except Exception as e:
    print(f'Queue stats: {e}')

# Try tasks through different endpoint patterns
for ep in ['/tasks', '/tasks?status=PENDING', '/devices/tasks/pending']:
    try:
        req = urllib.request.Request(f'{base}{ep}', headers={'Authorization': f'Bearer {token}'})
        r = urllib.request.urlopen(req)
        data = json.loads(r.read())
        print(f'{ep}: {json.dumps(data, indent=2)[:500]}')
    except Exception as e:
        print(f'{ep}: {e}')

# 3. Check sessions (last 10 per device)
print('\n=== RECENT SESSIONS ===')
for did, (serial, model) in devices_data.items():
    try:
        req = urllib.request.Request(f'{base}/devices/{did}', headers={'Authorization': f'Bearer {token}'})
        r = urllib.request.urlopen(req)
        d = json.loads(r.read())
        sessions = d.get('sessions', [])
        print(f'\n{serial} ({model}) - {len(sessions) if sessions else 0} sessions:')
        if sessions:
            for s in sessions[-5:]:
                print(f'  Session: {s.get("event")} | {s.get("status")} | {s.get("createdAt")}')
    except Exception as e:
        print(f'  {serial}: {e}')

# 4. Check parameters count per device
print('\n=== PARAMETERS ===')
for did, (serial, model) in devices_data.items():
    try:
        req = urllib.request.Request(f'{base}/devices/{did}', headers={'Authorization': f'Bearer {token}'})
        r = urllib.request.urlopen(req)
        d = json.loads(r.read())
        params = d.get('parameters', {})
        leaves = params.get('__discovered__', {}).get('_leaves', {}) if isinstance(params, dict) else {}
        print(f'{serial} ({model}): {len(leaves)} discovered leaves')
    except Exception as e:
        print(f'  {serial}: {e}')
