"""Check device details and pending tasks"""
import urllib.request, json

base = 'http://179.51.184.205/api'

data = json.dumps({'email': 'admin@acs.local', 'password': 'admin123'}).encode()
req = urllib.request.Request(f'{base}/auth/login', data, {'Content-Type': 'application/json'})
r = urllib.request.urlopen(req)
token = json.loads(r.read())['accessToken']
print('Token OK')

# Get all devices first
req = urllib.request.Request(f'{base}/devices?limit=50', headers={'Authorization': f'Bearer {token}'})
r = urllib.request.urlopen(req)
devices = json.loads(r.read())

print(f'\nTotal devices: {devices.get("total", 0)}')
for d in devices.get('data', []):
    did = d.get('id', '?')
    serial = d.get('serial', '?')
    print(f'\n=== Device: {serial} (ID: {did}) ===')
    print(f'  Status: {d.get("status")}')
    print(f'  Model: {d.get("modelName")}')
    print(f'  IP: {d.get("ipAddress")}')
    print(f'  LastContact: {d.get("lastContact")}')
    print(f'  ProvisionStatus: {d.get("provisionStatus")}')
    
    # Check for pending tasks
    tasks = d.get('tasks', [])
    if tasks and len(tasks) > 0:
        print(f'  Tasks ({len(tasks)}):')
        for t in tasks[:10]:
            print(f'    - Type: {t.get("type")} | Status: {t.get("status")} | Created: {t.get("createdAt")}')
            pending_info = t.get('pendingInfo') or t.get('pending_info') or t.get('error') or ''
            if pending_info:
                print(f'      Info: {pending_info}')
            payload = t.get('payload', {})
            if payload:
                print(f'      Payload: {json.dumps(payload)[:200]}')
    else:
        print(f'  Tasks: none')
    
    # Check parameter discovery status
    discover_status = d.get('discoverStatus') or d.get('discovery_status')
    if discover_status:
        print(f'  Discovery: {discover_status}')
    
    print()

# Also check directly for pending tasks
print('\n=== Checking for PENDING tasks directly ===')
try:
    req = urllib.request.Request(f'{base}/tasks?status=PENDING&limit=10', headers={'Authorization': f'Bearer {token}'})
    r = urllib.request.urlopen(req)
    tasks_data = json.loads(r.read())
    print(f'Pending tasks: {tasks_data}')
except Exception as e:
    print(f'No tasks endpoint or error: {e}')

# Check logs for recent errors
print('\n=== Recent errors from logs ===')
try:
    req = urllib.request.Request(f'{base}/logs?limit=10', headers={'Authorization': f'Bearer {token}'})
    r = urllib.request.urlopen(req)
    logs = json.loads(r.read())
    for l in logs.get('data', [])[:10]:
        action = l.get('action', '')
        detail = l.get('detail', '')
        if 'FAIL' in action or 'ERROR' in action or 'error' in detail.lower() or 'fault' in detail.lower():
            print(f'  {l.get("createdAt")} | {action} | {detail[:200]}')
except Exception as e:
    print(f'Error: {e}')
