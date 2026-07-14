import subprocess, json

result = subprocess.run([
    'docker', 'exec', '-i', 'tr069-postgres', 'psql', '-U', 'acs', '-d', 'tr069_acs',
    '-t', '-A',
    '-c', "SELECT id, parameters::text FROM \"Device\" WHERE serial='22521Y0001317'"
], capture_output=True, text=True)

output = result.stdout.strip()
if not output:
    print('No device found')
    exit(1)

parts = output.split('|', 1)
device_id = parts[0].strip()
params = json.loads(parts[1].strip())

fixed = False
for k, v in params.items():
    if isinstance(v, dict):
        keys = list(v.keys())
        if len(keys) == 1 and ('xsi:type' in keys[0] or '@_xsi' in keys[0]):
            print(f'  {k} = {v}  ->  "(hidden)"')
            params[k] = '(hidden)'
            fixed = True

if fixed:
    params_json = json.dumps(params)
    subprocess.run([
        'docker', 'exec', '-i', 'tr069-postgres', 'psql', '-U', 'acs', '-d', 'tr069_acs',
        '-c', f"UPDATE \"Device\" SET parameters = '{params_json}'::jsonb WHERE id='{device_id}'"
    ])
    print(f'Fixed')
else:
    print('No object values found (already clean)')
