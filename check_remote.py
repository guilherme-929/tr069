import urllib.request
import json
import ssl

base = 'http://179.51.184.205/api'
ctx = ssl._create_unverified_context()

try:
    data = json.dumps({'email': 'admin@acs.local', 'password': 'admin123'}).encode()
    req = urllib.request.Request(f'{base}/auth/login', data, {'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, context=ctx) as r:
        token = json.loads(r.read())['accessToken']
    print("Token OK")
    
    # Get tasks
    dev_id = 'cmr9n7d390009h85bjbptneoh'
    req_tasks = urllib.request.Request(f'{base}/provisioning/tasks?limit=100', headers={'Authorization': f'Bearer {token}'})
    with urllib.request.urlopen(req_tasks, context=ctx) as r:
        tasks = json.loads(r.read())
    
    print(f"\n--- TASKS ({len(tasks)} total tasks fetched) ---")
    for t in tasks.get('data', []) or tasks:
        # print some info about the task
        if t.get('deviceId') == dev_id or not dev_id:
            print(f"ID: {t['id']}, Type: {t['type']}, Status: {t['status']}, Created: {t.get('createdAt')}")
            print(f"  Payload: {json.dumps(t.get('payload'))[:200]}")
            if t.get('result'):
                print(f"  Result keys count: {len(t.get('result') or {})}")
except Exception as e:
    print("Error:", e)
