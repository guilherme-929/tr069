#!/bin/bash
echo "=== Total params count ==="
docker exec tr069-postgres psql -U acs -d tr069_acs -c "SELECT jsonb_object_keys(\"parameters\") as k FROM \"Device\" WHERE serial='22521Y0001317';" 2>/dev/null | grep -c "Device\." || echo "0"

echo ""
echo "=== Device.WiFi params ==="
docker exec tr069-postgres psql -U acs -d tr069_acs -c "SELECT jsonb_object_keys(\"parameters\") FROM \"Device\" WHERE serial='22521Y0001317' AND \"parameters\"::text LIKE '%Device.WiFi.%';" 2>/dev/null | grep -i "Device.WiFi" || echo "No Device.WiFi params found"

echo ""
echo "=== Last 5 completed GPV responses ==="
docker exec tr069-postgres psql -U acs -d tr069_acs -c "SELECT payload, result FROM \"Task\" WHERE \"deviceId\" = (SELECT id FROM \"Device\" WHERE serial='22521Y0001317') AND type='GetParameterValues' AND status='COMPLETED' ORDER BY \"createdAt\" DESC LIMIT 5;"
