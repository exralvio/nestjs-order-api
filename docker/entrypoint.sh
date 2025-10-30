#!/usr/bin/env bash
set -euo pipefail

# Wait for Postgres to be ready
if [ -n "${DATABASE_URL:-}" ]; then
  echo "Waiting for PostgreSQL to be ready..."
  DB_URI_FOR_READY="$DATABASE_URL"
  # Strip query string (e.g., ?schema=public) which pg_isready doesn't accept
  if echo "$DB_URI_FOR_READY" | grep -q "?"; then
    DB_URI_FOR_READY="${DB_URI_FOR_READY%%\?*}"
  fi
  until pg_isready -d "$DB_URI_FOR_READY" -q; do
    sleep 1
  done
  echo "PostgreSQL is ready."
fi

# Apply migrations for default database
if command -v npx >/dev/null 2>&1; then
  echo "Running prisma migrate deploy..."
  npx prisma migrate deploy
  echo "Seeding database (if configured)..."
  npx prisma db seed || true
fi

# Start API and Consumers under PM2
exec pm2-runtime start /app/docker/pm2.config.js
