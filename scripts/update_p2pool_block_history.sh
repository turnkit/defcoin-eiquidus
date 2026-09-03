#!/usr/bin/env bash
set -euo pipefail

cd /home/dfcpool/eiquidus-test

exec /usr/bin/flock -n /tmp/defcoin-p2pool-block-history.lock \
  /usr/bin/ionice -c2 -n7 /usr/bin/nice -n 15 \
  /usr/local/bin/node scripts/build_p2pool_block_history.js \
    --batch=2000 \
    --sleep-ms=250 \
    --overlap-blocks=1000
