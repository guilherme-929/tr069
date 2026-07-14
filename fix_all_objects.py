import json, subprocess

result = subprocess.run([
    'docker', 'exec', '-i', 'tr069-postgres', 'psql', '-U', 'acs', '-d', 'tr069_acs',
    '-t', '-A',
    '-c', 'SELECT id, serial, parameters::text FROM "Device"'
], capture_output=True, text=True)

for line in result.stdout.strip().split('\n'):
    if not line.strip() or '|' not in line:
        continue
    parts = line.split('|', 2)
    device_id = parts[0].strip()
    serial = parts[1].strip()
    params = json.loads(parts[2].strip())

    fixed = False
    for k, v in params.items():
        if isinstance(v, dict):
            keys = list(v.keys())
            if len(keys) == 1 and ('xsi:type' in keys[0] or '@_xsi' in keys[0]):
                print(f'{serial}: {k} = {v} -> (hidden)')
                params[k] = '(hidden)'
                fixed = True

    if fixed:
        params_str = json.dumps(params).replace("'", "''")
        sql = f"UPDATE \"Device\" SET parameters = '{params_str}'::jsonb WHERE id='{device_id}'"
        with open('/tmp/update.sql', 'w') as f:
            f.write(sql)
        subprocess.run(['docker', 'cp', '/tmp/update.sql', 'tr069-postgres:/tmp/update.sql'])
        subprocess.run(['docker', 'exec', 'tr069-postgres', 'psql', '-U', 'acs', '-d', 'tr069_acs', '-f', '/tmp/update.sql'])
        print(f'  -> Fixed {serial}')

print('Done')
