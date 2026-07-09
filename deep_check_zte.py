"""Deep check ZTE device WiFi 5GHz on remote ACS"""
import json
import urllib.request

API = "http://179.51.184.205/api"

# Login
data = json.dumps({"email": "admin@acs.local", "password": "admin123"}).encode()
req = urllib.request.Request(f"{API}/auth/login", data, {"Content-Type": "application/json"})
r = urllib.request.urlopen(req)
token = json.loads(r.read())["accessToken"]
print(f"TOKEN OK: {token[:30]}...")

# Get devices
req = urllib.request.Request(f"{API}/devices", headers={"Authorization": f"Bearer {token}"})
r = urllib.request.urlopen(req)
devices = json.loads(r.read())

zte_id = None
zte_serial = None
for d in devices.get("data", []):
    if "ZTE" in d["serial"].upper():
        zte_id = d["id"]
        zte_serial = d["serial"]
        break

if not zte_id:
    print("ZTE device not found!")
    exit(1)

print(f"\nZTE Device ID: {zte_id}, Serial: {zte_serial}")

# Get full device detail
req = urllib.request.Request(f"{API}/devices/{zte_id}", headers={"Authorization": f"Bearer {token}"})
r = urllib.request.urlopen(req)
dev = json.loads(r.read())

print(f"Model: {dev.get('modelName')}")
print(f"Status: {dev.get('status')}")
print(f"IP: {dev.get('ipAddress')}")
print(f"WAN IP: {dev.get('wanIp')}")
print(f"Firmware: {dev.get('firmwareVersion')}")
print(f"Last Contact: {dev.get('lastContact')}")
print(f"Uptime: {dev.get('uptime')}")

# Show tasks
tasks = dev.get("tasks", [])
print(f"\nTasks ({len(tasks)}):")
for t in tasks:
    print(f"  {t['type']:25s} | {t['status']:15s} | {str(t.get('error',''))[:80]} | {str(t.get('createdAt',''))[:19]}")

# Show ALL WLAN params
p = dev.get("parameters", {}) or {}
if not isinstance(p, dict):
    p = {}
print(f"\n--- ALL WLANConfiguration parameters ({len([k for k in p if 'WLANConfiguration' in k])}) ---")
for k in sorted(p):
    if "WLANConfiguration" in k:
        print(f"  {k} = {p[k]}")

# Discovery analysis
disc = p.get("__discovered__", {}) or {}
leaves = disc.get("_leaves", []) or []
vals = disc.get("_values", {}) or {}
wlan_leaves = [l for l in leaves if "WLANConfiguration" in l]

print(f"\n--- DISCOVERY ANALYSIS ---")
print(f"Total leaves: {len(leaves)}")
print(f"WLAN leaves: {len(wlan_leaves)}")
print(f"Total values fetched: {len(vals)}")

if wlan_leaves:
    print(f"\nDiscovered WLAN leaves ({len(wlan_leaves)}):")
    for l in sorted(wlan_leaves):
        print(f"  {l}")
else:
    print("\nNO WLAN LEAVES IN DISCOVERY!")
    print("This means the discovery GetParameterNames did not cover WLANConfiguration tree.")

# Check what WLAN values exist (from Inform/SetParameterValues cache)
wlan_keys_5 = [k for k in p if "WLANConfiguration.5" in k]
wlan_keys_all = [k for k in p if "WLANConfiguration" in k]

print(f"\n--- 5GHz WiFi data in cache ({len(wlan_keys_5)} params) ---")
for k in sorted(wlan_keys_5):
    print(f"  {k} = {p[k]}")

print(f"\n--- ROOT CAUSE ANALYSIS ---")
print(f"1. 5GHz SSID IS present: {p.get('InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID', 'MISSING')}")
print(f"2. 5GHz Enable: {p.get('InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.Enable', 'MISSING')}")
print(f"3. 5GHz Channel: {p.get('InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.Channel', 'MISSING')}")

missing_5g = []
if not p.get("InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.KeyPassphrase"):
    missing_5g.append("KeyPassphrase")
if not p.get("InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.Status"):
    missing_5g.append("Status")
if not p.get("InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.TotalAssociations"):
    missing_5g.append("TotalAssociations")
if not p.get("InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.X_ZTE-COM_OperatingFrequencyBand"):
    missing_5g.append("OperatingFrequencyBand")

if missing_5g:
    print(f"\n4. MISSING 5GHz params: {', '.join(missing_5g)}")
    print(f"\n5. Discovery leaves for WLANConfiguration.5: {len([l for l in wlan_leaves if 'WLANConfiguration.5' in l])}")

print(f"\n6. Discovery values for WLANConfiguration.5: {len([k for k in vals if 'WLANConfiguration.5' in k])}")

# Also check the second device
for d in devices.get("data", []):
    if d["id"] != zte_id:
        print(f"\n\nOther device: {d['serial']} / {d['modelName']} / {d['status']}")
        dp = d.get("parameters", {}) or {}
        if not isinstance(dp, dict):
            dp = {}
        disc2 = dp.get("__discovered__", {}) or {}
        print(f"  Discovered leaves: {len(disc2.get('_leaves',[]) or [])}")
        print(f"  Discovered values: {len(disc2.get('_values',{}) or {})}")

print("\n\n=== RECOMMENDED ACTIONS ===")
print("1. Trigger full parameter discovery POST /api/devices/{id}/discover")
print("2. OR manually queue GetParameterValues for WLANConfiguration.5.* params")
print("3. OR use the existing /wifi/read endpoint")
