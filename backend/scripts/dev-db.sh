#!/usr/bin/env bash
# Idempotent rootless local PostgreSQL for Sahayak development.
# Uses the PGDG-installed server binaries. Docker alternative: docker-compose.yml.
set -euo pipefail

PG_BIN="/usr/pgsql-18/bin"
PORT="${SAHAYAK_PGPORT:-5433}"
DATA_DIR="$(cd "$(dirname "$0")" && realpath "../.pgdata")"
SOCKET_DIR="${DATA_DIR}/socket"
LOG_FILE="${DATA_DIR}/postgres.log"

if ! command -v "${PG_BIN}/initdb" >/dev/null 2>&1; then
  echo "PostgreSQL 18 server binaries not found at ${PG_BIN}." >&2
  echo "Install postgresql18-server or use docker-compose.yml." >&2
  exit 1
fi

if [ ! -f "${DATA_DIR}/PG_VERSION" ]; then
  echo "Initializing data directory at ${DATA_DIR} ..."
  "${PG_BIN}/initdb" -D "${DATA_DIR}" -U sahayak \
    --auth-host=trust --auth-local=trust --no-instructions >/dev/null
fi

if "${PG_BIN}/pg_ctl" -D "${DATA_DIR}" status >/dev/null 2>&1; then
  echo "PostgreSQL already running on ${DATA_DIR}"
else
  mkdir -p "${SOCKET_DIR}"
  echo "Starting PostgreSQL on port ${PORT} ..."
  "${PG_BIN}/pg_ctl" -D "${DATA_DIR}" -l "${LOG_FILE}" \
    -o "-p ${PORT} -k ${SOCKET_DIR}" start
fi

PSQL=( "${PG_BIN}/psql" -h "${SOCKET_DIR}" -p "${PORT}" -U sahayak -d postgres -v ON_ERROR_STOP=1 -qAt )

for db in sahayak sahayak_test; do
  if ! "${PSQL[@]}" -c "SELECT 1 FROM pg_database WHERE datname = '${db}'" | grep -q 1; then
    echo "Creating database '${db}' ..."
    "${PG_BIN}/createdb" -h "${SOCKET_DIR}" -p "${PORT}" -U sahayak "${db}"
  fi
done

echo "Ready. URL: postgres://sahayak@localhost:${PORT}/sahayak"
echo "Socket: ${SOCKET_DIR}"
