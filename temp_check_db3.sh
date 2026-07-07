#!/bin/bash
echo "=== SCHEMA ==="
docker exec tr069-postgres psql -U acs -d tr069_acs << 'SQL'
\d "Device"
SQL

echo "=== COUNT ==="
docker exec tr069-postgres psql -U acs -d tr069_acs << 'SQL'
SELECT count(*) FROM "Device";
SQL
