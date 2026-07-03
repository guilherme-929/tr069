#!/bin/bash
cd /root/tr069
echo "Deleting old PENDING tasks..."
docker compose exec -T postgres psql -U acs -d tr069_acs -c "DELETE FROM \"Task\" WHERE \"deviceId\"='cmr3uhg6v00091hv8go5q0b15' AND status='PENDING';"
echo "Done."
echo "Remaining tasks:"
docker compose exec -T postgres psql -U acs -d tr069_acs -c "SELECT status, count(*) FROM \"Task\" WHERE \"deviceId\"='cmr3uhg6v00091hv8go5q0b15' GROUP BY status;"
