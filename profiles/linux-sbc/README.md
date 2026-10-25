# Linux SBC & Multi-NIC Appliances Target Profile

Supported models:
* **Raspberry Pi 4 / 5** (with USB 3.0 Gigabit Ethernet dongles or PCIe multi-NIC hats)
* **Banana Pi / NanoPi / FriendlyElec** multi-port router boards (R4S, R5S, R6S)
* **x86 Multi-NIC Mini PCs** (Intel N100 / J4125 / i225 / i226 appliances)
* Standard Linux distributions: Debian, Ubuntu Server, Alpine Linux, Arch Linux

## Hardware Characteristics
* **Bridge Management:** Linux bridge-utils (`brctl`) or `iproute2` (`ip link set dev <port> master br0`)
* **Multicast Snooping / IGMP Querier:** Kernel bridge (`multicast_snooping 1`, `multicast_querier 1`)
* **QoS / Traffic Control:** Linux `tc` `prio` queue discipline or `ethtool`
* **Web Server:** Standalone Python companion server (`osc_companion_server.py`) or Nginx / Lighttpd

## Pro-AV Capabilities
* High throughput multi-gigabit routing (1GbE / 2.5GbE / 10GbE Dante & NDI video streams).
* Zero packet loss hardware buffers.
* Native Python 3 OSC / Companion integration directly on device.
