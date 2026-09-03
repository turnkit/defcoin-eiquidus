#!/usr/bin/env bash
set -euo pipefail

cd /home/dfcpool/eiquidus-test

exec /usr/bin/flock -n /tmp/defcoin-defcoinstats-history.lock \
  /usr/bin/ionice -c2 -n7 /usr/bin/nice -n 15 \
  /usr/local/bin/node scripts/import_defcoinstats_history.js
