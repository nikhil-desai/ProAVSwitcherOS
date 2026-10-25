# ProAVSwitcherOS

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Protocols: Dante | AES67 | NDI | sACN | Art-Net | PTPv2](https://img.shields.io/badge/Protocols-Dante%20%7C%20AES67%20%7C%20NDI%20%7C%20sACN%20%7C%20PTPv2-green.svg)]()
[![Platform: Universal POSIX / MIPS / ARM / x86](https://img.shields.io/badge/Platform-Universal%20Linux%20%2F%20BusyBox-orange.svg)]()
[![AI-Native: Agent-Ready](https://img.shields.io/badge/AI--Native-AGENTS.md%20Ready-purple.svg)](AGENTS.md)

**ProAVSwitcherOS** is a universal, open-source firmware overlay that converts standard consumer, commercial, and ISP routers into dedicated, tour-grade Layer 2/3 Audio/Video network switchers.

Engineered specifically for live event production, broadcast flypacks, touring racks, and AV integration, ProAVSwitcherOS provides hardware-accelerated QoS, IGMP querier management, real-time protocol telemetry, and testing tools without requiring expensive enterprise managed switches.

---

## ⚡ The AI-First Installation Workflow

> **The primary way to use this repo is to hand it to your AI coding assistant.**

If you use **Antigravity, Cursor, Claude Code, ChatGPT, Gemini, or GitHub Copilot**, simply clone this repository and give your AI the prompt from [AI_INSTALL_PROMPT.md](AI_INSTALL_PROMPT.md):

```markdown
"I have downloaded the ProAVSwitcherOS repository. Please read AGENTS.md
and install ProAVSwitcherOS on my router at 192.168.1.1 (username: admin, password: password)."
```

Your AI assistant will read [AGENTS.md](AGENTS.md), scan your router's architecture (MIPS, ARM, or x86), stage the universal HAL, bind the web dashboard, configure Dante/AES67 strict priority QoS, and hand you the live dashboard link.

---

## 🚀 Key Pro-AV Features

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             ProAVSwitcherOS Dashboard                            │
├─────────────────────────┬──────────────────────────┬─────────────────────────────┤
│ 1. PTPv2 Jitter Scope   │ 2. Lighting Tachometer   │ 3. Real-Time Port Gauges    │
│  • PTPv2 UDP 319/320    │  • Art-Net/sACN FPS      │  • Live RX/TX Mbps per port │
│  • Leader detection     │  • 1-Click DMX Blaster   │  • >80Mbps saturation badge │
├─────────────────────────┼──────────────────────────┼─────────────────────────────┤
│ 4. Virtual AES67 Tone   │ 5. Pre-Show QA Audit     │ 6. Show Lockout & Stealth   │
│  • 1kHz sine RTP stream │  • Automated QA sanity   │  • UI profile button lock   │
│  • Multicast 239.69.1.1 │  • Printable certificate │  • LED blackout + RF mute   │
└─────────────────────────┴──────────────────────────┴─────────────────────────────┘
```

### 1. Hardware-Enforced Pro-AV QoS & EEE Defeat
* **Strict Priority Queuing:** Direct hardware switch register mapping (`ethswctl` on Broadcom, `swconfig` on OpenWrt, `tc` on Linux). Prioritizes **DSCP 46 (Expedited Forwarding)** and **DSCP 34 (AF41)** into top hardware queues so PTP clock sync never suffers jitter during heavy video or file transfers.
* **Energy Efficient Ethernet (EEE / 802.3az) Defeated:** Disables PHY low-power sleep modes per-port to prevent audio packet delay variation and Dante dropouts.

### 2. PTPv2 Grandmaster Clock Jitter & Leader Scope
* Intercepts UDP 319 / 320 packets on the bridge.
* Automatically identifies the active PTP Grandmaster clock (e.g. `192.168.10.50 (MacBook Pro Grandmaster)`).
* Measures inter-arrival packet timing jitter in microseconds (`±12µs Jitter · 8Hz Dante Sync`).

### 3. Lighting Universe Tachometer & 1-Click DMX Blaster
* **FPS Tachometer:** Calculates live frame rates for sACN (E1.31 / UDP 5568) and Art-Net (UDP 6454).
* **DMX Blaster:** Click **"💡 Pulse DMX Univ 1 (Full White)"** to blast a 44-frame burst across all 512 DMX channels at 100% intensity to immediately test fixtures and stage nodes without a lighting console.

### 4. Real-Time Per-Port Throughput & Saturation Alarms
* Integer-based tenths-of-a-megabit engine calculates per-port RX and TX throughput live from `/proc/net/dev`.
* Overflow-safe against 32-bit signed integer limits on embedded MIPS/ARM CPUs.
* Triggers a pulsating **`⚠️ SATURATION ALERT (>80% Cap)`** badge when port bandwidth approaches physical link limits.

### 5. Virtual AES67 / RTP 1kHz Test Tone Generator
* Generates an uncompressed multicast RTP audio stream directly from the router kernel to `239.69.1.1:5004` (48 kHz / 16-bit L16).
* Send test audio down the snake to your digital mixer or stagebox with a single click.

### 6. Automated Pre-Show QA Sanity Check & Printable Certificate
* Audits physical link integrity, verifies switch CRC error counters (`0 CRC Errors`), checks DSCP EF mapping, and validates the IGMP Querier.
* Generates a signed compliance certificate (`CERT-PROAV-xxxx`) with a **"🖨️ Print Certificate"** button ready for tour production files.

### 7. Stage Stealth Mode & Show Lockout
* **Stealth Mode:** Instantly blackouts physical front-panel LEDs and mutes 2.4GHz Wi-Fi radio transmission (`wlctl radio off`) so no stray RF or lights leak into dark stage wings.
* **Show Lockout:** One-click lockout prevents accidental profile changes in the browser during live shows.

---

## 🛠️ Hardware Compatibility

| Target Family | Examples | Hardware Switch Engine | Notes |
| :--- | :--- | :--- | :--- |
| **Broadcom CPE** | Actiontec / CenturyLink C1000A, C2000A, C3000A, Sagemcom, Netgear DGN | Broadcom `ethswctl`, `mcpd`, `wlctl` | Fully tested. Uses zero-CGI port-knock control channel. |
| **OpenWrt Routers** | GL.iNet, TP-Link, Netgear, Linksys, Xiaomi, Ubiquiti | Linux DSA or `swconfig`, `uhttpd` | Universal OpenWrt support. Installs in volatile `/tmp` or persistent overlay. |
| **Linux SBC / Mini-PC** | Raspberry Pi 4/5, Banana Pi, Intel N100 multi-NIC appliances | Linux bridge-utils (`brctl`), `tc`, `ip link` | Multi-gigabit routing, high-capacity Dante & NDI video streams. |

---

## 📦 Repository Structure

```
ProAVSwitcherOS/
├── README.md                      # Project documentation and quickstart
├── AGENTS.md                      # AI assistant operating manual
├── AI_INSTALL_PROMPT.md           # Copy-paste prompt for your AI assistant
├── LICENSE                        # GNU General Public License v3
├── installer/
│   ├── deploy.py                  # Universal cross-platform deployment script (Telnet/SSH)
│   ├── probe_target.sh            # Target hardware discovery engine (outputs JSON)
│   └── quick_install.sh           # On-device one-liner install script
├── core/
│   ├── hal/
│   │   └── hal-common.sh          # Universal Hardware Abstraction Layer (Broadcom, OpenWrt, Linux)
│   ├── layer2-profiles/
│   │   └── profile-ctl.sh         # Layer 2/3 Profile switcher (Tour, Corporate, Flat, Stealth)
│   ├── layer3-diagnostics/
│   │   └── av-auditor.sh          # Pro-AV daemon, PTP analyzer, DMX blaster, Tone generator
│   └── layer4-dashboard/
│       ├── osc_companion_server.py# Standalone companion server (OSC/REST bridge)
│       └── www/
│           ├── index.html         # Responsive Pro-AV Switcher Dashboard
│           ├── app.js             # Modern dashboard JavaScript
│           └── cgi-bin/api.cgi    # Optional REST CGI endpoint
├── profiles/
│   ├── broadcom-cpe/              # Broadcom CPE profile notes
│   ├── openwrt/                   # OpenWrt profile notes
│   └── linux-sbc/                 # Linux SBC & x86 multi-NIC profile notes
└── docs/
    ├── ARCHITECTURE.md            # Technical specifications (Dante/AES67/PTP)
    └── TROUBLESHOOTING.md         # Hardware traps, BusyBox ash quirks & fixes
```

---

## 💻 Manual Deployment (Without AI)

If you prefer deploying manually:

### Option 1: Automated Python Deployer (From Laptop)
Run the deployer from your laptop while connected to the router via Ethernet or Wi-Fi:
```bash
python3 installer/deploy.py --host 192.168.1.1 --proto telnet --user admin --password password
```

### Option 2: Direct Target Setup
1. Telnet or SSH into the router:
   ```bash
   telnet 192.168.1.1
   ```
2. Start the local file server on your laptop (`python3 -m http.server 8080`).
3. Run the installer:
   ```bash
   wget -O - http://<LAPTOP_IP>:8080/installer/quick_install.sh | sh
   ```
4. Open `http://<ROUTER_IP>/` in any browser to access the live dashboard.

---

## 📜 License
This project is licensed under the **GNU General Public License v3.0 (GPLv3)**. See [LICENSE](LICENSE) for details.
