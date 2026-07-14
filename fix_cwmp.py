import re

with open('/root/tr069/backend/src/acs/cwmp.service.ts', 'r') as f:
    content = f.read()

# Replace the problematic line
old = "paramMap[p.Name] = p.Value?.['#text'] ?? p.Value ?? '';"
new = "paramMap[p.Name] = (p.Value && typeof p.Value === 'object' && !('#text' in p.Value)) ? '(hidden)' : (p.Value?.['#text'] ?? p.Value ?? '');"

count = content.count(old)
if count > 0:
    content = content.replace(old, new)
    with open('/root/tr069/backend/src/acs/cwmp.service.ts', 'w') as f:
        f.write(content)
    print(f'Fixed {count} occurrences')
else:
    print('Pattern not found')
