# ProAVSwitcherOS Architecture & Technical Specifications

ProAVSwitcherOS transforms commercial, industrial, and consumer Ethernet routers into dedicated, tour-grade Layer 2/3 Audio/Video network switchers.

---

## 1. Professional AV Protocol Specifications

| Protocol | Transport | Port / Group | DiffServ / DSCP | Switch Requirement |
| :--- | :--- | :--- | :--- | :--- |
| **PTPv2 (IEEE 1588-2008)** | UDP Multicast | `319` (Event), `320` (General)<br>`224.0.1.129` | DSCP 46 (`0x2E`, EF)<br>Expedited Forwarding | Highest Strict Priority Queue<br>Jitter < 50 µs |
| **Dante Unicast / Multicast** | UDP | Audio: `4321`, `14336`<br>Clock: `319`, `320` | DSCP 34 (`0x22`, AF41)<br>DSCP 46 (`0x2E`, EF) | EEE / 802.3az Disabled<br>IGMPv2 Snooping + Querier |
| **AES67 Audio over IP** | RTP Multicast | `239.69.0.0/16`<br>UDP `5004` | DSCP 46 (PTP)<br>DSCP 34 / 48 (Audio) | Multicast Querier active<br>Packet pacing < 1 ms |
| **sACN (ANSI E1.31)** | UDP Multicast | `239.255.0.0/16`<br>UDP `5568` | DSCP 32 (`0x20`, CS4) | Fast IGMP Join / Leave<br>No packet drops |
| **Art-Net DMX** | UDP Broadcast | `255.255.255.255`<br>UDP `6454` | DSCP 32 (`0x20`, CS4) | Wire-speed broadcast forwarding |
| **NDI Video** | TCP / UDP | `5353` (mDNS)<br>`5960+` | Best Effort (DSCP 0)<br>or DSCP 32 (CS4) | > 80 Mbps continuous per stream<br>mDNS multicast unblocked |

---

## 2. QoS Queuing & Hardware Scheduling

Standard consumer routers forward packets using FIFO (First-In, First-Out) or Round-Robin scheduling. When a file transfer or video stream saturates a port, PTPv2 clock packets are delayed, leading to Dante clock unlocks, audio pops, and device dropouts.

ProAVSwitcherOS configures hardware switch chips and kernel traffic schedulers for **Strict Priority (SP)**:

```
[Switch Ingress Port]
         │
         ▼
[DSCP Classifier Engine]
         ├── DSCP 46 (PTPv2 Clock Events)  ──► [Queue 3: Strict Priority (Always Emptied First)]
         ├── DSCP 34 (Dante / AES67 Audio) ──► [Queue 2: High Priority (Emptied Second)]
         ├── DSCP 32 (sACN / Art-Net Video)──► [Queue 1: Medium Priority]
         └── DSCP 0  (General Web / Data)  ──► [Queue 0: Best Effort (Low Priority)]
```

---

## 3. Energy Efficient Ethernet (EEE / 802.3az) Mitigation

EEE powers down physical layer transceivers during micro-intervals of silence. When a burst of audio arrives, the PHY takes several microseconds to wake up, introducing packet delay variation (PDV).
* **Audinate Dante Requirement:** EEE must be completely disabled on all switch ports.
* **ProAVSwitcherOS Enforcement:** In Tour AV Mode, ProAVSwitcherOS forces port pause flags to `0` and sets `ethtool --set-eee <iface> eee off`, completely preventing PHY sleep states.

---

## 4. IGMP Querier vs. Passive Snooping

Switches with passive IGMP snooping prune multicast streams when no querier is present. In isolated flypack setups (no corporate gateway router), multicast audio streams stop after 3–5 minutes.
* ProAVSwitcherOS activates a local IGMPv2 Querier on the bridge interface (`br0`).
* Emits periodic IGMP General Queries to `224.0.0.1` every 125 seconds, keeping Dante and AES67 multicast subscriptions active indefinitely.

---

## 5. Zero-CGI Port-Knock Control Channel

Many embedded routers run stripped static web servers like Broadcom `micro_httpd` that lack CGI capability.
ProAVSwitcherOS solves this by implementing an `iptables` SYN/TCP reset listener on dedicated ports (19001–19017):
1. Clicking a button in the web dashboard sends a lightweight non-blocking `fetch()` to port `19014` (e.g. Tone Toggle).
2. The router's `iptables` rule increments its packet counter and resets the connection.
3. The background auditor daemon polls the `iptables` counter, matches the port, executes the corresponding action, and resets the rule counter.
4. The web dashboard reads the updated `telemetry.json` on its next 1-second refresh cycle.
