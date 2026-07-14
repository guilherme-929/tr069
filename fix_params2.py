import subprocess, json, os

result = subprocess.run([
    'docker', 'exec', '-i', 'tr069-postgres', 'psql', '-U', 'acs', '-d', 'tr069_acs',
    '-t', '-A',
    '-c', "SELECT id, parameters::text FROM \"Device\" WHERE serial='22521Y0001317'"
], capture_output=True, text=True)

output = result.stdout.strip()
parts = output.split('|', 1)
device_id = parts[0].strip()
params = json.loads(parts[1].strip())

fixed = False
for k, v in params.items():
    if isinstance(v, dict):
        keys = list(v.keys())
        if len(keys) == 1 and any(x in keys[0] for x in ['xsi:type', '@_xsi']):
            print(f'  {k} = {v}  ->  (hidden)')
            params[k] = '(hidden)'
            fixed = True

if fixed:
    params_str = json.dumps(params).replace("'", "''")
    sql = f"UPDATE \"Device\" SET parameters = '{params_str}'::jsonb WHERE id='{device_id}'"
    with open('/tmp/update.sql', 'w') as f:
        f.write(sql)
    subprocess.run(['docker', 'cp', '/tmp/update.sql', 'tr069-postgres:/tmp/update.sql'])
    subprocess.run(['docker', 'exec', 'tr069-postgres', 'psql', '-U', 'acs', '-d', 'tr069_acs', '-f', '/tmp/update.sql'])
    print('Fixed!')
else:
    print('Already clean')
