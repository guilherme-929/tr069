"""Check WiFi parameters reported by CPEs via Inform.

Queries /api/devices and inspects the `parameters` JSON for each device to see
which WiFi/WLAN paths actually arrived. Useful to confirm whether the CPE is
sending WiFi data at all (most TR-098 CPEs do not publish WLANConfiguration
in the Inform ParameterList, only the management server URL and a few
Device.Info.* fields).
"""
import json
import sys
import urllib.error
import urllib.request

BASE = 'http://179.51.184.205/api'
EMAIL = 'admin@acs.local'
PASSWORD = 'admin123'


def login() -> str:
    data = json.dumps({'email': EMAIL, 'password': PASSWORD}).encode()
    req = urllib.request.Request(
        f'{BASE}/auth/login', data, {'Content-Type': 'application/json'},
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())['accessToken']


def get(path: str, token: str):
    req = urllib.request.Request(
        f'{BASE}{path}', headers={'Authorization': f'Bearer {token}'},
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


# Paths we care about (TR-098 + TR-181).
IGD_WLAN_RE = 'InternetGatewayDevice.LANDevice'
TR181_WIFI_RE = 'Device.WiFi.'
SPECIFIC_PATHS = [
    # TR-098
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID',
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase',
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Enable',
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Channel',
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Status',
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID',
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.KeyPassphrase',
    # TR-181
    'Device.WiFi.SSID.1.SSID',
    'Device.WiFi.SSID.1.Enable',
    'Device.WiFi.AccessPoint.1.Security.KeyPassphrase',
    'Device.WiFi.Radio.1.Channel',
    'Device.WiFi.Radio.2.Channel',
    'Device.WiFi.Radio.1.OperatingFrequencyBand',
]


def inspect_device(device: dict, idx: int, total: int) -> None:
    serial = device.get('serial', '?')
    model = device.get('modelName', '?')
    status = device.get('status', '?')
    ip = device.get('ipAddress', '-')
    last = device.get('lastContact', '-')

    print(f'\n[{idx}/{total}] {serial}  model={model}  status={status}  '
          f'ip={ip}  lastContact={last}')

    params = device.get('parameters') or {}
    if not isinstance(params, dict):
        print('  (parameters is not a dict — skip)')
        return

    # Specific path presence
    print('  Specific WiFi paths:')
    for p in SPECIFIC_PATHS:
        v = params.get(p)
        if v is not None and v != '':
            shown = str(v)
            if len(shown) > 40:
                shown = shown[:40] + '...'
            print(f'    OK   {p} = {shown}')
        else:
            print(f'    MISS {p}')

    # Broad count
    igd_wifi = [k for k in params if IGD_WLAN_RE in k]
    tr181_wifi = [k for k in params if k.startswith(TR181_WIFI_RE)]
    print(f'  Total IGD WLAN keys in Inform: {len(igd_wifi)}')
    print(f'  Total TR-181 WiFi keys in Inform: {len(tr181_wifi)}')

    # Discovery progress
    discovered = params.get('__discovered__') or {}
    leaves = discovered.get('_leaves') or []
    wifi_leaves = [
        l for l in leaves
        if IGD_WLAN_RE in l or l.startswith(TR181_WIFI_RE)
    ]
    print(f'  Discovered leaves: {len(leaves)} total, '
          f'{len(wifi_leaves)} are WiFi')

    # If __discovered__ has _values, show wifi subset
    values = discovered.get('_values') or {}
    wifi_values = {
        k: v for k, v in values.items()
        if IGD_WLAN_RE in k or k.startswith(TR181_WIFI_RE)
    }
    if wifi_values:
        print('  Discovered WiFi values (sample up to 10):')
        for k, v in list(wifi_values.items())[:10]:
            shown = str(v)
            if len(shown) > 60:
                shown = shown[:60] + '...'
            print(f'    {k} = {shown}')

    # Verdict
    if igd_wifi or tr181_wifi or wifi_values:
        print('  -> WiFi data IS present in the system.')
    else:
        print('  -> NO WiFi data anywhere. Run /discover to fetch from CPE.')


def main() -> int:
    target = sys.argv[1] if len(sys.argv) > 1 else None
    token = login()
    print('Logged in OK')

    if target:
        # target may be a serial or device id
        try:
            dev = get(f'/devices/{target}', token)
            inspect_device(dev, 1, 1)
        except urllib.error.HTTPError as e:
            print(f'Failed to fetch {target}: {e.code} {e.reason}')
            return 1
        return 0

    page = 1
    total_seen = 0
    while True:
        resp = get(f'/devices?page={page}&limit=20', token)
        data = resp.get('data', [])
        total = resp.get('total', 0)
        if not data:
            break
        for d in data:
            total_seen += 1
            inspect_device(d, total_seen, total)
        if total_seen >= total:
            break
        page += 1

    print(f'\nInspected {total_seen} device(s).')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
