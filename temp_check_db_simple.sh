#!/bin/bash
set -x
DEVICE_ID=$(docker exec tr069-postgres psql -U acs -d tr069_acs -t -c "SELECT id FROM \"Device\" WHERE serial='ZTE0QJNQ1407460'")
echo "DEVICE_ID: [$DEVICE_ID]"

echo "=== TASKS ==="
docker exec tr069-postgres psql -U acs -d tr069_acs -c "SELECT type, status FROM \"Task\" WHERE \"deviceId\" = '$DEVICE_ID' ORDER BY \"createdAt\" DESC LIMIT 10"
