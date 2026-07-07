#!/bin/bash
echo "=== TASKS IN DB ==="
docker exec tr069-postgres psql -U acs -d tr069_acs << 'SQL'
SELECT t.id, t.type, t.status, t."deviceId", t."createdAt"
FROM "Task" t
JOIN "Device" d ON d.id = t."deviceId"
WHERE d.serial = 'ZTE0QJNQ1407460'
ORDER BY t."createdAt" DESC
LIMIT 20;
SQL

echo ""
echo "=== TASK COUNT BY STATUS ==="
docker exec tr069-postgres psql -U acs -d tr069_acs << 'SQL'
SELECT t.status, COUNT(*)
FROM "Task" t
JOIN "Device" d ON d.id = t."deviceId"
WHERE d.serial = 'ZTE0QJNQ1407460'
GROUP BY t.status;
SQL

echo ""
echo "=== SESSIONS ==="
docker exec tr069-postgres psql -U acs -d tr069_acs << 'SQL'
SELECT id, event, status, "createdAt" FROM "Session" 
WHERE "deviceId" = (SELECT id FROM "Device" WHERE serial = 'ZTE0QJNQ1407460')
ORDER BY "createdAt" DESC LIMIT 5;
SQL

echo ""
echo "=== EVENTS ==="
docker exec tr069-postgres psql -U acs -d tr069_acs << 'SQL'
SELECT id, code, "createdAt" FROM "Event"
WHERE "deviceId" = (SELECT id FROM "Device" WHERE serial = 'ZTE0QJNQ1407460')
ORDER BY "createdAt" DESC LIMIT 10;
SQL
