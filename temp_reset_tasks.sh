#!/bin/bash
echo "=== RESETTING STUCK TASKS ==="
docker exec tr069-postgres psql -U acs -d tr069_acs << 'SQL'
UPDATE "Task" SET status = 'PENDING' 
WHERE status = 'IN_PROGRESS' 
AND "deviceId" = (SELECT id FROM "Device" WHERE serial = 'ZTE0QJNQ1407460');
SQL

echo "=== TASKS AFTER RESET ==="
docker exec tr069-postgres psql -U acs -d tr069_acs << 'SQL'
SELECT type, status, COUNT(*) as count
FROM "Task" 
WHERE "deviceId" = (SELECT id FROM "Device" WHERE serial = 'ZTE0QJNQ1407460')
GROUP BY type, status
ORDER BY type, status;
SQL

echo "=== DEVICE STATUS ==="
docker exec tr069-postgres psql -U acs -d tr069_acs << 'SQL'
SELECT serial, status, "connectionRequestUrl", "ipAddress", "lastContact"
FROM "Device" WHERE serial = 'ZTE0QJNQ1407460';
SQL
