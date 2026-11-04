#!/bin/bash
# Two homes behind Linux NAT (endpoint-independent mapping, port-restricted filtering),
# joined by a "wan" namespace that also runs a STUN server. Needs root, iproute2, nftables.
# Usage: sudo scripts/nat-lab/setup.sh [symmetric]   (symmetric: guest NAT randomizes ports)
set -e
for ns in wan rA rB hA hB; do ip netns del $ns 2>/dev/null || true; ip netns add $ns; ip -n $ns link set lo up; done
ip link add wA netns wan type veth peer name e0 netns rA
ip link add wB netns wan type veth peer name e0 netns rB
ip link add l0 netns rA type veth peer name eth0 netns hA
ip link add l0 netns rB type veth peer name eth0 netns hB
ip -n wan addr add 10.0.1.1/24 dev wA; ip -n wan addr add 10.0.2.1/24 dev wB; ip -n wan link set wA up; ip -n wan link set wB up
ip -n rA addr add 10.0.1.2/24 dev e0; ip -n rA link set e0 up; ip -n rA addr add 192.168.1.1/24 dev l0; ip -n rA link set l0 up; ip -n rA route add default via 10.0.1.1
ip -n rB addr add 10.0.2.2/24 dev e0; ip -n rB link set e0 up; ip -n rB addr add 192.168.2.1/24 dev l0; ip -n rB link set l0 up; ip -n rB route add default via 10.0.2.1
ip -n hA addr add 192.168.1.2/24 dev eth0; ip -n hA link set eth0 up; ip -n hA route add default via 192.168.1.1
ip -n hB addr add 192.168.2.2/24 dev eth0; ip -n hB link set eth0 up; ip -n hB route add default via 192.168.2.1
for ns in wan rA rB; do ip netns exec $ns sysctl -qw net.ipv4.ip_forward=1; done
for r in rA rB; do
 mode=masquerade; [ "$1" = symmetric ] && [ $r = rB ] && mode="masquerade random,fully-random"
 ip netns exec $r nft add table ip nat
 ip netns exec $r nft add chain ip nat post '{ type nat hook postrouting priority 100 ; }'
 ip netns exec $r nft add rule ip nat post oifname e0 $mode
 ip netns exec $r nft add table ip filter
 ip netns exec $r nft add chain ip filter lanout '{ type filter hook forward priority 0 ; policy drop ; }'
 ip netns exec $r nft add rule ip filter lanout ct state established,related accept
 ip netns exec $r nft add rule ip filter lanout iifname l0 accept
 # Drop unsolicited inbound before conntrack confirms it, so an early packet from the
 # peer cannot occupy the port and force a different mapping (behaves like a cone NAT).
 ip netns exec $r nft add chain ip filter pre '{ type filter hook prerouting priority -150 ; }'
 ip netns exec $r nft add rule ip filter pre iifname e0 ct state new drop
done
ip netns exec wan node "$(dirname "$0")/stun.mjs" >/dev/null 2>&1 &
for h in hA hB; do ip netns exec $h bash -c "cd '$(dirname "$0")/../..' && PORT=4173 node scripts/serve.mjs >/dev/null 2>&1 &"; done
echo "lab ready: STUN at 10.0.1.1/10.0.2.1:3478; app at http://127.0.0.1:4173 inside hA and hB"
