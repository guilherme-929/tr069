#!/bin/sh
set -e

# Push database schema (with skip-generate since client is pre-built)
npx prisma db push --accept-data-loss --skip-generate

# Start the application
exec node dist/main
