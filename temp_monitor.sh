#!/bin/bash
echo "=== monitoring CWMP at $(date) ==="
docker logs tr069-backend --since 2m 2>&1 | grep -E 'CWMP req|sending command|handleCpeReady|already READY|empty POST|pending tasks|task.*complete|session|Error'
echo "---"
docker exec tr069-postgres psql -U acs -d tr069_acs -t -c "SELECT status, COUNT(*) FROM \"Task\" WHERE \"deviceId\" = (SELECT id FROM \"Device\" WHERE serial = 'ZTE0QJNQ1407460') GROUP BY status;" 2>/dev/null
echo "---"
docker exec tr069-postgres psql -U acs -d tr069_acs -t -c "SELECT \"lastContact\" FROM \"Device\" WHERE serial = 'ZTE0QJNQ1407460';" 2>/dev/null
