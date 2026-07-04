"""
Extrai provisions scripts do GenieACS
"""
import json, urllib.request, urllib.error

GENIEACS_UI = 'http://179.51.184.205:3333'
TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImFkbWluIiwiYXV0aE1ldGhvZCI6ImxvY2FsIiwiaWF0IjoxNzgzMTExODAwfQ.Dfa51QL6Lb0FHR5wQ3MFszzKrloaTxfQyJGI0J8FA2c'


def api_get(path):
    url = f'{GENIEACS_UI}{path}'
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {TOKEN}'})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:2000]


# Pegar todos os provisions
status, provisions = api_get('/api/provisions/')
if status == 200:
    print(f'Total provisions: {len(provisions)}')
    print('=' * 80)
    for p in provisions:
        name = p.get('_id', '?')
        script = p.get('script', '')
        print(f'\n{"="*80}')
        print(f'PROVISION: {name}')
        print(f'{"="*80}')
        print(script[:2000])
        if len(script) > 2000:
            print(f'\n... (truncated, total {len(script)} chars)')
else:
    print(f'Error: {status} - {provisions}')
