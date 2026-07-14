with open('/root/tr069/backend/src/acs/cwmp.service.ts', 'r') as f:
    c = f.read()

old = "paramMap[p.Name] = p.Value?.['#text'] ?? p.Value ?? '';"
new = "paramMap[p.Name] = (p.Value && typeof p.Value === 'object' && !('#text' in p.Value)) ? '(hidden)' : (p.Value?.['#text'] ?? p.Value ?? '');"

count = c.count(old)
print('Found %d occurrences' % count)
if count > 0:
    c = c.replace(old, new)
    with open('/root/tr069/backend/src/acs/cwmp.service.ts', 'w') as f:
        f.write(c)
    print('Written')
else:
    print('Pattern not found')

# Verify
with open('/root/tr069/backend/src/acs/cwmp.service.ts', 'r') as f:
    c2 = f.read()
if '(hidden)' in c2:
    print('Fix verified: (hidden) found in file')
else:
    print('ERROR: (hidden) not found in file after replacement')
