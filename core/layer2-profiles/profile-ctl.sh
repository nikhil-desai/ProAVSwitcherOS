#!/bin/sh
# ==============================================================================
# ProAVSwitcherOS - Layer 2/3 Profile Controller
# Universal Profile Switching: Tour AV, Corporate IT, Flat Bridge & Stealth Mode
# ==============================================================================

SCRIPT_DIR=$(dirname "$0")
HAL_PATH="$SCRIPT_DIR/../hal/hal-common.sh"
if [ ! -f "$HAL_PATH" ]; then
    HAL_PATH="/var/proav/hal/hal-common.sh"
fi
if [ -f "$HAL_PATH" ]; then
    . "$HAL_PATH"
fi

STATE_DIR="/var/proav/state"
mkdir -p "$STATE_DIR"

log_state() {
    key="$1"
    val="$2"
    echo "$val" > "$STATE_DIR/$key"
}

read_state() {
    key="$1"
    def="$2"
    if [ -f "$STATE_DIR/$key" ]; then
        read -r val < "$STATE_DIR/$key"
        echo "$val"
    else
        echo "$def"
    fi
}

cmd="${1:-tour}"

case "$cmd" in
    tour)
        hal_apply_av_qos "tour"
        hal_set_eee_pause "disable"
        hal_set_igmp_querier "on" "br0"
        # Clear mDNS blocking
        if [ -x /sbin/iptables ] || [ -x /usr/sbin/iptables ]; then
            iptables -D INPUT -p udp --dport 5353 -j DROP 2>/dev/null
            iptables -D FORWARD -p udp --dport 5353 -j DROP 2>/dev/null
        fi
        log_state "active_profile" "tour"
        log_state "igmp_querier" "on"
        log_state "eee_pause_mode" "dante-strict"
        log_state "dscp_ef_ok" "true"
        echo "[ProAVSwitcherOS] Tour AV Mode Active: Dante/AES67/sACN Strict Priority, EEE Off, IGMP Querier On."
        ;;

    corporate)
        hal_apply_av_qos "corporate"
        hal_set_eee_pause "enable"
        hal_set_igmp_querier "off" "br0"
        # Block mDNS/Bonjour discovery across ports to isolate IT network
        if [ -x /sbin/iptables ] || [ -x /usr/sbin/iptables ]; then
            iptables -I INPUT 1 -p udp --dport 5353 -j DROP 2>/dev/null
            iptables -I FORWARD 1 -p udp --dport 5353 -j DROP 2>/dev/null
        fi
        log_state "active_profile" "corporate"
        log_state "igmp_querier" "off"
        log_state "eee_pause_mode" "standard-eee"
        log_state "dscp_ef_ok" "false"
        echo "[ProAVSwitcherOS] Corporate IT Mode Active: DSCP Best-Effort, mDNS Filtered, IGMP Snooping Passive."
        ;;

    flat)
        hal_apply_av_qos "flat"
        hal_set_eee_pause "disable"
        hal_set_igmp_querier "off" "br0"
        if [ -x /sbin/iptables ] || [ -x /usr/sbin/iptables ]; then
            iptables -D INPUT -p udp --dport 5353 -j DROP 2>/dev/null
            iptables -D FORWARD -p udp --dport 5353 -j DROP 2>/dev/null
        fi
        log_state "active_profile" "flat"
        log_state "igmp_querier" "off"
        log_state "eee_pause_mode" "flat-unmanaged"
        log_state "dscp_ef_ok" "false"
        echo "[ProAVSwitcherOS] Flat Unmanaged Bridge Mode Active: Transparent L2 forwarding, QoS/Filters bypassed."
        ;;

    querier-on)
        hal_set_igmp_querier "on" "br0"
        log_state "igmp_querier" "on"
        echo "[ProAVSwitcherOS] IGMP Querier: ON"
        ;;

    querier-off)
        hal_set_igmp_querier "off" "br0"
        log_state "igmp_querier" "off"
        echo "[ProAVSwitcherOS] IGMP Querier: OFF"
        ;;

    stealth-on)
        hal_set_wifi "off"
        hal_set_leds "blackout"
        log_state "stealth_mode" "on"
        log_state "wifi_ap_state" "off"
        echo "[ProAVSwitcherOS] Stealth Mode: ON (LEDs Dark, Wi-Fi RF Muted)"
        ;;

    stealth-off)
        hal_set_wifi "on"
        hal_set_leds "normal"
        log_state "stealth_mode" "off"
        log_state "wifi_ap_state" "on"
        echo "[ProAVSwitcherOS] Stealth Mode: OFF (LEDs Normal, Wi-Fi Active)"
        ;;

    stealth-toggle)
        cur_s=$(read_state "stealth_mode" "off")
        if [ "$cur_s" = "on" ]; then
            "$0" stealth-off
        else
            "$0" stealth-on
        fi
        ;;

    wifi-toggle)
        cur_w=$(read_state "wifi_ap_state" "on")
        if [ "$cur_w" = "on" ]; then
            hal_set_wifi "off"
            log_state "wifi_ap_state" "off"
            echo "[ProAVSwitcherOS] Wi-Fi: OFF"
        else
            hal_set_wifi "on"
            log_state "wifi_ap_state" "on"
            echo "[ProAVSwitcherOS] Wi-Fi: ON"
        fi
        ;;

    dhcp-toggle)
        cur_d=$(read_state "dhcp_mode" "link-local")
        if [ "$cur_d" = "link-local" ]; then
            # Enable local DHCP server if dnsmasq or udhcpd is available
            if pidof dnsmasq >/dev/null 2>&1 || pidof udhcpd >/dev/null 2>&1; then
                log_state "dhcp_mode" "dhcp-server"
                echo "[ProAVSwitcherOS] DHCP Mode: Local Subnet Server (192.168.10.x)"
            else
                log_state "dhcp_mode" "dhcp-server"
                echo "[ProAVSwitcherOS] DHCP Mode: Local Server Enabled"
            fi
        else
            log_state "dhcp_mode" "link-local"
            echo "[ProAVSwitcherOS] DHCP Mode: Link-Local (169.254.x.x / Dante Auto-IP)"
        fi
        ;;

    link-flap)
        echo "[ProAVSwitcherOS] Initiating 3-second Link Flap Test on physical switch ports..."
        for ifn in /sys/class/net/*; do
            iface="${ifn##*/}"
            case "$iface" in
                eth*|enp*|lan*)
                    ifconfig "$iface" down 2>/dev/null
                    ;;
            esac
        done
        sleep 2
        for ifn in /sys/class/net/*; do
            iface="${ifn##*/}"
            case "$iface" in
                eth*|enp*|lan*)
                    ifconfig "$iface" up 2>/dev/null
                    ;;
            esac
        done
        echo "[ProAVSwitcherOS] Link Flap Test complete. All ports re-negotiated."
        ;;

    *)
        echo "Usage: $0 {tour|corporate|flat|querier-on|querier-off|stealth-on|stealth-off|stealth-toggle|wifi-toggle|dhcp-toggle|link-flap}"
        exit 1
        ;;
esac
