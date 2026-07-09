---
name: genieacs
description: >
  Skill for GenieACS TR-069 management. Use when the user asks about TR-069,
  ACS, CPE management, CWMP, TR-098/TR-181 data models, WiFi provisioning,
  GenieACS presets/provisions/virtual parameters, parameter discovery, firmware
  management, CPE connection issues, or ZTE/Huawei/Intelbras router management.
  Also use when the user needs help with GenieACS NBI API, data model exploration,
  or troubleshooting CPE parameter visibility (e.g. WiFi 5GHz not showing up).
---

# GenieACS TR-069 Skill

A comprehensive skill for working with GenieACS-based TR-069 Auto Configuration
Servers (ACS). Covers CPE management, parameter discovery, WiFi provisioning,
virtual parameters, presets, provisions, and troubleshooting.

## Context

This project uses a **custom TR-069 ACS** built with NestJS (TypeScript) that
mimics GenieACS behavior:
- **ACS CWMP endpoint**: POST `/cwmp` on port `7547`
- **REST API**: `/api` endpoints (auth, devices, models, firmware, provisioning)
- **Database**: PostgreSQL (via Prisma ORM) — NOT MongoDB (GenieACS default)
- **Queue**: Redis + BullMQ
- **Virtual Parameters**: Computed from definitions in `config` table
- **Presets/Provisions**: Stored in database, evaluated on Inform events

Legacy GenieACS (port 7557 NBI) may also be accessible on the same server.

## TR-069 Data Models

### TR-098 (InternetGatewayDevice) — Most common for ZTE routers

| Path | Description |
|------|-------------|
| `InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.SSID` | WiFi SSID for instance i |
| `InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.KeyPassphrase` | WiFi password |
| `InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.Enable` | Enable/disable WiFi |
| `InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.Channel` | Channel number |
| `InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.Status` | Interface status |
| `InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.Standard` | 802.11 standard (g/n/ac) |
| `InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.X_ZTE-COM_OperatingFrequencyBand` | 2.4GHz or 5GHz |
| `InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.AssociatedDevice.{n}.AssociatedDeviceMACAddress` | Connected client MAC |
| `InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.AssociatedDevice.{n}.AssociatedDeviceIPAddress` | Connected client IP |

### TR-181 (Device) — Newer devices

| Path | Description |
|------|-------------|
| `Device.WiFi.SSID.{i}.SSID` | WiFi SSID |
| `Device.WiFi.SSID.{i}.Enable` | Enable/disable |
| `Device.WiFi.AccessPoint.{i}.Security.KeyPassphrase` | WiFi password |
| `Device.WiFi.Radio.{i}.Channel` | Radio channel |
| `Device.WiFi.Radio.{i}.OperatingFrequencyBand` | Frequency band |

### ZTE-specific extensions

ZTE CPEs expose many vendor-specific parameters via `X_ZTE-COM_*` extensions:

- `X_ZTE-COM_OperatingFrequencyBand` — Indicates 2.4GHz vs 5GHz
- `X_ZTE-COM_WLAN_SupportedFrequencyBands` — Supported bands
- `X_ZTE-COM_SignalStrength` — Client signal strength
- `X_ZTE-COM_WLAN_SNR` — Signal-to-noise ratio
- `X_ZTE-COM_WLAN_Radio` — Which radio client is connected to
- `X_ZTE-COM_AssociatedDeviceName` — Client hostname
- `X_ZTE-COM_TXRate` / `X_ZTE-COM_RXRate` — Transmit/receive rates

Some ZTE models use `InternetGatewayDevice.LANDevice.1.WIFI.*` (ZTE variant)
instead of `WLANConfiguration.*`. Check which namespace the CPE exposes.

### WiFi Instance Mapping

Common convention (varies by vendor):
- **Instance 1**: 2.4GHz (primary)
- **Instance 5**: 5GHz (on ZTE and many others)
- **Instance 2-4**: Guest networks / additional SSIDs
- **Instance 6-8**: Additional 5GHz or IoT bands

**IMPORTANT**: The CPE's Inform message typically only sends basic device info
parameters. WiFi parameters are usually NOT included in the Inform. They must
be **explicitly fetched** via:
1. `GetParameterNames` — Discover available parameters
2. `GetParameterValues` — Fetch actual values

## Common Issues & Fixes

### WiFi 5GHz not appearing

This is the most common issue with ZTE routers. Causes and solutions:

1. **Parameters not yet discovered**
   - The CPE's Inform only includes `Device.Info.*` and `ManagementServer.*` params
   - WiFi params require explicit discovery via `GetParameterNames`
   - Run a full parameter discovery (POST `/api/devices/{id}/discover` on the
     custom ACS, or POST `/devices/{id}/tasks` on GenieACS NBI with
     `{"name": "refreshObject", "objectName": ""}`)

2. **Wrong data model namespace**
   - ZTE F670L uses `InternetGatewayDevice.LANDevice.1.WLANConfiguration.*`
   - Some ZTE models use `InternetGatewayDevice.LANDevice.1.WIFI.*`
   - Check which namespace the device actually exposes via discovery
   - Never mix namespaces in a single GetParameterValues request — the CPE
     will reject the entire request with SOAP Fault 9005

3. **CPE behind CGNAT**
   - If the CPE is behind Carrier-Grade NAT (CGNAT), the ACS cannot initiate
     Connection Requests to the CPE
   - The CPE must initiate the session (periodic Inform)
   - Reduce PeriodicInformInterval to get faster updates (e.g. 60 seconds)
   - Connection Request URL typically contains a CGNAT IP (100.64.x.x)

4. **Data model instance mismatch**
   - 5GHz is NOT always at instance 5
   - Run discovery to confirm the actual instance numbers
   - The CPE may have WLANConfiguration.1 (2.4GHz) and WLANConfiguration.5 (5GHz)
     but if the 5GHz radio is disabled, instance 5 may not appear at all

5. **CPE firmware limitation**
   - Some CPE firmware versions don't expose all WiFi data model paths
   - Check firmware version and compare with known-working versions
   - For ZTE F670L, firmware V9.0.11P1N52 should expose 5GHz at instance 5

### CPE not connecting / appearing offline

1. Check ACS URL in CPE management server config
2. Verify CPE credentials (username/password configured in ACS)
3. Check if CPE is behind CGNAT (needs to initiate connection)
4. Ensure CPE firmware is TR-069 compatible
5. Check ACS logs for connection attempts
6. Verify firewall allows port 7547 from CPE IPs

### Parameter discovery flow

1. CPE sends Inform (basic params only: serial, model, version, etc.)
2. ACS queues `GetParameterNames` task for root path `""`
3. CPE connects and ACS sends `GetParameterNames` request
4. CPE responds with available parameters (objects + leaves)
5. ACS queues `GetParameterNames` for each discovered object
6. Repeat until all objects explored
7. ACS queues `GetParameterValues` for discovered leaf params
8. CPE connects and ACS sends `GetParameterValues`
9. ACS stores values in device parameters

## API Reference

### Custom ACS (port 3000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login (email/password) |
| GET | `/api/devices` | List devices |
| GET | `/api/devices/{id}` | Device details |
| POST | `/api/devices/{id}/parameters` | Get parameter values from CPE |
| POST | `/api/devices/{id}/discover` | Start full parameter discovery |
| GET | `/api/devices/{id}/discover/status` | Discovery progress |
| POST | `/api/devices/{id}/reboot` | Reboot device |
| GET | `/api/devices/{id}/virtual-params` | Get computed virtual params |
| POST | `/api/provisioning/device/{id}` | Provision device |

### GenieACS Native NBI (port 7557)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/devices/?query={query}` | Search devices (MongoDB query) |
| POST | `/devices/{id}/tasks?connection_request` | Enqueue task + trigger CR |
| PUT | `/presets/{name}` | Create/update preset |
| GET | `/provisions/` | List provisions |
| PUT | `/provisions/{name}` | Create/update provision script |

### Common Tasks

**Refresh all parameters:**
```json
{"name": "refreshObject", "objectName": ""}
```

**Read WiFi parameters (WLANConfiguration namespace):**
```
ParameterNames: ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID",
                 "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID"]
```

**Set WiFi SSID:**
```json
{"name": "setParameterValues",
 "parameterValues": [
   ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID", "MyWiFi", "xsd:string"]
]}
```

## WiFi Read Workflow

When a user asks "why doesn't 5G WiFi appear":

1. **Check if device has been discovered**
   - Look at `device.parameters.__discovered__._leaves`
   - If empty, start discovery (POST `/api/devices/{id}/discover` on custom ACS,
     or refreshObject on GenieACS NBI)

2. **Check what WiFi params are already cached**
   - Query `/api/devices/{id}` and inspect `parameters` JSON
   - Look for `WLANConfiguration.`, `WIFI.`, or `Device.WiFi.` keys
   - Note which instances exist (1=2.4GHz, 5=5GHz typically)

3. **Trigger WiFi read**
   - POST `/api/devices/{id}/parameters` with names covering both 2.4GHz and 5GHz
   - Wait for CPE to connect and process the task
   - Re-check device parameters

4. **Verify ZTE frequency band**
   - Check `X_ZTE-COM_OperatingFrequencyBand` on each instance
   - Instance 1 should show "2.4GHz", Instance 5 should show "5GHz"
   - If `OperatingFrequencyBand` is missing, the CPE may not support 5GHz

5. **Check CPE capabilities**
   - Verify model supports dual-band WiFi
   - Check firmware version for 5GHz support
   - Some CPEs disable 5GHz in firmware configuration

## Connection Request & CGNAT Handling

If the CPE is behind CGNAT:
- The ConnectionRequest URL will contain a 100.64.x.x (CGNAT) IP
- Direct connection requests from ACS will fail
- The CPE must initiate all sessions via periodic Inform
- Set `PeriodicInformInterval` to a low value (60-300s)
- Use `connection_request=false` when enqueuing tasks (they'll be picked up
  on next Inform)

## Virtual Parameters

Virtual parameters are computed expressions derived from actual device params:

| VP Name | Source Paths | Description |
|---------|-------------|-------------|
| `vLoginPPPoE` | PPPoE credentials | ISP login |
| `vWAN1_IP` | WAN ExternalIPAddress | Public IP |
| `vIP_Voip` | VoIP IP | Voice IP |
| `vWifi-2G` | WLANConfiguration.1 SSID | 2.4GHz network name |
| `vWifi-5G` | WLANConfiguration.5 SSID | 5GHz network name |

Definitions are stored in `Config` table with category `virtual` and key
prefix `virtualparam.` (e.g., `virtualparam.vWifi-2G`).

## Troubleshooting Workflow

When debugging CPE issues:

1. **Check device status** — `GET /api/devices` or `GET /devices/?query={"_id":"..."}`
2. **Check pending tasks** — Are there tasks stuck in PENDING?
3. **Check device logs** — Any error messages in recent sessions?
4. **Check parameters** — What params does the CPE actually report?
5. **Test direct parameter read** — Queue a GetParameterValues for a single param
6. **Check CPE connectivity** — Is the CPE behind CGNAT?
7. **Review ACS logs** — Look for SOAP Faults or CWMP errors
8. **Try a manual refreshObject** — Refresh from root to rediscover data model

## Useful GenieACS Data Model Queries

```json
// Find devices with 5GHz WiFi discovered
{"InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID": {"$exists": true}}

// Find devices online in last 24h
{"_lastInform": {"$gt": "2026-07-08 09:00:00 +0000"}}

// Find devices by model
{"DeviceID.ProductClass": "F670L"}

// Find devices with specific firmware
{"InternetGatewayDevice.DeviceInfo.SoftwareVersion": "V9.0.11P1N52"}
```
