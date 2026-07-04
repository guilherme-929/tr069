"""Parse GenieACS provisions, presets, and config for migration"""
import json, os, re

BASE = r'C:\Users\Windows 10\Documents\CONSULTORIA\PROJETOS\tr069'

def load(name):
    with open(os.path.join(BASE, name), 'r', encoding='utf-8') as f:
        return json.load(f)

provisions = load('genieacs_provisions.json')
presets = load('genieacs_presets.json')
files = load('genieacs_files.json')

print('=== PROVISIONS ===')
print(f'Total: {len(provisions)}')
for p in provisions:
    pid = p['_id']
    script = p.get('script', '')
    lines = script.strip().count('\n') + 1 if script.strip() else 0
    print(f'\n>>> {pid} <<< ({lines} lines)')
    # Print first 500 chars of script
    if script:
        print(script[:600])
    print()

print('\n\n=== PRESETS ===')
print(f'Total: {len(presets)}')
for p in presets:
    print(f'\n>>> {p["_id"]} <<<')
    print(f'  Precondition: {str(p.get("precondition", ""))[:200]}')
    print(f'  Channel: {p.get("channel", "?")}')
    configs = p.get('configurations', [])
    print(f'  Configurations ({len(configs)}):')
    for c in configs:
        print(f'    - {c.get("name", c.get("type", "?"))}')

print('\n\n=== FILES ===')
print(f'Files count: {len(files)}')

print('\n\n=== KEY CONFIG FINDINGS ===')
print('CWMP Auth uses JWT_SECRET as password!')
print('Custom ACS must use ACS_AUTH_PASSWORD = JWT_SECRET')
print()
print('GenieACS provisions map to virtual parameters and device configuration')
