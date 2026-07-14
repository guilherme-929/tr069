#!/bin/bash
echo "=== XX530v recent tasks ==="
docker exec tr069-postgres psql -U acs -d tr069_acs -c "SELECT type, status, error, attempts, \"createdAt\" FROM \"Task\" WHERE \"deviceId\" = (SELECT id FROM \"Device\" WHERE serial='22521Y0001317') ORDER BY \"createdAt\" DESC LIMIT 8;"

echo ""
echo "=== Any new WiFi params? ==="
docker exec tr069-postgres psql -U acs -d tr069_acs -c "SELECT \"parameters\"::text FROM \"Device\" WHERE serial='22521Y0001317' AND \"parameters\"::text LIKE '%Device.WiFi.SSID%';"

echo ""
echo "=== Virtual params ==="
docker exec tr069-postgres psql -U acs -d tr069_acs -c "SELECT key, value FROM \"Config\" WHERE key LIKE 'virtualparam.%';"
