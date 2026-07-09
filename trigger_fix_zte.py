"""Trigger discovery and fix for ZTE F670L WiFi 5GHz"""
import json
import urllib.request
import time

API = "http://179.51.184.205/api"

# Login
data = json.dumps({"email": "admin@acs.local", "password": "admin123"}).encode()
req = urllib.request.Request(f"{API}/auth/login", data, {"Content-Type": "application/json"})
token = json.loads(urllib.request.urlopen(req).read())["accessToken"]
print("Logged in")

# Get ZTE device ID
req = urllib.request.Request(f"{API}/devices", headers={"Authorization": f"Bearer {token}"})
r = urllib.request.urlopen(req)
devices = json.loads(r.read())

zte_id = None
for d in devices.get("data", []):
    if "ZTE" in d["serial"].upper():
        zte_id = d["id"]
        serial = d["serial"]
        break

print(f"ZTE device: {zte_id} ({serial})")

# 1. Trigger full parameter discovery to map WLAN tree
print("\n1. Triggering full parameter discovery...")
try:
    req = urllib.request.Request(
        f"{API}/devices/{zte_id}/discover",
        method="POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        data=b"{}"
    )
    r = urllib.request.urlopen(req, timeout=15)
    result = json.loads(r.read())
    print(f"   Discovery queued: {json.dumps(result, indent=2)[:200]}")
except Exception as e:
    print(f"   Error: {e}")

# 2. Also trigger WiFi read for the specific 5GHz instance
print("\n2. Triggering WiFi read (WLANConfiguration instances 1-8)...")
try:
    req = urllib.request.Request(
        f"{API}/devices/{zte_id}/wifi/read",
        method="POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        data=b"{}"
    )
    r = urllib.request.urlopen(req, timeout=15)
    result = json.loads(r.read())
    print(f"   WiFi read queued: {json.dumps(result, indent=2)[:200]}")
except Exception as e:
    print(f"   Error: {e}")

# 3. Also trigger fetch-all for the WLAN tree specifically
print("\n3. Triggering fetch-all for WLANConfiguration tree...")
try:
    body = json.dumps({"names": ["InternetGatewayDevice.LANDevice.1.WLANConfiguration."]}).encode()
    req = urllib.request.Request(
        f"{API}/devices/{zte_id}/fetch-all",
        method="POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        data=body
    )
    r = urllib.request.urlopen(req, timeout=15)
    result = json.loads(r.read())
    print(f"   Fetch-all queued: {json.dumps(result, indent=2)[:200]}")
except Exception as e:
    print(f"   Error: {e}")

print("\n\n=== NEXT STEPS ===")
print("Wait for the CPE to connect (periodic inform or trigger CR)")
print("Then check discovery status at:")
print(f"  GET {API}/devices/{zte_id}/discover/status")
print("Or check the device detail page in the UI")
