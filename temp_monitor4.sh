#!/bin/bash
cd /root/tr069
echo "Monitoring CPE connections for 120 seconds..."
timeout 120 bash -c '
  docker compose logs --tail=0 -f backend 2>&1
' 2>/dev/null
echo ""
echo "=== FINAL STATUS ==="
docker compose exec -T postgres psql -U acs -d tr069_acs -c 'SELECT type, status, count(*) FROM "Task" WHERE "deviceId"='\''cmr3uhg6v00091hv8go5q0b15'\'' GROUP BY type, status ORDER BY type;'
echo ""
echo "=== DEVICE INFO ==="
docker compose exec -T postgres psql -U acs -d tr069_acs -c 'SELECT serial, status, "lastInform", "lastContact" FROM "Device" WHERE serial='\''ZTE0QJNQ1407460'\'';'
