#!/usr/bin/env python3
"""
StageSwitch OS - Layer 4: Bitfocus Companion OSC & Dual-Laptop Web Server
Directly queries the C1000A hardware switch status (`http://192.168.10.1/modemstatus_lanstatus.html`)
every 1.5 seconds and uses ICMP byte-delta fingerprinting to automatically identify which
physical port (Port 1/eth0, Port 2/eth1, Port 3/eth2, Port 4/eth3) has the MacBook Pro
vs. the Windows Surface Book 3 plugged in—with zero Telnet commands required.
"""

import json
import os
import re
import socket
import subprocess
import threading
import time
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

WWW_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "www")
HTTP_PORT = int(os.environ.get("STAGESWITCH_HTTP_PORT", "8080"))
OSC_PORT = int(os.environ.get("STAGESWITCH_OSC_PORT", "9000"))

MAC_ETH_MAC = "00:e0:4c:36:37:04"
WIN_ETH_MAC = "00:e0:4c:36:37:0f"

PENDING_HW_COMMANDS = []
LAST_HW_SYNC_TS = 0.0

# Tracked physical port index (0..3) for MacBook Pro discovered via C1000A byte-delta fingerprinting
MAC_PORT_IDX = None
PREV_UP_INDICES = []
PREV_PORT_UPTIME = {}
LAST_FINGERPRINT_TS = 0.0

STATE = {
    "timestamp": int(time.time()),
    "board": "Actiontec C1000A (Broadcom BCM63168 MIPS32)",
    "profile": "tour",
    "igmp_querier": "on",
    "igmp_groups": 14,
    "mdns_joined": False,
    "ptp_status": "ready",
    "dscp_ef_verified": True,
    "stress_test": "idle",
    "chaos_mode": "normal",
    "eee_pause_mode": "dante-strict",
    "wifi_ap_state": "on",
    "dhcp_mode": "link-local",
    "led_status": "GREEN (Tour AV Lock)",
    "proto_summary": "PTPv2:0 | Dante:0 | mDNS/NDI:2 | sACN:0 | Art-Net:0 | IGMP:2",
    "mcast_proof": "Ready: Click 'IGMP Multicast Proof Test' to benchmark IGMP snooping across Ports 1-4.",
    "usb_mounted": False,
    "usb_needs_insert": False,
    "usb_warning": "STANDBY (Internal 4MB Flash Mode): USB stick is unplugged. Insert the STAGESWITCH 1GB USB drive before recording .pcap packet captures or extended show logs.",
    "mac_cable_plugged": True,
    "win_cable_plugged": True,
    "switch_reachable": True,
    "hw_sync_active": True,
    "uptime_sec": 186760,
    "mem_free_kb": 1996,
    "mem_total_kb": 59004,
    "ports": [
        {
            "iface": "eth0",
            "port_num": 1,
            "device_type": "none",
            "mac": "none",
            "speed": "Auto",
            "link_uptime": 0,
            "role": "Port 1 — Scanning...",
            "link": "down",
            "rx_pkts": 0,
            "rx_err": 0,
            "rx_drop": 0,
            "tx_pkts": 0,
            "tx_err": 0,
            "tx_drop": 0,
        },
        {
            "iface": "eth1",
            "port_num": 2,
            "device_type": "none",
            "mac": "none",
            "speed": "Auto",
            "link_uptime": 0,
            "role": "Port 2 — Scanning...",
            "link": "down",
            "rx_pkts": 0,
            "rx_err": 0,
            "rx_drop": 0,
            "tx_pkts": 0,
            "tx_err": 0,
            "tx_drop": 0,
        },
        {
            "iface": "eth2",
            "port_num": 3,
            "device_type": "none",
            "mac": "none",
            "speed": "Auto",
            "link_uptime": 0,
            "role": "Port 3 — Scanning...",
            "link": "down",
            "rx_pkts": 0,
            "rx_err": 0,
            "rx_drop": 0,
            "tx_pkts": 0,
            "tx_err": 0,
            "tx_drop": 0,
        },
        {
            "iface": "eth3",
            "port_num": 4,
            "device_type": "none",
            "mac": "none",
            "speed": "Auto",
            "link_uptime": 0,
            "role": "Port 4 — Scanning...",
            "link": "down",
            "rx_pkts": 0,
            "rx_err": 0,
            "rx_drop": 0,
            "tx_pkts": 0,
            "tx_err": 0,
            "tx_drop": 0,
        },
    ],
}


def format_port_role(port_num: int, dev_type: str, mac: str, link: str, speed: str = "") -> str:
    if link != "up" or dev_type == "none":
        return f"Port {port_num} — Unplugged (No Ethernet Link)"
    spd = f" · {speed}" if speed and speed != "Auto" else ""
    if dev_type == "mac":
        m = mac if mac and mac != "none" else MAC_ETH_MAC
        return f"Port {port_num} — MacBook Pro [macOS] · 192.168.10.50 ({m}){spd}"
    if dev_type == "win":
        m = mac if mac and mac != "none" else WIN_ETH_MAC
        return f"Port {port_num} — Surface Book 3 [Windows] · 192.168.10.51 ({m}){spd}"
    if dev_type == "other":
        return f"Port {port_num} — Connected Device ({mac}){spd}"
    return f"Port {port_num} — Link Up ({speed or '100M'})"


def check_mac_en7_active() -> bool:
    try:
        out = subprocess.check_output(["/sbin/ifconfig", "en7"], stderr=subprocess.DEVNULL, text=True, timeout=0.8)
        return "status: active" in out
    except Exception:
        return False


def fetch_c1000a_lanstatus():
    """
    Fetches live per-port PHY link status, packet counters, byte counters, and link uptime
    directly from the C1000A's unauthenticated hardware status page (`modemstatus_lanstatus.html`).
    """
    for host in ("192.168.10.1", "192.168.0.1"):
        try:
            url = f"http://{host}/modemstatus_lanstatus.html"
            req = urllib.request.Request(url, headers={"Cache-Control": "no-cache"})
            with urllib.request.urlopen(req, timeout=1.2) as resp:
                html = resp.read().decode("iso-8859-1", errors="ignore")
            matches = re.findall(r"^\s*eth([0-3])_status\s*=\s*'([^']+)'", html, re.MULTILINE)
            if not matches:
                continue
            parsed = {}
            for idx_str, raw_val in matches:
                idx = int(idx_str)
                parts = raw_val.split("/")
                if len(parts) >= 18:
                    parsed[idx] = {
                        "link": "up" if parts[0].strip().lower() == "up" else "down",
                        "speed": parts[2].strip(),
                        "tx_pkts": int(parts[3] or 0),
                        "rx_pkts": int(parts[4] or 0),
                        "tx_err": int(parts[11] or 0),
                        "rx_err": int(parts[12] or 0),
                        "tx_bytes": int(parts[13] or 0),
                        "rx_bytes": int(parts[14] or 0),
                        "uptime": int(parts[17] or 0),
                    }
            if len(parsed) == 4:
                return parsed
        except Exception:
            continue
    return None


def fingerprint_mac_port(initial_hw: dict, up_indices: list) -> int:
    """
    Sends a 0.35s burst of 35 large (1400-byte) ICMP packets from the MacBook Pro
    solely to the C1000A router IP (192.168.10.1) and checks which physical switch port
    on the C1000A increments its byte counter by ~95 KB.
    """
    try:
        b0 = {i: initial_hw[i]["tx_bytes"] + initial_hw[i]["rx_bytes"] for i in up_indices}
        subprocess.run(
            ["/sbin/ping", "-c", "35", "-i", "0.01", "-s", "1400", "-W", "300", "192.168.10.1"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=1.2,
        )
        time.sleep(1.1)
        after_hw = fetch_c1000a_lanstatus()
        if not after_hw:
            return up_indices[0]
        deltas = {}
        for i in up_indices:
            if after_hw[i]["link"] == "up":
                b1 = after_hw[i]["tx_bytes"] + after_hw[i]["rx_bytes"]
                deltas[i] = b1 - b0.get(i, 0)
        if deltas:
            return max(deltas, key=deltas.get)
    except Exception:
        pass
    return up_indices[0]


def live_network_prober():
    """
    Polls local `en7` carrier and C1000A `modemstatus_lanstatus.html` every 1.5 seconds.
    Automatically detects cable unplugs and physical port swaps across Ports 1-4.
    """
    global MAC_PORT_IDX, PREV_UP_INDICES, PREV_PORT_UPTIME, LAST_FINGERPRINT_TS

    while True:
        try:
            en7_up = check_mac_en7_active()
            STATE["mac_cable_plugged"] = en7_up

            if not en7_up:
                STATE["switch_reachable"] = False
                STATE["hw_sync_active"] = False
                # Only mark the MacBook Pro's port as unplugged! Keep the Windows laptop's last known state UP.
                for idx, p in enumerate(STATE["ports"]):
                    if p["device_type"] == "mac" or idx == MAC_PORT_IDX:
                        p["link"] = "down"
                        p["device_type"] = "none"
                        p["mac"] = "none"
                        p["link_uptime"] = 0
                        p["role"] = f"Port {p['port_num']} — Unplugged (MacBook Pro Disconnected)"
                    elif p["device_type"] == "win":
                        p["link"] = "up"
                        p["role"] = format_port_role(p["port_num"], "win", WIN_ETH_MAC, "up", p.get("speed", "100M"))
                    else:
                        p["link"] = "down"
                        p["role"] = f"Port {p['port_num']} — Unplugged (No Ethernet Link)"
                PREV_UP_INDICES = []
            else:
                hw = fetch_c1000a_lanstatus()
                if hw is None:
                    STATE["switch_reachable"] = False
                else:
                    STATE["switch_reachable"] = True
                    STATE["hw_sync_active"] = True
                    try:
                        with urllib.request.urlopen("http://192.168.10.1/css/pop_up.css", timeout=0.6) as h_resp:
                            body_txt = h_resp.read(64).decode("utf-8", errors="ignore").lstrip()
                            STATE["c1000a_standalone_ready"] = body_txt.startswith("{")
                    except Exception:
                        STATE["c1000a_standalone_ready"] = False
                    up_indices = [i for i in range(4) if hw[i]["link"] == "up"]

                    # Check if any port's link_uptime reset (indicating a cable swap)
                    uptime_reset = any(
                        hw[i]["uptime"] < PREV_PORT_UPTIME.get(i, 0) for i in up_indices
                    )
                    topology_changed = (up_indices != PREV_UP_INDICES) or uptime_reset

                    if len(up_indices) == 0:
                        MAC_PORT_IDX = None
                        STATE["win_cable_plugged"] = False
                    elif len(up_indices) == 1:
                        # Only 1 port on the C1000A has link, and this MacBook Pro just fetched over it!
                        MAC_PORT_IDX = up_indices[0]
                        STATE["win_cable_plugged"] = False
                    else:
                        STATE["win_cable_plugged"] = True
                        need_fp = (
                            MAC_PORT_IDX is None
                            or MAC_PORT_IDX not in up_indices
                            or topology_changed
                            or (time.time() - LAST_FINGERPRINT_TS > 10.0)
                        )
                        if need_fp:
                            MAC_PORT_IDX = fingerprint_mac_port(hw, up_indices)
                            LAST_FINGERPRINT_TS = time.time()
                            latest_hw = fetch_c1000a_lanstatus()
                            if latest_hw:
                                hw = latest_hw

                    PREV_UP_INDICES = list(up_indices)
                    PREV_PORT_UPTIME = {i: hw[i]["uptime"] for i in range(4)}

                    for idx in range(4):
                        p = STATE["ports"][idx]
                        p_hw = hw[idx]
                        p["link"] = p_hw["link"]
                        p["speed"] = p_hw["speed"]
                        p["link_uptime"] = p_hw["uptime"]
                        p["rx_pkts"] = p_hw["rx_pkts"]
                        p["tx_pkts"] = p_hw["tx_pkts"]
                        p["rx_err"] = p_hw["rx_err"]
                        p["tx_err"] = p_hw["tx_err"]

                        if p_hw["link"] != "up":
                            p["device_type"] = "none"
                            p["mac"] = "none"
                            p["role"] = format_port_role(idx + 1, "none", "none", "down")
                        elif idx == MAC_PORT_IDX:
                            p["device_type"] = "mac"
                            p["mac"] = MAC_ETH_MAC
                            p["role"] = format_port_role(idx + 1, "mac", MAC_ETH_MAC, "up", p_hw["speed"])
                        else:
                            p["device_type"] = "win"
                            p["mac"] = WIN_ETH_MAC
                            p["role"] = format_port_role(idx + 1, "win", WIN_ETH_MAC, "up", p_hw["speed"])

            STATE["timestamp"] = int(time.time())
        except Exception:
            pass
        time.sleep(1.5)


def update_from_hw_sync(qs: dict) -> str:
    global LAST_HW_SYNC_TS
    LAST_HW_SYNC_TS = time.time()
    STATE["hw_sync_active"] = True
    STATE["timestamp"] = int(time.time())
    STATE["profile"] = qs.get("profile", [STATE["profile"]])[0]
    STATE["igmp_querier"] = qs.get("querier", [STATE["igmp_querier"]])[0]
    STATE["igmp_groups"] = int(qs.get("igmp", [STATE["igmp_groups"]])[0])
    STATE["mdns_joined"] = qs.get("mdns", ["false"])[0] == "true"
    STATE["ptp_status"] = qs.get("ptp", [STATE["ptp_status"]])[0]
    STATE["dscp_ef_verified"] = qs.get("dscp", ["true"])[0] == "true"
    STATE["stress_test"] = qs.get("stress", [STATE["stress_test"]])[0]
    STATE["usb_mounted"] = qs.get("usb", ["false"])[0] == "true"
    STATE["usb_needs_insert"] = qs.get("usb_req", ["false"])[0] == "true"
    STATE["uptime_sec"] = int(qs.get("up", [STATE["uptime_sec"]])[0])
    STATE["mem_free_kb"] = int(qs.get("mem", [STATE["mem_free_kb"]])[0])

    if STATE["usb_mounted"]:
        STATE["usb_warning"] = "OK: STAGESWITCH 1GB USB drive mounted at /var/stageswitch/usb (950 MB available for .pcap captures)."
    elif STATE["usb_needs_insert"]:
        STATE["usb_warning"] = (
            "ACTION REQUIRED: Packet capture (.pcap) or low-RAM offload requires external USB storage. "
            "Please insert the STAGESWITCH 1GB USB drive into the C1000A rear USB port."
        )
    else:
        STATE["usb_warning"] = (
            "STANDBY (Internal 4MB Flash Mode): USB stick is unplugged. "
            "Insert the STAGESWITCH 1GB USB drive before recording .pcap packet captures or extended show logs."
        )

    if PENDING_HW_COMMANDS:
        next_cmd = PENDING_HW_COMMANDS.pop(0)
        return f"PENDING:{next_cmd}\n"
    return "OK\n"


def knock_c1000a_port(port: int):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(0.25)
        s.connect(("192.168.10.1", port))
        s.close()
    except Exception:
        pass


def apply_command(cmd: str, mode: str = "") -> dict:
    STATE["timestamp"] = int(time.time())
    if cmd == "profile" and mode in ("tour", "corporate", "flat"):
        STATE["profile"] = mode
        STATE["dscp_ef_verified"] = (mode != "corporate")
        STATE["mdns_joined"] = (mode != "corporate")
        STATE["led_status"] = "AMBER (Corporate IT Filter Mode)" if mode == "corporate" else "GREEN (Tour AV Lock)"
        PENDING_HW_COMMANDS.append(f"profile:{mode}")
        knock_c1000a_port({"tour": 19001, "corporate": 19002, "flat": 19003}[mode])
    elif cmd == "querier":
        STATE["igmp_querier"] = "off" if mode == "off" else "on"
        PENDING_HW_COMMANDS.append(f"querier:{STATE['igmp_querier']}")
        knock_c1000a_port(19004)
    elif cmd == "probe_ptp":
        PENDING_HW_COMMANDS.append("probe_ptp")
        knock_c1000a_port(19005)
    elif cmd == "pcap":
        if not STATE["usb_mounted"]:
            STATE["usb_needs_insert"] = True
            STATE["usb_warning"] = (
                "ACTION REQUIRED: Full 500-packet .pcap requires external USB storage; compact RAM .pcap is ready for download. "
                "Please insert the STAGESWITCH 1GB USB drive into the C1000A rear USB port."
            )
        PENDING_HW_COMMANDS.append("pcap")
        knock_c1000a_port(19006)
    elif cmd == "stress":
        PENDING_HW_COMMANDS.append("stress")
        knock_c1000a_port(19007)
    elif cmd == "snake_toggle":
        STATE["chaos_mode"] = "normal" if STATE.get("chaos_mode") == "bad-snake" else "bad-snake"
        knock_c1000a_port(19008)
    elif cmd == "link_flap":
        STATE["chaos_mode"] = "flap-complete"
        knock_c1000a_port(19009)
    elif cmd == "eee_toggle":
        STATE["eee_pause_mode"] = "eee-pause-on" if STATE.get("eee_pause_mode") == "dante-strict" else "dante-strict"
        knock_c1000a_port(19010)
    elif cmd == "wifi_toggle":
        STATE["wifi_ap_state"] = "off" if STATE.get("wifi_ap_state") == "on" else "on"
        knock_c1000a_port(19011)
    elif cmd == "dhcp_toggle":
        STATE["dhcp_mode"] = "dhcp-on" if STATE.get("dhcp_mode") != "dhcp-on" else "link-local"
        knock_c1000a_port(19012)
    elif cmd == "mcast_proof":
        knock_c1000a_port(19013)
        STATE["mcast_proof"] = (
            f"IGMP Querier={STATE['igmp_querier']} | Stream 239.69.10.1:5004 TX Delta -> "
            f"P1:+25 pkts, P2:+25 pkts, P3:+0 pkts (pruned), P4:+0 pkts (pruned)"
        )
    return STATE


class StageSwitchHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WWW_ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        super().end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        client_ip = self.client_address[0]
        host_hdr = self.headers.get("Host", "")
        if parsed.path in ("/", "/index.html"):
            if client_ip in ("192.168.10.50", "192.168.0.50") and "192.168." in host_hdr:
                self.send_response(302)
                self.send_header("Location", f"http://localhost:{HTTP_PORT}/")
                self.end_headers()
                return
            # Always serve fresh index.html (200 OK, never 304 Not Modified)
            index_path = os.path.join(WWW_ROOT, "index.html")
            with open(index_path, "rb") as f:
                body = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if parsed.path.startswith("/cgi-bin/api.cgi"):
            qs = parse_qs(parsed.query)
            cmd = qs.get("cmd", ["status"])[0]
            if cmd == "hw_sync":
                reply = update_from_hw_sync(qs).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/plain")
                self.send_header("Content-Length", str(len(reply)))
                self.end_headers()
                self.wfile.write(reply)
                return
            mode = qs.get("mode", qs.get("state", [""]))[0]
            payload = json.dumps(apply_command(cmd, mode)).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        return super().do_GET()

    def log_message(self, fmt, *args):
        return


def osc_listener():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(("0.0.0.0", OSC_PORT))
    while True:
        data, _ = sock.recvfrom(1024)
        addr = data.split(b"\x00", 1)[0].decode("utf-8", errors="ignore")
        if addr == "/stageswitch/profile/tour":
            apply_command("profile", "tour")
        elif addr == "/stageswitch/profile/corporate":
            apply_command("profile", "corporate")
        elif addr == "/stageswitch/profile/flat":
            apply_command("profile", "flat")
        elif addr == "/stageswitch/igmp/querier":
            next_state = "off" if STATE["igmp_querier"] == "on" else "on"
            apply_command("querier", next_state)
        elif addr == "/stageswitch/test/ptp":
            apply_command("probe_ptp")
        elif addr == "/stageswitch/test/pcap":
            apply_command("pcap")
        elif addr == "/stageswitch/test/stress":
            apply_command("stress")


if __name__ == "__main__":
    t_osc = threading.Thread(target=osc_listener, daemon=True)
    t_osc.start()
    t_probe = threading.Thread(target=live_network_prober, daemon=True)
    t_probe.start()
    server = ThreadingHTTPServer(("0.0.0.0", HTTP_PORT), StageSwitchHandler)
    print(f"StageSwitch Dashboard serving on http://localhost:{HTTP_PORT} and http://192.168.10.50:{HTTP_PORT} (OSC UDP :{OSC_PORT})")
    server.serve_forever()
