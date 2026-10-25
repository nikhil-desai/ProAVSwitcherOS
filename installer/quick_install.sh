#!/bin/sh
# ==============================================================================
# ProAVSwitcherOS - On-Device Quick Installer
# Can be run directly on the router's shell:
# curl -sSL http://<server>/installer/quick_install.sh | sh
# ==============================================================================

set -e
export PATH="/bin:/sbin:/usr/bin:/usr/sbin:$PATH"

SERVER_IP="${1:-192.168.10.50:8080}"
PROAV_DIR="/var/proav"

echo "[ProAVSwitcherOS] Starting on-device quick install from $SERVER_IP..."
mkdir -p "$PROAV_DIR/bin" "$PROAV_DIR/hal" "$PROAV_DIR/state" "$PROAV_DIR/www"

echo "[ProAVSwitcherOS] Downloading Core HAL & Profiles..."
wget -O "$PROAV_DIR/hal/hal-common.sh" "http://$SERVER_IP/core/hal/hal-common.sh"
wget -O "$PROAV_DIR/bin/profile-ctl.sh" "http://$SERVER_IP/core/layer2-profiles/profile-ctl.sh"
wget -O "$PROAV_DIR/bin/av-auditor.sh" "http://$SERVER_IP/core/layer3-diagnostics/av-auditor.sh"
chmod +x "$PROAV_DIR/hal/hal-common.sh" "$PROAV_DIR/bin/profile-ctl.sh" "$PROAV_DIR/bin/av-auditor.sh"

echo "[ProAVSwitcherOS] Initializing Tour AV Mode..."
"$PROAV_DIR/bin/profile-ctl.sh" tour

echo "[ProAVSwitcherOS] Launching Pro-AV Auditor Daemon..."
killall av-auditor.sh 2>/dev/null || true
(trap '' HUP; "$PROAV_DIR/bin/av-auditor.sh" --daemon </dev/null >/dev/null 2>&1 &)

echo "[ProAVSwitcherOS] Done! Open the router IP in your browser to access the dashboard."
