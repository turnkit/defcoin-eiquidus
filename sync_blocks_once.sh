#!/bin/bash
set -euo pipefail
cd /home/dfcpool/eiquidus-test
exec /usr/bin/flock -n /tmp/eiquidus-dfc-sync.lock /usr/bin/nice -n 10 /usr/local/bin/node ./scripts/sync.js index update
