#!/bin/bash
echo "=== XX530v task status (last 8) ==="
docker exec tr069-postgres psql -U acs -d tr069_acs -c "SELECT type, status, error, attempts, \"createdAt\" FROM \"Task\" WHERE \"deviceId\" = (SELECT id FROM \"Device\" WHERE serial='22521Y0001317') ORDER BY \"createdAt\" DESC LIMIT 8;"

echo ""
echo "=== XX530v last contact ==="
docker exec tr069-postgres psql -U acs -d tr069_acs -c "SELECT serial, \"lastContact\" FROM \"Device\" WHERE serial='22521Y0001317';"

echo ""
echo "=== Pending tasks count ==="
docker exec tr069-postgres psql -U acs -d tr069_acs -c "SELECT COUNT(*) as pending FROM \"Task\" WHERE status='PENDING';"

echo ""
echo "=== Device.WiFi params count ==="
docker exec tr069-postgres psql -U acs -d tr069_acs -c "SELECT \"parameters\"::text FROM \"Device\" WHERE serial='22521Y0001317' AND \"parameters\"::text LIKE '%Device.WiFi.SSID%' AND \"parameters\"::text NOT LIKE '%__discovered__%';" | head -5
