#!/bin/sh
# ==============================================================================
# ProAVSwitcherOS - Universal Hardware Probe Engine
# Evaluates target router/switch hardware, firmware, network stack, and storage
# Outputs structured JSON to stdout for automated installer / AI agents.
# Compatible with pure POSIX ash / BusyBox 1.0+ / Debian / OpenWrt / Linux 2.4-6.x
# ==============================================================================

# Ensure standard path
export PATH="/bin:/sbin:/usr/bin:/usr/sbin:$PATH"

# Architecture & Kernel
ARCH=$(uname -m 2>/dev/null || echo "unknown")
KERNEL=$(uname -r 2>/dev/null || echo "unknown")
HOSTNAME=$(hostname 2>/dev/null || echo "target-router")

# Endianness detection
ENDIAN="unknown"
if [ -f /bin/sh ]; then
    case $(od -A n -N 1 -j 5 -t x1 /bin/sh 2>/dev/null | tr -d ' ') in
        01) ENDIAN="little" ;;
        02) ENDIAN="big" ;;
    esac
fi

# Detect platform family
PLATFORM="generic-linux"
if [ -f /etc/openwrt_version ] || [ -f /etc/openwrt_release ]; then
    PLATFORM="openwrt"
elif [ -x /bin/ethswctl ] || [ -x /usr/sbin/ethswctl ]; then
    PLATFORM="broadcom-cpe"
elif [ -x /sbin/swconfig ] || [ -x /usr/sbin/swconfig ]; then
    PLATFORM="swconfig-linux"
elif [ -d /sys/class/net ] && grep -q "Raspberry Pi" /proc/cpuinfo 2>/dev/null; then
    PLATFORM="raspberry-pi"
fi

# Memory calculation (KB)
MEM_TOTAL=0
MEM_FREE=0
if [ -f /proc/meminfo ]; then
    while read -r k v _; do
        case "$k" in
            MemTotal:) MEM_TOTAL="${v:-0}" ;;
            MemFree:)  MEM_FREE="${v:-0}" ;;
        esac
    done < /proc/meminfo
fi

# Storage / Writable partition detection
BEST_PERSIST_DIR=""
MAX_FREE_KB=0

check_writable() {
    cand="$1"
    if [ -d "$cand" ]; then
        if touch "$cand/.probe_test" 2>/dev/null; then
            rm -f "$cand/.probe_test" 2>/dev/null
            free_kb=$(df -k "$cand" 2>/dev/null | tail -n 1 2>/dev/null | awk '{print $4}' 2>/dev/null)
            if [ -z "$free_kb" ]; then
                # Fallback without awk/tail for stripped busybox
                while read -r _ _ _ f_k _; do
                    free_kb="$f_k"
                done <<EOF
$(df -k "$cand" 2>/dev/null)
EOF
            fi
            free_kb="${free_kb:-0}"
            if [ "$free_kb" -gt "$MAX_FREE_KB" ] 2>/dev/null; then
                MAX_FREE_KB="$free_kb"
                BEST_PERSIST_DIR="$cand"
            fi
        fi
    fi
}

for dir in /data /overlay /etc/config /etc /opt /mnt /var /tmp; do
    check_writable "$dir"
done

# Switch & Networking Capabilities
HAS_ETHSWCTL="false"
HAS_SWCONFIG="false"
HAS_BRCTL="false"
HAS_IPROUTE="false"
HAS_IPTABLES="false"
HAS_TC="false"
HAS_TCPDUMP="false"
HAS_EPI_TTCP="false"

[ -x /bin/ethswctl ] || [ -x /usr/sbin/ethswctl ] && HAS_ETHSWCTL="true"
[ -x /sbin/swconfig ] || [ -x /usr/sbin/swconfig ] && HAS_SWCONFIG="true"
[ -x /usr/sbin/brctl ] || [ -x /sbin/brctl ] || [ -x /bin/brctl ] && HAS_BRCTL="true"
[ -x /sbin/ip ] || [ -x /usr/sbin/ip ] || [ -x /bin/ip ] && HAS_IPROUTE="true"
[ -x /usr/sbin/iptables ] || [ -x /sbin/iptables ] || [ -x /bin/iptables ] && HAS_IPTABLES="true"
[ -x /sbin/tc ] || [ -x /usr/sbin/tc ] && HAS_TC="true"
[ -x /usr/sbin/tcpdump ] || [ -x /bin/tcpdump ] && HAS_TCPDUMP="true"
[ -x /bin/epi_ttcp ] || [ -x /usr/bin/epi_ttcp ] && HAS_EPI_TTCP="true"

# Web Server Detection
WEB_SERVER="none"
WEB_ROOT=""
if pidof micro_httpd >/dev/null 2>&1; then
    WEB_SERVER="micro_httpd"
    WEB_ROOT="/webs"
elif pidof uhttpd >/dev/null 2>&1; then
    WEB_SERVER="uhttpd"
    WEB_ROOT="/www"
elif pidof httpd >/dev/null 2>&1; then
    WEB_SERVER="httpd"
    [ -d /www ] && WEB_ROOT="/www"
    [ -d /webs ] && WEB_ROOT="/webs"
    [ -d /var/www ] && WEB_ROOT="/var/www"
    [ -d /usr/share/nginx/html ] && WEB_ROOT="/usr/share/nginx/html"
elif pidof nginx >/dev/null 2>&1; then
    WEB_SERVER="nginx"
    WEB_ROOT="/var/www/html"
fi

# Physical Interface Discovery
IFACES=""
for ifn in /sys/class/net/*; do
    if [ -d "$ifn" ]; then
        bname="${ifn##*/}"
        case "$bname" in
            lo|dummy*|sit*|gre*|dsl*|ptm*|atm*|wl*|wlan*) ;;
            *)
                if [ -z "$IFACES" ]; then
                    IFACES="\"$bname\""
                else
                    IFACES="$IFACES, \"$bname\""
                fi
                ;;
        esac
    fi
done

# Output JSON report
cat <<EOF
{
  "hostname": "$HOSTNAME",
  "arch": "$ARCH",
  "endian": "$ENDIAN",
  "kernel": "$KERNEL",
  "platform_family": "$PLATFORM",
  "mem_total_kb": $MEM_TOTAL,
  "mem_free_kb": $MEM_FREE,
  "persist_dir": "${BEST_PERSIST_DIR:-/tmp}",
  "persist_free_kb": $MAX_FREE_KB,
  "web_server": "$WEB_SERVER",
  "web_root": "${WEB_ROOT:-/www}",
  "caps": {
    "ethswctl": $HAS_ETHSWCTL,
    "swconfig": $HAS_SWCONFIG,
    "brctl": $HAS_BRCTL,
    "iproute2": $HAS_IPROUTE,
    "iptables": $HAS_IPTABLES,
    "tc": $HAS_TC,
    "tcpdump": $HAS_TCPDUMP,
    "epi_ttcp": $HAS_EPI_TTCP
  },
  "interfaces": [$IFACES]
}
EOF
