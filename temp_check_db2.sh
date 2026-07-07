#!/bin/bash
echo "=== ALL DEVICES ==="
docker exec tr069-postgres psql -U acs -d tr069_acs << 'SQL'
SELECT id, serial, connection_request_url, ip_address, status
FROM "Device" 
ORDER BY last_contact DESC NULLS LAST
LIMIT 10;
SQL

echo "=== COUNT ==="
docker exec tr069-postgres psql -U acs -d tr069_acs << 'SQL'
SELECT COUNT(*) as total FROM "Device";
SQL
