#!/bin/bash
cd /root/tr069
echo "=== Checking recent logs for CPE connections ==="
docker compose logs --tail=30 backend 2>&1 | grep -v "MaxListeners\|Nest\|Mapped\|RouterExplorer\|RoutesResolver\|running\|Docs\|node\|healthcheck\|listen"
echo ""
echo "=== Device status ==="
docker compose exec -T postgres psql -U acs -d tr069_acs -c "SELECT serial, status, last_inform, last_contact FROM \"Device\" WHERE serial='ZTE0QJNQ1407460';"
