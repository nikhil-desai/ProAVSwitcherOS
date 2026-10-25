#!/bin/sh
# ==============================================================================
# ProAVSwitcherOS - Universal REST / CGI API Handler
# Provides JSON telemetry and profile dispatch for httpd / uhttpd / nginx
# ==============================================================================

export PATH="/bin:/sbin:/usr/bin:/usr/sbin:$PATH"

PROAV_ROOT="/var/proav"
STATE_DIR="$PROAV_ROOT/state"
TELEMETRY="$STATE_DIR/telemetry.json"
[ ! -f "$TELEMETRY" ] && TELEMETRY="/var/stageswitch/state/telemetry.json"

echo "Content-Type: application/json"
echo "Cache-Control: no-cache, no-store, must-revalidate"
echo "Access-Control-Allow-Origin: *"
echo ""

case "$QUERY_STRING" in
    *action=tour*)
        /var/proav/bin/profile-ctl.sh tour >/dev/null 2>&1 || /var/stageswitch/bin/profile-ctl.sh tour >/dev/null 2>&1
        ;;
    *action=corporate*)
        /var/proav/bin/profile-ctl.sh corporate >/dev/null 2>&1 || /var/stageswitch/bin/profile-ctl.sh corporate >/dev/null 2>&1
        ;;
    *action=flat*)
        /var/proav/bin/profile-ctl.sh flat >/dev/null 2>&1 || /var/stageswitch/bin/profile-ctl.sh flat >/dev/null 2>&1
        ;;
    *action=tone*)
        /var/proav/bin/av-auditor.sh --tone-toggle >/dev/null 2>&1 || /var/stageswitch/bin/av-auditor.sh --tone-toggle >/dev/null 2>&1
        ;;
    *action=dmx*)
        /var/proav/bin/av-auditor.sh --dmx-blast >/dev/null 2>&1 || /var/stageswitch/bin/av-auditor.sh --dmx-blast >/dev/null 2>&1
        ;;
    *action=qa*)
        /var/proav/bin/av-auditor.sh --qa-cert >/dev/null 2>&1 || /var/stageswitch/bin/av-auditor.sh --qa-cert >/dev/null 2>&1
        ;;
    *action=stealth*)
        /var/proav/bin/profile-ctl.sh stealth-toggle >/dev/null 2>&1 || /var/stageswitch/bin/profile-ctl.sh stealth-toggle >/dev/null 2>&1
        ;;
    *action=ptp*)
        /var/proav/bin/av-auditor.sh --probe-ptp >/dev/null 2>&1 || /var/stageswitch/bin/av-auditor.sh --probe-ptp >/dev/null 2>&1
        ;;
esac

if [ -f "$TELEMETRY" ]; then
    cat "$TELEMETRY"
else
    echo '{"status":"initializing","message":"ProAVSwitcherOS daemon warming up..."}'
fi
