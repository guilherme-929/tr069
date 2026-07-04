"""
Tenta acessar a API da UI do GenieACS de diferentes formas
"""
import json
import urllib.request, urllib.error

GENIEACS_UI = 'http://179.51.184.205:3333'
USERNAME = 'admin'
PASSWORD = 'Alemnet2025'


def try_url(path: str, method='GET', data=None, content_type='application/json'):
    url = f'{GENIEACS_UI}{path}'
    try:
        headers = {'Content-Type': content_type}
        if data:
            req = urllib.request.Request(url, data=json.dumps(data).encode(), headers=headers, method=method)
        else:
            req = urllib.request.Request(url, headers=headers, method=method)
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:500]
    except Exception as e:
        return 0, str(e)


# Tenta diferentes endpoints de login
print('=== Tentando login na UI do GenieACS ===')
print()

endpoints = [
    ('POST', '/api/login', {'username': USERNAME, 'password': PASSWORD}),
    ('POST', '/api/auth/login', {'username': USERNAME, 'password': PASSWORD}),
    ('POST', '/api/session', {'username': USERNAME, 'password': PASSWORD}),
    ('POST', '/login', {'username': USERNAME, 'password': PASSWORD}),
    ('POST', '/api/login', {'email': USERNAME, 'password': PASSWORD}),
    ('POST', '/api/login', {'user': USERNAME, 'pass': PASSWORD}),
]

for method, path, body in endpoints:
    status, result = try_url(path, method, body)
    print(f'  {method} {path}: {status}')
    if status == 200:
        print(f'    SUCESSO! Resposta: {str(result)[:300]}')
    elif status != 404:
        print(f'    Resposta: {str(result)[:200]}')

print()
print('=== Explorando endpoints da API ===')
print()

# Tenta endpoints comuns sem auth
api_paths = [
    '/api/devices?limit=3',
    '/api/devices',
    '/api/stats',
    '/api/overview',
    '/api/summary',
    '/api/device/list?limit=3',
    '/api/presets',
    '/api/provisions',
    '/api/files',
    '/devices',
    '/api/faults',
]

for path in api_paths:
    status, result = try_url(path)
    print(f'  GET {path}: {status}')
    if status == 200:
        if isinstance(result, dict):
            print(f'    Chaves: {list(result.keys())[:10]}')
            print(f'    Amostra: {str(result)[:300]}')
        elif isinstance(result, list):
            print(f'    Total: {len(result)}')
            if result:
                print(f'    Primeiro: {str(result[0])[:200]}')
        else:
            print(f'    {str(result)[:300]}')

print()
print('=== Tentando login de verdade e depois acessar devices ===')
print()

try:
    # Tenta POST form-urlencoded
    data = f'username={USERNAME}&password={PASSWORD}'.encode()
    req = urllib.request.Request(
        f'{GENIEACS_UI}/api/login',
        data,
        {'Content-Type': 'application/x-www-form-urlencoded'}
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        result = json.loads(r.read())
        print(f'Login OK: {str(result)[:200]}')

        if isinstance(result, dict) and 'token' in result:
            token = result['token']
            # Tenta acessar devices com o token
            req2 = urllib.request.Request(
                f'{GENIEACS_UI}/api/devices?limit=5',
                headers={'Authorization': f'Bearer {token}'}
            )
            with urllib.request.urlopen(req2, timeout=10) as r2:
                devs = json.loads(r2.read())
                print(f'Devices: {len(devs)}')
        elif isinstance(result, str):
            print(f'String response: {result[:200]}')
except urllib.error.HTTPError as e:
    print(f'HTTP {e.code}: {e.read().decode()[:300]}')
except Exception as e:
    print(f'Erro: {e}')
