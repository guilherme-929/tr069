"""Check discovery status for both devices"""
import json
import urllib.request

API = "http://179.51.184.205/api"

data = json.dumps({"email": "admin@acs.local", "password": "admin123"}).encode()
req = urllib.request.Request(f"{API}/auth/login", data, {"Content-Type": "application/json"})
token = json.loads(urllib.request.urlopen(req).read())["accessToken"]

req = urllib.request.Request(f"{API}/devices", headers={"Authorization": f"Bearer {token}"})
devices = json.loads(urllib.request.urlopen(req).read())

for d in devices.get("data", []):
    did = d["id"]
    serial = d["serial"]
    model = d.get("modelName", "?")
    
    try:
        req = urllib.request.Request(f"{API}/devices/{did}/discover/status", headers={"Authorization": f"Bearer {token}"})
        r = urllib.request.urlopen(req, timeout=10)
        status = json.loads(r.read())
        wifi_params = status.get("wifiParams", {}) or {}
        print(f"{serial:25s} {model:15s} status={status['status']:10s} leaves={status['leaves']:4d} fetched={status['fetched']:4d} progress={status['progress']:3d}% wifiParams={len(wifi_params)}")
    except Exception as e:
        print(f"{serial}: error - {e}")
    
    if "XX530v" in model or "22521" in serial:
        print(f"\n--- XX530v full detail ---")
        req = urllib.request.Request(f"{API}/devices/{did}", headers={"Authorization": f"Bearer {token}"})
        r = urllib.request.urlopen(req, timeout=10)
        dev = json.loads(r.read())
        p = dev.get("parameters", {}) or {}
        if not isinstance(p, dict):
            p = {}
        print(f"Total params: {len(p)}")
        disc = p.get("__discovered__", {}) or {}
        leaves = disc.get("_leaves", []) or []
        print(f"Discovered leaves: {len(leaves)}")
        if leaves:
            print("Sample leaves (first 15):")
            for l in sorted(leaves)[:15]:
                print(f"  {l}")
        else:
            print("No discovered leaves")

print("\n\n=== SUMMARY ===")
print("ZTE F670L: Has 24 WLAN params cached. 5GHz exists (SSID=Amanda_5Ghz, Ch=157, a/n/ac)")
print("  BUT discovery has 0 WLAN leaves - the WLAN tree was never explored")
print("  Missing: KeyPassphrase, Status, TotalAssociations, OperatingFrequencyBand for 5GHz")
print("  WiFi read was queued - should fetch params on next CPE connection")
print()
print("XX530v: Has 225 discovered leaves but 0 values fetched")
print("  Discovery completed but GetParameterValues never succeeded")
