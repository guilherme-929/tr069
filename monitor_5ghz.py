"""Monitor ZTE for 5GHz parameter updates"""
import json
import urllib.request
import time

API = "http://179.51.184.205/api"

data = json.dumps({"email": "admin@acs.local", "password": "admin123"}).encode()
req = urllib.request.Request(f"{API}/auth/login", data, {"Content-Type": "application/json"})
r = urllib.request.urlopen(req)
token = json.loads(r.read())["accessToken"]

# Get devices
req = urllib.request.Request(f"{API}/devices", headers={"Authorization": f"Bearer {token}"})
r = urllib.request.urlopen(req)
devices = json.loads(r.read())

zte_id = None
for d in devices.get("data", []):
    did = d["id"]
    serial = d["serial"]
    req = urllib.request.Request(f"{API}/devices/{did}/discover/status", headers={"Authorization": f"Bearer {token}"})
    r = urllib.request.urlopen(req)
    status = json.loads(r.read())
    print(f"{serial}: pendingTasks={status['pendingTasks']}, leaves={status['leaves']}, fetched={status['fetched']}")
    if "ZTE" in serial.upper():
        zte_id = did

if not zte_id:
    print("No ZTE device found")
    exit(1)

print("\nMonitoring ZTE 5GHz params (checking every 10s)...")
for attempt in range(12):
    req = urllib.request.Request(f"{API}/devices/{zte_id}", headers={"Authorization": f"Bearer {token}"})
    r = urllib.request.urlopen(req)
    dev = json.loads(r.read())
    p = dev.get("parameters", {}) or {}
    if not isinstance(p, dict):
        p = {}
    
    kp5 = p.get("InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.KeyPassphrase", None)
    freq5 = p.get("InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.X_ZTE-COM_OperatingFrequencyBand", None)
    status5 = p.get("InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.Status", None)
    assoc5 = p.get("InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.TotalAssociations", None)
    
    print(f"[{attempt+1}] KeyPassphrase={kp5 or 'MISSING'} FreqBand={freq5 or 'MISSING'} Status={status5 or 'MISSING'} Assoc={assoc5 or 'MISSING'}")
    
    if kp5 and status5:
        print("\n*** 5GHz WiFi PARAMETERS UPDATED SUCCESSFULLY! ***")
        print(f"SSID: {p.get('InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID', '?')}")
        print(f"KeyPassphrase: {kp5}")
        print(f"Status: {status5}")
        print(f"Channel: {p.get('InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.Channel', '?')}")
        print(f"OperatingFrequencyBand: {freq5 or 'MISSING'}")
        print(f"TotalAssociations: {assoc5 or 'MISSING'}")
        
        # Also show status of all tasks now
        req = urllib.request.Request(f"{API}/devices/{zte_id}/discover/status", headers={"Authorization": f"Bearer {token}"})
        r = urllib.request.urlopen(req)
        status = json.loads(r.read())
        print(f"\nDiscovery: pendingTasks={status['pendingTasks']}, leaves={status['leaves']}, fetched={status['fetched']}")
        break
    
    time.sleep(10)
else:
    print("\nCPE did not connect within monitoring period.")
    print("Tasks are queued and will be processed on next CPE connection.")
