#!/bin/bash
# sudo DELAY=45 PLAYWRIGHT_MODULE=… scripts/nat-lab/run.sh   (after setup.sh)
D="$(dirname "$0")"; X=${LAB_DIR:-/tmp/tongxi-nat-lab}; rm -rf "$X"; mkdir -p "$X"
for r in rA rB; do ip netns exec $r conntrack -F >/dev/null 2>&1; done
ip netns exec hB env LAB_DIR="$X" node "$D/manual.mjs" guest > "$X/guest.log" 2>&1 &
ip netns exec hA env LAB_DIR="$X" node "$D/manual.mjs" host > "$X/host.log" 2>&1
wait; cat "$X/host.log" "$X/guest.log"
