"""Verify deployment and trigger WiFi read"""
import json
import urllib.request
import time

API = "http://179.51.184.205/api"

def login():
    data = json.dumps({"email": "admin@acs.local", "password": "admin123"}).encode()
    req = urllib.request.Request(f"{API}/auth/login", data, {"Content-Type": "application/json"})
    r = urllib.request.urlopen(req)
    return json.loads(r.read())["accessToken"]

def api_get(token, path):
    req = urllib.request.Request(f"{API}{path}", headers={"Authorization": f"Bearer {token}"})
    r = urllib.request.urlopen(req)
    return json.loads(r.read())

def api_post(token, path, body=None):
    data = json.dumps(body or {}).encode()
    req = urllib.request.Request(
        f"{API}{path}",
        data,
        {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    )
    r = urllib.request.urlopen(req)
    return json.loads(r.read())

# Login
token = login()
print("Logged in")

# Wait for backend
print("Waiting for backend restart...")
for i in range(15):
    try:
        t = login()
        print(f"Backend ready after {i+1}s")
        token = t
        
        # Check both devices
        devices = api_get(token, "/devices")
        for d in devices.get("data", []):
            did = d["id"]
            serial = d["serial"]
            
            try:
                status = api_get(token, f"/devices/{did}/discover/status")
                print(f"{serial:25s} {d['modelName']:15s} status={status['status']:10s} leaves={status['leaves']:4d} fetched={status['fetched']:4d} progress={status['progress']:3d}% pendingTasks={status['pendingTasks']:2d}")
            except Exception as e:
                print(f"{serial}: discover error - {e}")
        
        # Trigger WiFi read for ZTE
        for d in devices.get("data", []):
            if "ZTE" in d["serial"].upper():
                print(f"\nTriggering WiFi read for {d['serial']}...")
                result = api_post(token, f"/devices/{d['id']}/wifi/read", {})
                tasks = result.get("tasks", [])
                print(f"WiFi read result: tasks={len(tasks)}, instances={result.get('instances',0)}, source={result.get('source','?')}")
                for t in tasks:
                    print(f"  Task: {t['id']} type={t['type']} status={t['status']} names={len(t.get('payload',{}).get('names',[]))}")
                break
        
        print("\nDeploy completed successfully!")
        break
    except Exception as e:
        print(f"  Waiting... ({e})")
        time.sleep(3)
else:
    print("Backend did not start")
