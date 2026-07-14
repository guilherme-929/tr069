#!/bin/bash
echo "=== Device status ==="
docker exec tr069-postgres psql -U acs -d tr069_acs -c 'SELECT serial, "modelName", status, "lastContact", ip_address FROM "Device";'
echo ""
echo "=== Pending tasks count ==="
docker exec tr069-postgres psql -U acs -d tr069_acs -c 'SELECT COUNT(*) as pending_tasks FROM "Task" WHERE status='\''PENDING'\'';'
echo ""
echo "=== Tasks by device and type ==="
docker exec tr069-postgres psql -U acs -d tr069_acs -c "SELECT d.serial, d.\"modelName\", t.type, t.status, COUNT(*) as qty FROM \"Task\" t JOIN \"Device\" d ON d.id = t.\"deviceId\" WHERE t.status='PENDING' GROUP BY d.serial, d.\"modelName\", t.type, t.status ORDER BY d.serial, t.type;"
echo ""
echo "=== Config virtual params ==="
docker exec tr069-postgres psql -U acs -d tr069_acs -c "SELECT key, value FROM \"Config\" WHERE category='virtual';"
