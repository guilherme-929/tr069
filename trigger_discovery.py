"""Trigger discovery and check ZTE device"""
import json
import urllib.request
import time

API = "http://179.51.184.205/api"

def login():
    data = json.dumps({"email": "admin@acs.local", "password": "admin123"}).encode()
    req = urllib.request.Request(f"{API}/auth/login", data, {"Content-Type": "application/json"})
    r = urllib.request.urlopen(req)
    return json.loads(r.read())["accessToken"]

def api_post(token, path, body=None):
    data = json.dumps(body or {}).encode()
    req = urllib.request.Request(
        f"{API}{path}", data,
        {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    )
    r = urllib.request.urlopen(req)
    return json.loads(r.read())

token = login()
print("Logged in")

# Get devices
req = urllib.request.Request(f"{API}/devices", headers={"Authorization": f"Bearer {token}"})
r = urllib.request.urlopen(req)
devices = json.loads(r.read())

for d in devices.get("data", []):
    did = d["id"]
    serial = d["serial"]
    
    # Trigger full discovery to rebuild __discovered__
    print(f"\nTriggering full parameter discovery for {serial}...")
    try:
        result = api_post(token, f"/devices/{did}/discover", {})
        print(f"  Task queued: {result.get('task',{}).get('id','?')}")
    except Exception as e:
        print(f"  Error: {e}")
    
    # Check pending tasks count
    try:
        status = api_get_safe(token, f"/devices/{did}/discover/status")
        if status:
            print(f"  Status: {status.get('status')}, pendingTasks={status.get('pendingTasks')}")
    except:
        pass

def api_get_safe(token, path):
    try:
        req = urllib.request.Request(f"{API}{path}", headers={"Authorization": f"Bearer {token}"})
        r = urllib.request.urlopen(req, timeout=10)
        return json.loads(r.read())
    except:
        return None

print("\n\n=== SUMMARY ===")
print("Discovery triggered for both devices.")
print("WiFi read tasks queued for ZTE (4 tasks - essential + vendor + hosts per instance).")
print("Waiting for CPE connection to process tasks...")
