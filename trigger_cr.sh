#!/bin/bash
TOKEN=$(curl -s http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@acs.local","password":"admin123"}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["accessToken"])')
echo "Sending connection request to XX530v..."
curl -s -X POST "http://localhost:3000/api/devices/cmrd6v1nl07rlzyfi90vdjy5q/connection-request" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{}' | python3 -m json.tool
