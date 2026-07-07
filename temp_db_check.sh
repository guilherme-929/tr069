#!/bin/bash
docker exec tr069-backend sh -c "PGPASSWORD=\$(cat /app/.env | grep POSTGRES_PASSWORD | cut -d= -f2) psql -U tr069 -d tr069 -c \"SELECT id, name, channel FROM scripts;\"" 2>/dev/null

# Also try the prisma way
docker exec tr069-backend sh -c "cd /app && npx prisma db execute --stdin 2>/dev/null" <<< "SELECT id, name, channel, LEFT(content, 300) as preview FROM Script;" 2>/dev/null || echo "trying prisma studio..."

# Check the .env for DB connection
docker exec tr069-backend cat /app/.env 2>/dev/null | grep -i postgres || echo "no .env with postgres"
