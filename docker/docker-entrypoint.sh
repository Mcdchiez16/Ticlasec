#!/bin/bash
set -e

# 1. Wait for the configured PostgreSQL database and verify credentials.
# Connecting through DATABASE_URL supports both the local Compose database and
# managed services such as Supabase without hard-coding a container hostname.
echo "[entrypoint] Waiting for PostgreSQL..."
AUTH_OK=false
for i in $(seq 1 15); do
  if python3 -c "
import psycopg2, os, sys
try:
    psycopg2.connect(os.environ.get('DATABASE_URL', ''))
    sys.exit(0)
except Exception:
    sys.exit(1)
" 2>/dev/null; then
    AUTH_OK=true
    break
  fi
  sleep 2
done

if [ "$AUTH_OK" = "false" ]; then
  echo ""
  echo "ERROR: Cannot connect to PostgreSQL after 30 s."
  echo ""
  echo "  Check DATABASE_URL, database availability, SSL requirements, and"
  echo "  whether the configured database accepts connections from this host."
  echo ""
  exit 1
fi
echo "[entrypoint] PostgreSQL ready"

# 2. Apply Alembic migrations (must finish before uvicorn starts).
echo "[entrypoint] Applying migrations..."
alembic upgrade head
echo "[entrypoint] Migrations complete"

# 3. Seed import -- runs in BACKGROUND by default.
# 32k+ entities can take 1-5 min on slow VMs. Running it inline blocks uvicorn
# from starting, which lets the docker healthcheck mark the container
# unhealthy before the app is even reachable. Running in background lets
# uvicorn boot in seconds while seed data populates underneath. Idempotent,
# so safe to re-run on every restart.
#
# Overrides:
#   SKIP_SEED_IMPORT=true   - don't import at all (useful for tests)
#   SEED_FOREGROUND=true    - run synchronously (old behavior; useful for CI)
if [ "${SKIP_SEED_IMPORT:-false}" = "true" ]; then
    echo "[entrypoint] Seed import skipped (SKIP_SEED_IMPORT=true)"
elif [ "${SEED_FOREGROUND:-false}" = "true" ]; then
    echo "[entrypoint] Importing seed data (foreground)..."
    PYTHONPATH=/app python /app/scripts/import_seed.py \
        || echo "[entrypoint] Seed import failed (non-fatal)"
else
    echo "[entrypoint] Importing seed data in background -- log: /tmp/seed_import.log"
    PYTHONPATH=/app nohup python /app/scripts/import_seed.py \
        > /tmp/seed_import.log 2>&1 &
    echo "[entrypoint] Seed import PID: $!"
fi

# 4. Start FastAPI.
echo "[entrypoint] Starting FastAPI..."
exec "$@"
