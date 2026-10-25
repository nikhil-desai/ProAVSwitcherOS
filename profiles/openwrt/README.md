# OpenWrt Target Profile

Supported models:
* Any router supported by official OpenWrt (v19.07, v21.02, v22.03, v23.05+)
* Brands: GL.iNet, TP-Link, Netgear, Linksys, Asus, Xiaomi, Ubiquiti EdgeRouter, Turris Omnia

## Hardware Characteristics
* **Hardware Switch Control:** Linux DSA (`ip link set ... type bridge_slave`) or `swconfig`
* **Multicast Snooping / IGMP Querier:** Linux kernel bridge sysfs (`/sys/devices/virtual/net/br-lan/bridge/multicast_querier`) or `igmpproxy` / `smcroute`
* **Wi-Fi Radio:** OpenWrt UCI (`wifi down` / `wifi up`)
* **Web Server:** `uhttpd` (or `nginx-ssl`)
* **Storage Architecture:**
  - Root overlay: `/overlay/upper` (persistent JFFS2/UBIFS)
  - Temporary RAM: `/tmp` (tmpfs)

## Pro-AV Capabilities on OpenWrt
* **QoS / Traffic Control:** Linux `tc` flower / prio scheduler, or `iptables -t mangle` DSCP classify.
* **REST API:** Native CGI support via `/www/cgi-bin/api.cgi`.
* **Zero Dependency Mode:** Can be run completely in volatile `/tmp` without flashing OpenWrt packages or modifying `/overlay`.
