"""Check ZTE device state after restart"""
import json
import urllib.request

API = "http://179.51.184.205/api"

data = json.dumps({"email": "admin@acs.local", "password": "admin123"}).encode()
req = urllib.request.Request(f"{API}/auth/login", data, {"Content-Type": "application/json"})
r = urllib.request.urlopen(req)
token = json.loads(r.read())["accessToken"]

req = urllib.request.Request(f"{API}/devices", headers={"Authorization": f"Bearer {token}"})
r = urllib.request.urlopen(req)
devices = json.loads(r.read())

for d in devices.get("data", []):
    did = d["id"]
    serial = d["serial"]
    
    req = urllib.request.Request(f"{API}/devices/{did}", headers={"Authorization": f"Bearer {token}"})
    r = urllib.request.urlopen(req)
    dev = json.loads(r.read())
    
    p = dev.get("parameters", {}) or {}
    if not isinstance(p, dict):
        p = {}
    
    disc = p.get("__discovered__", {}) or {}
    leaves = disc.get("_leaves", []) or []
    vals = disc.get("_values", {}) or {}
    
    # Check if WLAN params are still in cache
    wlan_keys = [k for k in p if "WLANConfiguration" in k]
    print(f"\n{serial} ({d['modelName']})")
    print(f"  Total params in cache: {len(p)}")
    print(f"  WLAN params in cache: {len(wlan_keys)}")
    print(f"  Discovered leaves: {len(leaves)}")
    print(f"  Discovered values: {len(vals)}")
    
    if wlan_keys:
        print(f"  Sample WLAN 5GHz:")
        for k in sorted(p):
            if "WLANConfiguration.5" in k:
                print(f"    {k} = {p[k]}")
