#!/bin/sh
# ==============================================================================
# ProAVSwitcherOS - Factory Restore & Clean Uninstaller
# Restores original firmware web assets, terminates daemons, and flushes rules
# ==============================================================================

export PATH="/bin:/sbin:/usr/bin:/usr/sbin:$PATH"

echo "======================================================================"
echo " ProAVSwitcherOS Clean Uninstaller & Factory Reset"
echo "======================================================================"

# 1. Terminate running background daemons
echo "[1/5] Stopping ProAVSwitcherOS background daemons..."
killall av-auditor.sh 2>/dev/null || true
killall epi_ttcp 2>/dev/null || true

# 2. Flush and remove iptables rules
echo "[2/5] Flushing ProAVSwitcherOS iptables command chains..."
if [ -x /sbin/iptables ] || [ -x /usr/sbin/iptables ]; then
    iptables -D INPUT -j SS_CMD 2>/dev/null || true
    iptables -F SS_CMD 2>/dev/null || true
    iptables -X SS_CMD 2>/dev/null || true
    iptables -t mangle -D PREROUTING -j AV_QOS 2>/dev/null || true
    iptables -t mangle -F AV_QOS 2>/dev/null || true
    iptables -t mangle -X AV_QOS 2>/dev/null || true
fi

# 3. Clean up runtime state in RAM
echo "[3/5] Cleaning runtime state in /var/proav..."
rm -rf /var/proav /var/stageswitch /tmp/probe.sh 2>/dev/null || true

# 4. Clean persistent storage (ask or check if present)
echo "[4/5] Removing staged files from persistent flash..."
rm -rf /data/proav /data/stageswitch 2>/dev/null || true

# 5. Restore original web root if backup exists or remount
echo "[5/5] Unmounting web binds..."
umount /webs/css/pop_up.css 2>/dev/null || true
umount /webs/js/pop_up.js 2>/dev/null || true
umount /webs/css/index.css 2>/dev/null || true

echo ""
echo "Uninstallation complete. Factory router functions restored."
echo "Optional: Run 'reboot' to fully restart the factory operating system."
echo "======================================================================"
