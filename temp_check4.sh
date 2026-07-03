#!/bin/bash
cd /root/tr069
echo "=== CPE Connection Logs ==="
docker compose logs --tail=20 backend 2>&1 | grep -v "MaxListeners\|Nest\|Mapped\|RouterExplorer\|RoutesResolver\|running\|Docs\|warnings\|node\|listen"
echo ""
echo "=== Tasks Status ==="
docker compose exec -T postgres psql -U acs -d tr069_acs -c "SELECT status, count(*) FROM \"Task\" WHERE \"deviceId\"='cmr3uhg6v00091hv8go5q0b15' GROUP BY status;"
echo ""
echo "=== Last Inform ==="
docker compose exec -T postgres psql -U acs -d tr069_acs -c "SELECT serial, status, last_inform, last_contact FROM \"Device\" ORDER BY last_inform DESC LIMIT 1;"
