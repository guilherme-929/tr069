import requests, json

# Load GenieACS configs
with open('/root/tr069/genieacs_config_full.json', 'r') as f:
    genieacs_configs = json.load(f)

print(f'Total GenieACS configs: {len(genieacs_configs)}')

# Login
r = requests.post('http://localhost:3000/api/auth/login', json={'email':'admin@acs.local','password':'admin123'})
tok = r.json()['accessToken']
h = {'Authorization': 'Bearer ' + tok}

# Get existing configs
r2 = requests.get('http://localhost:3000/api/config', headers=h)
existing = {c['key'] for c in r2.json()}
print(f'Existing configs: {len(existing)}')

# Import all GenieACS configs
added = 0
for cfg in genieacs_configs:
    key = cfg['_id']
    value = str(cfg['value'])

    # Determine category
    if key.startswith('ui.'):
        cat = 'ui'
    elif key.startswith('cwmp'):
        cat = 'cwmp'
    elif key.startswith('device.'):
        cat = 'device'
    else:
        cat = 'general'

    if key in existing:
        continue

    r3 = requests.post('http://localhost:3000/api/config', headers=h, json={
        'key': key,
        'value': value,
        'category': cat,
        'description': f'Imported from GenieACS ({cat})'
    })
    if r3.status_code == 201:
        added += 1
        print(f'  + {key} = {value[:60]}')
    else:
        print(f'  ERROR {key}: {r3.status_code} {r3.text}')

print(f'\nAdded {added} configs from GenieACS')
