#!/bin/bash
# Check devices with connection request URL issues
docker exec tr069-postgres psql -U acs -d tr069_acs << 'EOF'
SELECT id, serial, connection_request_url, ip_address, wan_ip 
FROM "Device" 
WHERE connection_request_url LIKE '%0.0.0.0%' 
   OR connection_request_url LIKE '%[::]%' 
   OR connection_request_url IS NULL
LIMIT 20;
EOF
