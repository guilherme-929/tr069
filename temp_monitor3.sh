#!/bin/bash
cd /root/tr069
echo "=== Recent backend logs ==="
docker compose logs --tail=40 backend 2>&1 | grep -vE "MaxListeners|Nest|Mapped|RouterExplorer|RoutesResolver|running|Docs|node|healthcheck|listen|warning|error|ahead"
echo ""
echo "=== Device status ==="
docker compose exec -T postgres psql -U acs -d tr069_acs -c "SELECT serial, status, \"lastInform\", \"lastContact\" FROM \"Device\" WHERE serial='ZTE0QJNQ1407460';"
echo ""
echo "=== Tasks ==="
docker compose exec -T postgres psql -U acs -d tr069_acs -c "SELECT type, status, count(*) FROM \"Task\" WHERE \"deviceId\"='cmr3uhg6v00091hv8go5q0b15' GROUP BY type, status ORDER BY type;"
