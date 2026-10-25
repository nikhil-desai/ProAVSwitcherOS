# AGENTS.md — AI Agent Operating Instructions

> **For AI Assistants (Claude, Gemini, Antigravity, ChatGPT, Cursor, Copilot):**
> You are acting as an autonomous Pro-AV Systems Deployment Engineer. Follow this step-by-step procedure when the user asks you to install, run, or debug **ProAVSwitcherOS** on a router or switch.

---

## 1. Operating Rules & Constraints

1. **Pure POSIX ash Compatibility:**
   - Embedded targets frequently run stripped BusyBox (e.g. BusyBox 1.17–1.35).
   - **DO NOT assume** `sed`, `awk`, `cut`, `tail`, `wc -c`, `which`, or floating-point `bc` are available.
   - Use POSIX parameter expansions (`${var##*/}`, `${var%%:*}`), `case ... in`, `while read`, and integer arithmetic `$(( ... ))`.
2. **32-Bit Signed Integer Overflow:**
   - On 32-bit MIPS/ARM routers, signed integer math overflows at `2,147,483,647`.
   - Never multiply byte counters by `80` or `1000000`. Calculate tenths of Mbps as:
     `$(( (delta_bytes / 12500) / DT ))` (since 125,000 bytes/sec = 1 Mbps).
3. **RAM tmpfs Protection:**
   - Embedded `/var` or `/tmp` can be capped at as little as 420 KB of RAM!
   - Never write large binaries, audio streams, or heavy logs into `/var`.
   - Writable flash locations: `/data` (Broadcom), `/overlay/upper` (OpenWrt), `/etc/config` (Linux).
4. **Daemon SIGHUP Immunity:**
   - Always launch background daemons with:
     `(trap '' HUP; /path/to/av-auditor.sh --daemon </dev/null >/dev/null 2>&1 &)`
   - Without `trap '' HUP`, the daemon will be killed as soon as the Telnet/SSH session disconnects.
5. **Broadcom CMS Daemon Deadlock Guard:**
   - On Broadcom BCM63xx CPE routers, **NEVER** invoke `smd`, `mcpd`, or `smartled` directly from shell scripts. They will deadlock the CMS messaging pipe.
   - Strictly use kernel utilities: `ethswctl`, `wlctl`, `brctl`, `iptables`, and `/sys`.

---

## 2. Step-by-Step Deployment Procedure

### Phase 1: Target Discovery
1. Identify the router's IP address (default gateway, e.g. `192.168.1.1`, `192.168.0.1`, `192.168.10.1`).
2. Test network connectivity:
   ```bash
   ping -c 1 <ROUTER_IP>
   ```
3. Probe open ports:
   ```bash
   nc -z -w 1 <ROUTER_IP> 22 23 80 443
   ```
4. Authenticate:
   - **Telnet (Port 23):** Standard default credentials (`admin:admin`, `admin:CenturyL1nk`, `root:root`). If logged into a CLI menu (`>`), send `sh` to drop to BusyBox `ash`.
   - **SSH (Port 22):** Connect via `ssh admin@<ROUTER_IP>` or `ssh root@<ROUTER_IP>`.

---

### Phase 2: Hardware Probe & Architecture Audit
1. Host the ProAVSwitcherOS repository on the local machine:
   ```bash
   python3 -m http.server 8080 --directory /path/to/ProAVSwitcherOS
   ```
2. Execute the hardware probe on the target router:
   ```bash
   wget -O /tmp/probe.sh http://<LOCAL_IP>:8080/installer/probe_target.sh
   chmod +x /tmp/probe.sh
   /tmp/probe.sh
   ```
3. Review the returned JSON:
   - Identify platform family (`broadcom-cpe`, `openwrt`, `generic-linux`, `raspberry-pi`).
   - Identify persistent partition (`persist_dir`) and free flash space (`persist_free_kb`).
   - Identify web server (`micro_httpd`, `uhttpd`, `httpd`, `nginx`).

---

### Phase 3: Core Staging & Web UI Binding
1. Prepare directories on the target:
   ```bash
   mkdir -p /var/proav/bin /var/proav/hal /var/proav/state /var/proav/www
   ```
2. Download universal core components:
   ```bash
   wget -O /var/proav/hal/hal-common.sh http://<LOCAL_IP>:8080/core/hal/hal-common.sh
   wget -O /var/proav/bin/profile-ctl.sh http://<LOCAL_IP>:8080/core/layer2-profiles/profile-ctl.sh
   wget -O /var/proav/bin/av-auditor.sh http://<LOCAL_IP>:8080/core/layer3-diagnostics/av-auditor.sh
   chmod +x /var/proav/hal/hal-common.sh /var/proav/bin/profile-ctl.sh /var/proav/bin/av-auditor.sh
   ```
3. Copy to persistent flash (if writable flash exists, e.g. `/data`):
   ```bash
   mkdir -p /data/proav/bin /data/proav/hal
   cp -r /var/proav/* /data/proav/ 2>/dev/null || true
   ```
4. Bind Web Dashboard:
   - If web server is Broadcom `micro_httpd` (rootfs `/webs`):
     ```bash
     mount -o remount,rw /
     wget -O /webs/index.html http://<LOCAL_IP>:8080/core/layer4-dashboard/www/index.html
     wget -O /webs/js/pop_up.js http://<LOCAL_IP>:8080/core/layer4-dashboard/www/app.js
     mount -o remount,ro /
     ```
   - If web server is OpenWrt `uhttpd` (rootfs `/www`):
     ```bash
     cp /var/proav/www/index.html /www/index.html
     cp /var/proav/www/app.js /www/app.js
     ```

---

### Phase 4: Launch Daemon & Apply Tour AV Profile
1. Terminate old instances:
   ```bash
   killall av-auditor.sh 2>/dev/null || true
   ```
2. Start the telemetry auditor daemon in the background with SIGHUP isolation:
   ```bash
   (trap '' HUP; /var/proav/bin/av-auditor.sh --daemon </dev/null >/dev/null 2>&1 &)
   ```
3. Activate Tour AV Mode:
   ```bash
   /var/proav/bin/profile-ctl.sh tour
   ```
4. Confirm process is alive:
   ```bash
   ps | grep auditor
   ```

---

### Phase 5: Verification Checklist
Verify each item before concluding deployment:
- [ ] **HTTP Access:** Curling `http://<ROUTER_IP>/` returns the StageSwitch/ProAVSwitcherOS HTML dashboard.
- [ ] **Telemetry Endpoint:** Curling `http://<ROUTER_IP>/css/pop_up.css` (or `/telemetry.json`) returns valid JSON with `ptp_status`, `ports`, `tone_status`, `dmx_blast_status`, and `qa_cert_summary`.
- [ ] **Dante / AES67 QoS Verified:** `dscp_ef_verified: true` in telemetry.
- [ ] **IGMP Querier Active:** `igmp_querier: "on"` in telemetry.
- [ ] **PTPv2 Leader Detected:** PTP scope shows standby internal leader or connected network grandmaster.
- [ ] **Port Bandwidth Live:** `ports[].rx_mbps` and `tx_mbps` update smoothly.

---

## 3. Automated One-Shot Command for Local Deployments

If you are running on the user's host machine with Python 3:
```bash
python3 installer/deploy.py --host <ROUTER_IP> --proto telnet --user admin --password <PASSWORD>
```
This script handles the probe, HTTP staging, payload upload, daemon launch, and verification automatically.
