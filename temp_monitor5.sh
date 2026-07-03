#!/bin/bash
cd /root/tr069
echo "=== ALL CWMP logs from last connection ==="
docker compose logs --tail=50 backend 2>&1 | grep -iE "cwmp|inform|ready|sending|task|command|session"
echo ""
echo "=== Current device status ==="
docker compose exec -T postgres psql -U acs -d tr069_acs -c "SELECT serial, status, \"lastInform\", \"lastContact\", ip_address FROM \"Device\" ORDER BY \"lastInform\" DESC NULLS LAST LIMIT 3;"
