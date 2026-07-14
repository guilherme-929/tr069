#!/bin/bash
echo "=== XX530v tasks (last 5) ==="
docker exec tr069-postgres psql -U acs -d tr069_acs -c "SELECT type, status, payload, error, attempts FROM \"Task\" WHERE \"deviceId\" = (SELECT id FROM \"Device\" WHERE serial='22521Y0001317') ORDER BY \"createdAt\" DESC LIMIT 5;"

echo ""
echo "=== XC220-G3 tasks (last 5) ==="
docker exec tr069-postgres psql -U acs -d tr069_acs -c "SELECT type, status, payload, error, attempts FROM \"Task\" WHERE \"deviceId\" = (SELECT id FROM \"Device\" WHERE serial='V25A024003204') ORDER BY \"createdAt\" DESC LIMIT 5;"

echo ""
echo "=== All pending tasks ==="
docker exec tr069-postgres psql -U acs -d tr069_acs -c "SELECT d.serial, d.\"modelName\", t.type, t.status, COUNT(*) FROM \"Task\" t JOIN \"Device\" d ON d.id = t.\"deviceId\" WHERE t.status='PENDING' GROUP BY d.serial, d.\"modelName\", t.type, t.status;"
