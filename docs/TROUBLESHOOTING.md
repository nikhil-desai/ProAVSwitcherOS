# ProAVSwitcherOS Troubleshooting & Edge Cases

This guide documents known hardware quirks, firmware limitations, and solutions across embedded router platforms.

---

## 1. Broadcom `micro_httpd` URL Parser Bug
* **Symptom:** The web dashboard fails to load on Mac/iOS browsers, hanging on *"Scanning physical switch ports..."*, while working on Windows or other browsers.
* **Root Cause:** Broadcom's embedded `micro_httpd` does not parse query strings on static files. When JavaScript adds a timestamp cache buster like `pop_up.css?t=164000`, `micro_httpd` looks for a physical file named `pop_up.css?t=164000` on flash, returning an empty `HTTP 200` with 0 bytes.
* **Fix:** ProAVSwitcherOS web requests strictly omit query strings on static endpoints and use standard HTTP headers:
  ```javascript
  fetch('/css/pop_up.css', { cache: 'no-store' });
  ```

---

## 2. Daemon Dies Immediately After Disconnecting Telnet / SSH
* **Symptom:** Starting `av-auditor.sh --daemon &` works while the terminal is open, but running `ps | grep auditor` later shows the process vanished.
* **Root Cause:** BusyBox `ash` does not have job control or `nohup` installed. When the Telnet/SSH session closes, the kernel sends `SIGHUP` to the session process group.
* **Fix:** Launch with POSIX signal trapping:
  ```bash
  (trap '' HUP; /var/proav/bin/av-auditor.sh --daemon </dev/null >/dev/null 2>&1 &)
  ```

---

## 3. Flash Memory vs. RAM tmpfs Exhaustion
* **Symptom:** File writes fail with `No space left on device`, even though flash has megabytes free.
* **Root Cause:** `/var` or `/tmp` is mounted on a tiny RAM tmpfs (sometimes capped at 420 KB!).
* **Fix:** Only store small runtime PID/flag files in `/var`. Store all scripts and web assets on persistent flash:
  - Broadcom CPE: `/data` (JFFS2 flash, typically 3–8 MB free).
  - OpenWrt: `/overlay/upper`.

---

## 4. 32-Bit Signed Integer Math Overflow
* **Symptom:** Port bandwidth meters suddenly display negative numbers or freeze under heavy traffic.
* **Root Cause:** In 32-bit signed arithmetic, values above `2,147,483,647` overflow. Multiplying delta bytes by 80 (`d_rx * 8 * 10`) overflows when transferring more than ~26 MB in one interval.
* **Fix:** Use reduced division:
  ```bash
  # 125,000 bytes/sec = 1 Mbps. 12,500 bytes/sec = 0.1 Mbps.
  rx_tenths=$(( (delta_bytes / 12500) / DT ))
  ```

---

## 5. Read-Only Root Filesystem (`/webs` or `/www`)
* **Symptom:** `cp app.js /webs/js/` reports `Read-only file system`.
* **Fix:** Remount rootfs as read-write, copy the asset, and remount as read-only:
  ```bash
  mount -o remount,rw /
  cp /var/proav/www/app.js /webs/js/pop_up.js
  mount -o remount,ro /
  ```

---

## 6. Verifying Port-Knock Command Triggers
To verify that the web dashboard is able to signal the daemon:
```bash
iptables -L SS_CMD -v -n
```
The packet and byte counters for ports `19001`–`19017` should increment when buttons are clicked in the dashboard.
