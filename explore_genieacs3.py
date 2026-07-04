"""
Usa o token JWT para extrair dados reais do GenieACS
"""
import json
import urllib.request, urllib.error

GENIEACS_UI = 'http://179.51.184.205:3333'
TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImFkbWluIiwiYXV0aE1ldGhvZCI6ImxvY2FsIiwiaWF0IjoxNzgzMTExODAwfQ.Dfa51QL6Lb0FHR5wQ3MFszzKrloaTxfQyJGI0J8FA2c'


def api_get(path: str) -> dict:
    url = f'{GENIEACS_UI}{path}'
    try:
        req = urllib.request.Request(url, headers={
            'Authorization': f'Bearer {TOKEN}',
            'Content-Type': 'application/json',
        })
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:1000]
    except Exception as e:
        return 0, str(e)


def api_get_text(path: str) -> tuple:
    url = f'{GENIEACS_UI}{path}'
    try:
        req = urllib.request.Request(url, headers={
            'Authorization': f'Bearer {TOKEN}',
        })
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, r.read().decode()[:3000]
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:1000]
    except Exception as e:
        return 0, str(e)


# Tenta diferentes endpoints com o token
print('=== ACESSANDO API COM TOKEN JWT ===')
print()

endpoints = [
    '/api/devices?limit=5',
    '/api/devices?query=%7B%7D&limit=5',
    '/api/devices?projection=DeviceID.SerialNumber%2CDeviceID.ProductClass%2CInternetGatewayDevice.DeviceInfo.SoftwareVersion%2CInternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID%2CVirtualParameters&limit=5',
    '/api/presets/',
    '/api/provisions/',
    '/api/files/',
    '/api/faults?limit=5',
]

for path in endpoints:
    status, result = api_get(path)
    print(f'  GET {path}: {status}')
    if status == 200:
        if isinstance(result, list):
            print(f'    Total: {len(result)}')
            for item in result[:3]:
                if isinstance(item, dict):
                    print(f'    - {str(item)[:200]}')
                else:
                    print(f'    - {str(item)[:200]}')
        elif isinstance(result, dict):
            print(f'    Chaves: {list(result.keys())[:15]}')
            print(f'    {str(result)[:500]}')
        else:
            print(f'    {str(result)[:500]}')
    elif status != 404:
        print(f'    Resposta: {str(result)[:300]}')
    print()

# Tenta acessar provisions scripts
print('=== PROVISIONS (SCRIPTS) ===')
print()
status, result = api_get('/api/provisions/')
if status == 200:
    if isinstance(result, list):
        for p in result:
            print(f'  Provision: {p.get("_id", "?")}')
    else:
        print(f'  {str(result)[:500]}')
else:
    print(f'  Erro {status}: {str(result)[:200]}')

# Tenta acessar presets
print()
print('=== PRESETS ===')
print()
status, result = api_get('/api/presets/')
if status == 200:
    if isinstance(result, list):
        for p in result:
            print(f'  Preset: {p.get("_id", "?")}')
            print(f'    Precondition: {str(p.get("precondition", ""))[:150]}')
            configs = p.get('configurations', [])
            for c in configs[:5]:
                print(f'    Config: {c.get("name", c.get("type", "?"))}')
    else:
        print(f'  {str(result)[:500]}')
else:
    print(f'  Erro {status}: {str(result)[:200]}')

# Tenta extrair devices com parâmetros WiFi detalhados
print()
print('=== DETALHANDO DEVICES COM PARÂMETROS WiFi ===')
print()
import json as j
query = j.dumps({})
encoded = urllib.parse.quote(query)
status, result = api_get(f'/api/devices?query={encoded}&limit=5')
if status == 200 and isinstance(result, list):
    for dev in result:
        dev_id = dev.get('_id', '?')
        print(f'  Device: {dev_id[:60]}')
        # Procura parâmetros WiFi
        for k in sorted(dev.keys()):
            if any(x in k.lower() for x in ['wifi', 'wlan', 'ssid', 'passphrase', 'preshared',
                                              'channel', 'radi', 'beacon', 'associateddevice',
                                              'signalstrength']):
                print(f'    {k}: {dev[k]}')
        print()
else:
    print(f'  Erro ou formato inesperado: {status} - {str(result)[:200]}')
