#!/bin/sh
# ==============================================================================
# ProAVSwitcherOS - Universal Hardware Abstraction Layer (HAL)
# Standardizes switch chip QoS, IGMP querier, EEE, Wi-Fi radio, and LED drivers
# Supported targets:
#   - Broadcom CPE (BCM63xx / BCM68xx via ethswctl & mcpd)
#   - OpenWrt (DSA, swconfig, uci, iwinfo)
#   - Linux Bridge (Raspberry Pi, x86 mini-PC multi-NIC appliances, generic Linux)
# ==============================================================================

export PATH="/bin:/sbin:/usr/bin:/usr/sbin:$PATH"

# Detect Switch Type
detect_switch_type() {
    if [ -x /bin/ethswctl ] || [ -x /usr/sbin/ethswctl ]; then
        echo "broadcom-ethswctl"
    elif [ -x /sbin/swconfig ] || [ -x /usr/sbin/swconfig ]; then
        echo "openwrt-swconfig"
    elif [ -d /sys/class/net ] && grep -q "switch" /sys/class/net/*/device/uevent 2>/dev/null; then
        echo "linux-dsa"
    else
        echo "linux-bridge-software"
    fi
}

SW_TYPE=$(detect_switch_type)

# ------------------------------------------------------------------------------
# 1. Pro-AV QoS / DSCP Strict Priority Configuration
# Dante / AES67 / PTPv2 standard requires:
#   - DSCP 46 (0x2E, EF)  -> Highest Priority Queue (PTPv2 Time Sync UDP 319)
#   - DSCP 34 (0x22, AF41)-> High Priority Queue (Dante Audio Unicast/Multicast)
#   - DSCP 26 (0x1A, AF31)-> Video / AES67 Audio
#   - DSCP 0  (0x00, BE)  -> Best Effort / General Control Traffic
# ------------------------------------------------------------------------------
hal_apply_av_qos() {
    profile="${1:-tour}"

    case "$SW_TYPE" in
        broadcom-ethswctl)
            ETHSWCTL=$(which ethswctl 2>/dev/null || echo "/bin/ethswctl")
            for port in 0 1 2 3; do
                if [ "$profile" = "tour" ]; then
                    # Strict Priority queuing
                    "$ETHSWCTL" -c qsch -p "$port" -v 0 >/dev/null 2>&1
                    # Map Dante/PTP DSCP to Top Hardware Queues
                    "$ETHSWCTL" -c cos -p "$port" -v 46 -q 3 >/dev/null 2>&1  # DSCP 46 EF -> Queue 3 (PTP)
                    "$ETHSWCTL" -c cos -p "$port" -v 34 -q 2 >/dev/null 2>&1  # DSCP 34 AF41 -> Queue 2 (Dante)
                    "$ETHSWCTL" -c cos -p "$port" -v 26 -q 2 >/dev/null 2>&1  # DSCP 26 -> Queue 2 (AES67)
                    "$ETHSWCTL" -c cos -p "$port" -v 32 -q 2 >/dev/null 2>&1  # DSCP 32 CS4 -> Queue 2 (sACN/NDI)
                    "$ETHSWCTL" -c cos -p "$port" -v 0  -q 0 >/dev/null 2>&1  # DSCP 0 BE -> Queue 0
                else
                    # Equal round-robin or default
                    "$ETHSWCTL" -c qsch -p "$port" -v 1 >/dev/null 2>&1
                    for d in 46 34 26 32 0; do
                        "$ETHSWCTL" -c cos -p "$port" -v "$d" -q 0 >/dev/null 2>&1
                    done
                fi
            done
            ;;

        openwrt-swconfig)
            # Generic swconfig QoS classification if available
            SWCMD=$(which swconfig 2>/dev/null || echo "/sbin/swconfig")
            SWNAME=$(swconfig list 2>/dev/null | awk '{print $2}' 2>/dev/null | head -n 1)
            [ -n "$SWNAME" ] && "$SWCMD" dev "$SWNAME" set qos_enable 1 >/dev/null 2>&1
            ;;

        *)
            # Universal Linux kernel TC (Traffic Control) fallback
            if [ -x /sbin/tc ] || [ -x /usr/sbin/tc ]; then
                TC=$(which tc 2>/dev/null || echo "/sbin/tc")
                for iface in br0 eth0 eth1 eth2 eth3 enp1s0 enp2s0; do
                    if [ -d "/sys/class/net/$iface" ]; then
                        "$TC" qdisc del dev "$iface" root 2>/dev/null
                        if [ "$profile" = "tour" ]; then
                            "$TC" qdisc add dev "$iface" root handle 1: prio bands 3 priomap 2 2 2 2 2 2 2 2 1 1 1 1 0 0 0 0 2>/dev/null
                        fi
                    fi
                done
            fi
            ;;
    esac

    # Ensure iptables mangle DSCP marks match if iptables is present
    if [ -x /sbin/iptables ] || [ -x /usr/sbin/iptables ]; then
        IPT=$(which iptables 2>/dev/null || echo "iptables")
        "$IPT" -t mangle -F AV_QOS 2>/dev/null || "$IPT" -t mangle -N AV_QOS 2>/dev/null
        "$IPT" -t mangle -D PREROUTING -j AV_QOS 2>/dev/null
        "$IPT" -t mangle -I PREROUTING 1 -j AV_QOS 2>/dev/null

        if [ "$profile" = "tour" ]; then
            # PTPv2 Event (UDP 319) -> DSCP 46 (EF)
            "$IPT" -t mangle -A AV_QOS -p udp --dport 319 -j DSCP --set-dscp 46 2>/dev/null
            "$IPT" -t mangle -A AV_QOS -p udp --sport 319 -j DSCP --set-dscp 46 2>/dev/null
            # Dante Audio (UDP 4321 / 14336) -> DSCP 34 (AF41)
            "$IPT" -t mangle -A AV_QOS -p udp --dport 4321 -j DSCP --set-dscp 34 2>/dev/null
            "$IPT" -t mangle -A AV_QOS -p udp --dport 14336 -j DSCP --set-dscp 34 2>/dev/null
            # sACN (UDP 5568) / Art-Net (UDP 6454) -> DSCP 32 (CS4)
            "$IPT" -t mangle -A AV_QOS -p udp --dport 5568 -j DSCP --set-dscp 32 2>/dev/null
            "$IPT" -t mangle -A AV_QOS -p udp --dport 6454 -j DSCP --set-dscp 32 2>/dev/null
        fi
    fi
}

# ------------------------------------------------------------------------------
# 2. Energy Efficient Ethernet (EEE / 802.3az) & Flow Control
# Dante and AES67 strictly require EEE to be completely disabled.
# ------------------------------------------------------------------------------
hal_set_eee_pause() {
    mode="${1:-disable}" # disable or enable

    case "$SW_TYPE" in
        broadcom-ethswctl)
            ETHSWCTL=$(which ethswctl 2>/dev/null || echo "/bin/ethswctl")
            val=0
            [ "$mode" = "enable" ] && val=1
            for p in 0 1 2 3; do
                "$ETHSWCTL" -c pause -p "$p" -v "$val" >/dev/null 2>&1
            done
            ;;

        *)
            if [ -x /usr/sbin/ethtool ] || [ -x /sbin/ethtool ]; then
                ETHTOOL=$(which ethtool 2>/dev/null || echo "ethtool")
                cmd_arg="off"
                [ "$mode" = "enable" ] && cmd_arg="on"
                for ifn in /sys/class/net/*; do
                    iface="${ifn##*/}"
                    "$ETHTOOL" --set-eee "$iface" eee "$cmd_arg" 2>/dev/null
                    "$ETHTOOL" -A "$iface" rx "$cmd_arg" tx "$cmd_arg" 2>/dev/null
                done
            fi
            ;;
    esac
}

# ------------------------------------------------------------------------------
# 3. IGMP Snooping & Multicast Querier Control
# Essential for Dante multicast audio, AES67, and video streams.
# ------------------------------------------------------------------------------
hal_set_igmp_querier() {
    state="${1:-on}" # on or off
    bridge_name="${2:-br0}"

    # Kernel bridge sysfs snooping / querier
    if [ -d "/sys/devices/virtual/net/$bridge_name/bridge" ]; then
        if [ "$state" = "on" ]; then
            echo 1 > "/sys/devices/virtual/net/$bridge_name/bridge/multicast_snooping" 2>/dev/null
            echo 1 > "/sys/devices/virtual/net/$bridge_name/bridge/multicast_querier" 2>/dev/null
        else
            echo 0 > "/sys/devices/virtual/net/$bridge_name/bridge/multicast_querier" 2>/dev/null
        fi
    fi

    # Broadcom MCPD daemon control if present
    if [ -f /var/mcpd.conf ] && pidof mcpd >/dev/null 2>&1; then
        if [ "$state" = "on" ]; then
            sed -i 's/igmp-querier[ \t]*0/igmp-querier 1/g' /var/mcpd.conf 2>/dev/null
            killall -HUP mcpd 2>/dev/null
        else
            sed -i 's/igmp-querier[ \t]*1/igmp-querier 0/g' /var/mcpd.conf 2>/dev/null
            killall -HUP mcpd 2>/dev/null
        fi
    fi

    # Direct IGMP Membership Query probe injection if enabled
    if [ "$state" = "on" ]; then
        route add -net 224.0.0.0 netmask 240.0.0.0 dev "$bridge_name" 2>/dev/null
        ping -c 1 -W 1 224.0.0.1 >/dev/null 2>&1 &
    fi
}

# ------------------------------------------------------------------------------
# 4. Wi-Fi AP Radio Control (Tour Stealth vs Wireless Bridge)
# ------------------------------------------------------------------------------
hal_set_wifi() {
    state="${1:-on}" # on or off

    # Broadcom wlctl
    if [ -x /bin/wlctl ] || [ -x /usr/sbin/wlctl ]; then
        WLCTL=$(which wlctl 2>/dev/null || echo "/bin/wlctl")
        if [ "$state" = "off" ]; then
            "$WLCTL" -i wl0 radio off 2>/dev/null
            "$WLCTL" radio off 2>/dev/null
        else
            "$WLCTL" -i wl0 radio on 2>/dev/null
            "$WLCTL" radio on 2>/dev/null
        fi
    fi

    # OpenWrt UCI / wifi command
    if [ -x /sbin/wifi ]; then
        if [ "$state" = "off" ]; then
            /sbin/wifi down 2>/dev/null
        else
            /sbin/wifi up 2>/dev/null
        fi
    fi

    # Generic Linux rfkill / ip link
    if [ -x /usr/sbin/rfkill ] || [ -x /sbin/rfkill ]; then
        RFKILL=$(which rfkill 2>/dev/null || echo "rfkill")
        if [ "$state" = "off" ]; then
            "$RFKILL" block wifi 2>/dev/null
        else
            "$RFKILL" unblock wifi 2>/dev/null
        fi
    fi
}

# ------------------------------------------------------------------------------
# 5. Front-Panel LED Control & Stage Stealth Blackout
# ------------------------------------------------------------------------------
hal_set_leds() {
    mode="${1:-normal}" # normal or blackout

    # sysfs LED control
    if [ -d /sys/class/leds ]; then
        for led in /sys/class/leds/*; do
            if [ -w "$led/brightness" ]; then
                if [ "$mode" = "blackout" ]; then
                    echo 0 > "$led/brightness" 2>/dev/null
                else
                    echo 255 > "$led/brightness" 2>/dev/null
                fi
            fi
        done
    fi
}
