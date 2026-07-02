"""
Script de descoberta de padrões de novos roteadores via TR-069 ACS API.
Baseado em técnicas de descoberta de data model do GenieACS.

Uso:
  python discover_device.py <device-id>
  python discover_device.py --list
  python discover_device.py --auto-model <device-id>
"""

import urllib.request, json, sys, os

API_BASE = os.getenv('ACS_API_URL', 'http://localhost:3000/api')
EMAIL = os.getenv('ACS_EMAIL', 'admin@acs.local')
PASSWORD = os.getenv('ACS_PASSWORD', 'admin123')

def login():
    data = json.dumps({'email': EMAIL, 'password': PASSWORD}).encode()
    req = urllib.request.Request(f'{API_BASE}/auth/login', data, {'Content-Type': 'application/json'})
    r = urllib.request.urlopen(req)
    return json.loads(r.read())['accessToken']

def api_get(token, path):
    req = urllib.request.Request(f'{API_BASE}{path}', headers={'Authorization': f'Bearer {token}'})
    return json.loads(urllib.request.urlopen(req).read())

def api_post(token, path, data=None):
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(f'{API_BASE}{path}', body or b'', {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
    })
    return json.loads(urllib.request.urlopen(req).read())

def list_devices(token):
    devices = api_get(token, '/devices')
    print(f"\n{'='*70}")
    print(f"DISPOSITIVOS ({devices['total']} total):")
    print(f"{'SERIAL':<25} {'MODELO':<25} {'STATUS':<12} {'IP':<15}")
    print(f"{'-'*25} {'-'*25} {'-'*12} {'-'*15}")
    for d in devices.get('data', []):
        print(f"{d['serial']:<25} {d['modelName']:<25} {d['status']:<12} {d.get('ipAddress',''):<15}")
    print()

def discover_device(token, device_id):
    print(f"\nDescobrindo parâmetros do dispositivo {device_id}...")
    result = api_post(token, f'/models/{device_id}/discover')
    
    print(f"\nFabricante: {result.get('manufacturer', 'N/A')}")
    print(f"Modelo:     {result.get('modelName', 'N/A')}")
    print(f"Hardware:   {result.get('hardwareVersion', 'N/A')}")
    print(f"Software:   {result.get('softwareVersion', 'N/A')}")
    print(f"OUI:        {result.get('oui', 'N/A')}")
    print(f"Product:    {result.get('productClass', 'N/A')}")
    print(f"Serial:     {result.get('serialNumber', 'N/A')}")
    print(f"Total params: {result.get('totalParameters', 0)}")
    
    if result.get('existingModel'):
        m = result['existingModel']
        print(f"\nModelo já existe no banco: {m['manufacturer']} {m['name']} (ID: {m['id']})")
    elif result.get('suggestCreate'):
        print(f"\n>>> NOVO MODELO DETECTADO! <<<")
        print(f"Execute: python discover_device.py --auto-model {device_id}")
    
    params = result.get('parameters', {})
    if params:
        print(f"\n--- AMOSTRA DE PARÂMETROS (primeiros 20) ---")
        for i, (k, v) in enumerate(list(params.items())[:20]):
            print(f"  {k} = {v}")
        if len(params) > 20:
            print(f"  ... e mais {len(params) - 20} parâmetros")
    
    return result

def auto_create_model(token, device_id):
    print(f"\nCriando modelo automaticamente a partir do dispositivo {device_id}...")
    result = api_post(token, f'/models/{device_id}/auto-model')
    print(f"\nResultado: {result.get('message', 'OK')}")
    if 'model' in result:
        m = result['model']
        print(f"Modelo criado: {m['manufacturer']} {m['name']} (ID: {m['id']})")
    return result

if __name__ == '__main__':
    if len(sys.argv) < 2 or sys.argv[1] in ('-h', '--help'):
        print(__doc__)
        sys.exit(0)
    
    token = login()
    
    if sys.argv[1] == '--list':
        list_devices(token)
    elif sys.argv[1] == '--auto-model' and len(sys.argv) > 2:
        auto_create_model(token, sys.argv[2])
    else:
        discover_device(token, sys.argv[1])
