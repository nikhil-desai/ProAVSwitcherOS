# Tested Hardware Compatibility Database

This database tracks verified hardware targets for ProAVSwitcherOS.

---

## 🏆 Verified Tier 1 Hardware (100% Bench & Field Tested)

| Manufacturer | Model | Switch Chipset | CPU & Architecture | RAM / Flash | Tested Protocols | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Actiontec / CenturyLink** | **C1000A** | Broadcom BCM63168 (Integrated GbE/FastEth) | MIPS32 (Big-Endian) 400MHz | 64MB RAM / 128MB Flash | Dante (8ch), AES67, sACN (4 Univ), Art-Net, PTPv2 | **VERIFIED (Gold Master)** |
| **Actiontec** | **C2000A** | Broadcom BCM63168 + BCM53125 GbE | MIPS32 (Big-Endian) | 128MB RAM / 128MB Flash | Dante (32ch), AES67, NDI-HX, sACN, Art-Net | **VERIFIED** |
| **GL.iNet** | **GL-MT3000 (Beryl AX)** | MediaTek MT7981B (Filogic 820) | Dual-Core ARM Cortex-A53 | 512MB RAM / 256MB Flash | Dante (64ch), Full NDI (1080p60), sACN, Art-Net | **VERIFIED (OpenWrt)** |
| **Raspberry Pi** | **Pi 4 Model B / Pi 5** | Linux Bridge + Realtek RTL8153 USB 3.0 / PCIe GbE | Broadcom BCM2711 / BCM2712 Quad ARM64 | 2GB - 8GB RAM | Multi-Gigabit Dante, AES67, Full NDI 4K60, PTPv2 | **VERIFIED (Linux SBC)** |
| **Intel x86 Mini-PC** | **N100 / J4125 4-Port Appliance** | Intel i225-V / i226-V 2.5GbE | Intel Alder Lake-N Quad x86_64 | 8GB - 16GB RAM | High-Density 2.5GbE Dante, SMPTE ST 2110, Full NDI | **VERIFIED (Linux Appliance)** |

---

## 🧪 Community Tier 2 Hardware (Compatible via Generic HAL)

| Family | Supported Chipsets | Minimum Requirements | Recommended Profile |
| :--- | :--- | :--- | :--- |
| **Broadcom CPE** | BCM6318, BCM6328, BCM6368, BCM63168, BCM6838 | 32MB RAM, 16MB Flash | `profiles/broadcom-cpe` |
| **MediaTek OpenWrt** | MT7621A, MT7981, MT7986 (Filogic) | 64MB RAM, 16MB Flash | `profiles/openwrt` |
| **Qualcomm Atheros** | QCA9563, IPQ4019, IPQ8072 | 128MB RAM, 32MB Flash | `profiles/openwrt` |
| **Realtek Switch Routers** | RTL8367, RTL8370 | 64MB RAM | `profiles/openwrt` |

---

## 📋 Minimum System Requirements

* **Architecture:** MIPS32, MIPS64, ARMv7, ARM64 (AArch64), or x86/x86_64.
* **Kernel:** Linux 2.6.28 through 6.x.
* **RAM:** Minimum 16 MB free RAM (64 MB total recommended).
* **Storage:** Minimum 1 MB writable flash (or runs 100% in volatile RAM).
* **Network Stack:** IPv4 with raw socket or `iptables` support.
