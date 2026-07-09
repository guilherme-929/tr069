#!/usr/bin/env python3
"""Check ZTE device on remote server"""
import json
import urllib.request

API = 'http://179.51.184.205/api'

# Login
data = json.dumps({"email": "admin@acs.local", "password": "admin123"}).encode()
req = urllib.request.Request(f"{API}/auth/login", data, {"Content-Type": "application/json"})
token = json.loads(urllib.request.urlopen(req).read())["accessToken"]
print(f"TOKEN OK: {token[:20]}...")

# List devices
req = urllib.request.Request(f"{API}/devices?limit=50", headers={"Authorization": f"Bearer {token}"})
devices = json.loads(urllib.request.urlopen(req).read())
print(f"\nTotal devices: {devices['total']}")

for dev in devices.get("data", []):
    params = dev.get("parameters", {}) or {}
    if not isinstance(params, dict):
        params = {}
    
    wifi_keys = [k for k in params if "WLAN" in k or "WiFi" in k or "WIFI" in k]
    has_5g = any("WLANConfiguration.5" in k or "WIFI.5" in k or "WiFi.5" in k for k in wifi_keys)
    discovered = params.get("__discovered__", {}) or {}
    leaves = discovered.get("_leaves", []) or []
    vals = discovered.get("_values", {}) or {}
    
    has_wlan5 = any("WLANConfiguration.5" in k for k in wifi_keys)
    has_wifi5_zte = any(k.startswith("InternetGatewayDevice.LANDevice.1.WIFI.SSID.5") for k in wifi_keys)
    
    print(f"  {dev['serial']:25s} | {dev['modelName']:20s} | {dev['status']:10s} | "
          f"WifiKeys:{len(wifi_keys):3d} | DiscLeaves:{len(leaves):4d} | "
          f"DiscVals:{len(vals):4d} | 5G:{'YES' if has_5g else 'NO'} | "
          f"WLAN.5:{'YES' if has_wlan5 else 'NO'} | ZTE.5:{'YES' if has_wifi5_zte else 'NO'}")
    
    # For ZTE device, show detail
    if "ZTE" in dev.get("serial", "").upper() or "ZTE" in dev.get("manufacturer", "").upper():
        print(f"  >>> ZTE DEVICE DETAIL <<<")
        # Show all WLAN params sorted
        for k in sorted(wifi_keys):
            v = params[k]
            print(f"      {k} = {v}")
        
        if leaves:
            wifi_leaves = [l for l in leaves if "WLAN" in l or "WiFi" in l or "WIFI" in l]
            if wifi_leaves:
                print(f"  Discovered WiFi leaves ({len(wifi_leaves)}):")
                for l in sorted(wifi_leaves)[:20]:
                    print(f"      {l}")
            else:
                print(f"  No WiFi leaves in discovery")
        else:
            print(f"  DISCOVERY IS EMPTY - device needs discovery")

print("\nDone.")
