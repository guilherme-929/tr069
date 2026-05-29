#!/bin/sh
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@acs.local","password":"admin123"}' | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
echo "=== Models ==="
curl -s http://localhost:3000/api/models -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
