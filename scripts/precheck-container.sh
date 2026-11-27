#!/bin/sh
# Rough latency report in a 4 CPU / 2 GB container. This is not the PAN-300 3 second gate.
set -eu
cd "$(dirname "$0")/.."

if [ "${RADIO_DAYS_PRECHECK_CHILD:-}" != "1" ] && command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  exec docker run --rm \
    --cpus=4 \
    --memory=2g \
    --memory-swap=2g \
    -v "$PWD":/work \
    -w /work \
    -e RADIO_DAYS_PRECHECK_CHILD=1 \
    node:24-bookworm-slim \
    node --experimental-strip-types src/precheck-cli.ts
fi

if [ "${RADIO_DAYS_PRECHECK_CHILD:-}" != "1" ] && command -v systemd-run >/dev/null 2>&1; then
  if systemd-run --quiet --scope \
    -p MemoryMax=2G \
    -p MemorySwapMax=0 \
    -p CPUQuota=400% \
    env RADIO_DAYS_PRECHECK_CHILD=1 \
    node --experimental-strip-types src/precheck-cli.ts
  then
    exit 0
  fi
fi

echo "Förhandskollen körs utan gräns på 4 kärnor och 2 GB." >&2
exec node --experimental-strip-types src/precheck-cli.ts
