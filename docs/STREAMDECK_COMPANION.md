# Elgato StreamDeck & Bitfocus Companion Integration

ProAVSwitcherOS can be controlled directly from an **Elgato StreamDeck** using **Bitfocus Companion** (the industry-standard AV show automation tool).

---

## 🎮 Companion Button Setup (Generic HTTP / TCP)

Add the **"Generic HTTP Request"** or **"Internal: TCP/UDP Request"** module in Bitfocus Companion.

### Button 1: Pulse DMX Universe 1 (Fixture Check)
* **Label:** `💡 DMX\nPULSE`
* **Button Style:** Amber background, white text.
* **Action:** Send TCP Connection / Knock to Port `19015`:
  * Protocol: `TCP`
  * Target IP: `<ROUTER_IP>` (e.g. `192.168.1.1`)
  * Target Port: `19015`
* **Result:** Fires a 44-frame full-white Art-Net burst across all 512 channels.

---

### Button 2: Toggle 1kHz AES67 Test Tone (Audio Snake Check)
* **Label:** `🔊 1kHz\nTONE`
* **Button Style:** Red background when active, Dark when idle.
* **Action:** Send TCP Connection / Knock to Port `19014`:
  * Target IP: `<ROUTER_IP>`
  * Target Port: `19014`
* **Result:** Streams or stops uncompressed multicast 48kHz audio to `239.69.1.1:5004`.

---

### Button 3: Toggle Stage Stealth (LED Blackout + Wi-Fi Mute)
* **Label:** `🕶 STAGE\nSTEALTH`
* **Button Style:** Dark Grey.
* **Action:** Send TCP Connection / Knock to Port `19017`:
  * Target IP: `<ROUTER_IP>`
  * Target Port: `19017`
* **Result:** Turns off front-panel LEDs and disables 2.4GHz Wi-Fi radio.

---

### Button 4: Activate Tour AV Mode
* **Label:** `★ TOUR\nMODE`
* **Button Style:** Green background (`#10b981`).
* **Action:** Send TCP Connection / Knock to Port `19001`:
  * Target IP: `<ROUTER_IP>`
  * Target Port: `19001`
* **Result:** Re-enforces Dante/AES67 strict priority QoS and IGMP querier.

---

## 📡 REST API Alternative (For Systems Supporting HTTP GET/POST)
If your control processor (Q-SYS Core, Crestron, AMX, or Companion HTTP module) prefers standard HTTP GET:
* **DMX Pulse:** `GET http://<ROUTER_IP>/cgi-bin/api.cgi?action=dmx`
* **Tone Toggle:** `GET http://<ROUTER_IP>/cgi-bin/api.cgi?action=tone`
* **Tour Mode:** `GET http://<ROUTER_IP>/cgi-bin/api.cgi?action=tour`
* **Live Telemetry (JSON):** `GET http://<ROUTER_IP>/cgi-bin/api.cgi?action=telemetry`
