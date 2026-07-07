#!/bin/bash
set -x
echo "Starting..."
docker exec tr069-postgres psql -U acs -d tr069_acs -c "SELECT id, serial, \"connectionRequestUrl\", \"ipAddress\", \"wanIp\", status FROM \"Device\" LIMIT 5;" 2>&1
echo "Done."
