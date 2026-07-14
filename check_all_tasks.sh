#!/bin/bash
echo "=== All XX530v tasks ==="
docker exec tr069-postgres psql -U acs -d tr069_acs -c "SELECT type, status, payload, error, attempts, \"createdAt\" FROM \"Task\" WHERE \"deviceId\" = (SELECT id FROM \"Device\" WHERE serial='22521Y0001317') ORDER BY \"createdAt\" DESC LIMIT 10;"

echo ""
echo "=== Current params count ==="
docker exec tr069-postgres psql -U acs -d tr069_acs -c "SELECT length(\"parameters\"::text) as params_len FROM \"Device\" WHERE serial='22521Y0001317';"

echo ""
echo "=== Any WiFi params in device? ==="
docker exec tr069-postgres psql -U acs -d tr069_acs -c "SELECT \"parameters\"::text FROM \"Device\" WHERE serial='22521Y0001317' AND \"parameters\"::text LIKE '%WiFi%';"
