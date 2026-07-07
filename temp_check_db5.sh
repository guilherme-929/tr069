#!/bin/bash
docker exec tr069-postgres psql -U acs -d tr069_acs << EOF
\x on
SELECT id, serial, "connectionRequestUrl", "ipAddress", "wanIp", status FROM "Device" LIMIT 5;
EOF
