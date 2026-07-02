#!/bin/bash
LOGIN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@tr069.acs","password":"admin123"}')
echo "LOGIN: $LOGIN"
TOKEN=$(echo "$LOGIN" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
echo "TOKEN: ${TOKEN:0:30}..."
if [ -n "$TOKEN" ]; then
  RESULT=$(curl -s -X PATCH http://localhost:3000/api/tenant/acs-settings \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"acsPublicUrl":"http://177.93.157.113:7547","connectionRequestEnabled":true}')
  echo "PATCH RESULT: $RESULT"
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH http://localhost:3000/api/tenant/acs-settings \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"acsPublicUrl":"http://177.93.157.113:7547","connectionRequestEnabled":true}')
  echo "PATCH HTTP CODE: $CODE"
fi
