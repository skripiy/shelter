#!/bin/sh
# Auto-apply DB migrations on stack start. Idempotent: tracks applied files in
# public.schema_migrations and only runs new ones. Also performs the one-time
# post-init fixes (internal role passwords, _realtime schema) that a fresh
# supabase/postgres volume needs (see SETUP.md / project memory).
set -e

: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD required}"
export PGPASSWORD="$POSTGRES_PASSWORD"

DB_HOST="${DB_HOST:-db}"
ADMIN="psql -v ON_ERROR_STOP=1 -h $DB_HOST -U supabase_admin -d postgres"
PG="psql -v ON_ERROR_STOP=1 -h $DB_HOST -U postgres -d postgres"

log() { echo "[migrate] $*"; }

log "waiting for postgres..."
until pg_isready -h "$DB_HOST" -U postgres >/dev/null 2>&1; do sleep 1; done

# 1. Internal role passwords + _realtime schema (idempotent; needed on a fresh
#    volume so auth/rest/storage/realtime can connect).
log "ensuring internal role passwords + _realtime schema"
$ADMIN >/dev/null <<SQL
ALTER ROLE supabase_auth_admin    WITH PASSWORD '${POSTGRES_PASSWORD}';
ALTER ROLE authenticator          WITH PASSWORD '${POSTGRES_PASSWORD}';
ALTER ROLE supabase_storage_admin WITH PASSWORD '${POSTGRES_PASSWORD}';
CREATE SCHEMA IF NOT EXISTS _realtime AUTHORIZATION supabase_admin;
SQL

# 2. Wait for GoTrue to create the auth schema — migration 001 FKs auth.users.
log "waiting for auth.users (created by GoTrue)..."
i=0
until [ "$($PG -tAc "SELECT to_regclass('auth.users') IS NOT NULL")" = "t" ]; do
  i=$((i + 1))
  if [ "$i" -gt 90 ]; then
    log "ERROR: auth.users still missing — is the 'auth' service healthy?"
    exit 1
  fi
  sleep 2
done

# 3. Apply migrations in filename order, tracking applied ones.
log "ensuring schema_migrations table"
$PG >/dev/null <<SQL
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
SQL

applied_any=0
for f in /migrations/*.sql; do
  [ -e "$f" ] || continue
  version="$(basename "$f")"
  if [ "$($PG -tAc "SELECT 1 FROM public.schema_migrations WHERE version='${version}'")" = "1" ]; then
    log "skip   $version"
    continue
  fi
  log "apply  $version"
  $PG -1 -f "$f"
  $PG -c "INSERT INTO public.schema_migrations(version) VALUES ('${version}')" >/dev/null
  applied_any=1
done

[ "$applied_any" = "0" ] && log "nothing new to apply"
log "done"
