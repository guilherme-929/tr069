"""Fetch provisions, presets, and files from GenieACS"""
import json, urllib.request, urllib.error
import ssl

GENIEACS_URL = 'http://179.51.184.205:7557'
ctx = ssl._create_unverified_context()

def nbi_get(path):
    url = f'{GENIEACS_URL}{path}'
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=15, context=ctx) as r:
            return json.loads(r.read())
    except Exception as e:
        return {'error': str(e)}

print('=== PROVISIONS ===')
provisions = nbi_get('/provisions/')
if isinstance(provisions, list):
    print(f'Total: {len(provisions)}')
    for p in provisions:
        print(f'\n>>> {p.get("_id", "?")} <<<')
        print(json.dumps(p, indent=2, default=str)[:3000])
else:
    print(provisions)

print('\n\n=== PRESETS ===')
presets = nbi_get('/presets/')
if isinstance(presets, list):
    print(f'Total: {len(presets)}')
    for p in presets:
        print(f'\n>>> {p.get("_id", "?")} <<<')
        print(json.dumps(p, indent=2, default=str)[:3000])
else:
    print(presets)

print('\n\n=== FILES ===')
files = nbi_get('/files/')
if isinstance(files, list):
    print(f'Total: {len(files)}')
    for f in files:
        print(f'\n>>> {f.get("_id", "?")} <<<')
        print(json.dumps(f, indent=2, default=str)[:3000])
else:
    print(files)
