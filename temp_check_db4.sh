#!/bin/bash
echo "=== TEST PSQL ==="
docker exec tr069-postgres psql -U acs -d tr069_acs -c "SELECT 1 AS test"

echo "=== DEVICE COUNT ==="
docker exec tr069-postgres psql -U acs -d tr069_acs -c 'SELECT count(*) FROM "Device"'

echo "=== DEVICES ==="
docker exec tr069-postgres psql -U acs -d tr069_acs -c 'SELECT id, serial, connection_request_url, ip_address FROM "Device" LIMIT 5'
