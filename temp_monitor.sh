#!/bin/bash
cd /root/tr069
echo "Monitoring CPE connections for 60 seconds..."
timeout 60 bash -c '
  docker compose logs --tail=0 -f backend 2>&1 | grep -E "CWMP req|pending tasks|session|COMPLETED|IN_PROGRESS|SENDING|Provision task|WiFi|handleCpeReady|task completed"
' 2>/dev/null
echo ""
echo "=== FINAL TASK STATUS ==="
docker compose exec -T postgres psql -U acs -d tr069_acs -c 'SELECT type, status, count(*) FROM "Task" WHERE "deviceId"='"'"'cmr3uhg6v00091hv8go5q0b15'"'"' GROUP BY type, status ORDER BY type;'
