# Broadcom CPE Target Profile (BCM63xx / BCM68xx)

Tested models:
* **CenturyLink / Actiontec C1000A** (Broadcom BCM63168, MIPS32 Big-Endian, Linux 2.6.30, BusyBox 1.17.2)
* **Actiontec C2000A / C3000A**
* **Sagemcom F@ST series**
* **Netgear DGN / DGND series**

## Hardware Characteristics
* **Hardware Switch Control:** Broadcom `ethswctl`
* **Multicast Snooping / IGMP Querier:** Broadcom `mcpd` daemon
* **Wi-Fi Radio:** Broadcom `wlctl`
* **Web Server:** Broadcom `micro_httpd` (listening on port 80)
* **Storage Architecture:**
  - JFFS2 writable partition: `/data` (3.7MB persistent flash)
  - Rootfs: SquashFS read-only flash, remountable via `mount -o remount,rw /`
  - RAM tmpfs: `/var` (420KB RAM capacity — DO NOT store large binaries in `/var`)

## Pro-AV Capabilities on Broadcom CPE
* **Hardware QoS Queuing:** Queue 3 (Strict Priority) mapped to DSCP 46 (Expedited Forwarding) for Dante PTPv2 clock sync.
* **Energy Efficient Ethernet (EEE):** Fully disabled per-port via `ethswctl -c pause -p <port> -v 0`.
* **Zero-CGI Control Channel:** Utilizes Linux `iptables` port-knock command listener on ports 19001–19017, allowing full interactive dashboard control without requiring CGI scripts on `micro_httpd`.
