#!/bin/bash
set -x
echo "=== ALL TASKS ==="
docker exec tr069-postgres psql -U acs -d tr069_acs -c "SELECT count(*) FROM \"Task\""
docker exec tr069-postgres psql -U acs -d tr069_acs -c "SELECT type, status, \"deviceId\" FROM \"Task\" ORDER BY \"createdAt\" DESC LIMIT 20"

echo ""
echo "=== DEVICE WITH SPACE TRIMMED ==="
DEVICE_ID=$(docker exec tr069-postgres psql -U acs -d tr069_acs -t -c "SELECT id FROM \"Device\" WHERE serial='ZTE0QJNQ1407460'" | xargs)
echo "DEVICE_ID: [$DEVICE_ID]"
docker exec tr069-postgres psql -U acs -d tr069_acs -c "SELECT count(*) FROM \"Task\" WHERE \"deviceId\" = '$DEVICE_ID'"
docker exec tr069-postgres psql -U acs -d tr069_acs -c "SELECT type, status FROM \"Task\" WHERE \"deviceId\" = '$DEVICE_ID' ORDER BY \"createdAt\" DESC"

echo ""
echo "=== PARAMETERS CHECK ==="
docker exec tr069-postgres psql -U acs -d tr069_acs -c "SELECT length(\"parameters\"::text) as params_len FROM \"Device\" WHERE id = '$DEVICE_ID'"
