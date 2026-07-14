#!/bin/bash
docker exec tr069-postgres psql -U acs -d tr069_acs -c "SELECT serial, status, \"lastContact\" FROM \"Device\";"
echo ""
echo "=== XX530v tasks ==="
docker exec tr069-postgres psql -U acs -d tr069_acs -c "SELECT type, status, error FROM \"Task\" WHERE \"deviceId\" = (SELECT id FROM \"Device\" WHERE serial='22521Y0001317') ORDER BY \"createdAt\" DESC LIMIT 3;"
