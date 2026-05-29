#!/bin/sh
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@acs.local","password":"admin123"}' | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
echo "TOKEN: $TOKEN"
RESULT=$(curl -s -X POST http://localhost:3000/api/models \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"manufacturer":"ZTE","name":"F670L","hwVersion":"V1.0","dataModel":"TR-098","description":"ZTE F670L ONU GPON"}')
echo "RESULT: $RESULT"
