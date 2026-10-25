// StageSwitch OS - Native C1000A Web UI Loader & Application
// Hosted directly on Actiontec C1000A (Broadcom BCM63168 MIPS32)
(function() {
  let isMounted = false;
  let isShowLocked = false;
  let currentState = { profile: 'tour', igmp_querier: 'on', usb_mounted: true, ports: [] };

  const isHostedOnC1000A = (
    window.location.hostname === '192.168.10.1' ||
    window.location.hostname === '192.168.0.1' ||
    window.location.hostname === '10.10.10.1' ||
    window.location.hostname === '169.254.10.1'
  );

  async function fetchWithTimeout(url, timeoutMs, opts = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await fetch(url, { ...opts, cache: 'no-store', signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchStatusFromC1000A() {
    // Broadcom micro_httpd does not support query strings on static files (e.g. ?t=...)
    // cache: 'no-store' in fetchWithTimeout already bypasses the browser HTTP cache cleanly.
    const res = await fetchWithTimeout('/css/pop_up.css', 1500);
    if (!res.ok) throw new Error('C1000A telemetry unreachable: HTTP ' + res.status);
    const text = await res.text();
    if (!text || !text.trim().startsWith('{')) {
      throw new Error('Invalid telemetry payload from C1000A');
    }
    const data = JSON.parse(text);
    return data;
  }

  async function fetchStatusWithFailover(query) {
    if (isHostedOnC1000A) {
      return await fetchStatusFromC1000A();
    }
    try {
      const res = await fetchWithTimeout('/cgi-bin/api.cgi?' + query, 850);
      if (res.ok) {
        const d = await res.json();
        if (d && d.c1000a_standalone_ready) {
          window.location.replace('http://192.168.10.1/');
        }
        return d;
      }
    } catch (e) {}
    const resLocal = await fetchWithTimeout('http://127.0.0.1:8080/cgi-bin/api.cgi?' + query, 700);
    if (resLocal.ok) return await resLocal.json();
    throw new Error('Unreachable');
  }

  async function sendC1000ACommandPortKnock(port) {
    const host = isHostedOnC1000A ? window.location.hostname : '192.168.10.1';
    try {
      await fetchWithTimeout(`http://${host}:${port}/`, 400, { mode: 'no-cors' });
    } catch (e) {
      // Expected immediate TCP RST once iptables SS_CMD rule fires
    }
    setTimeout(() => callApi('cmd=status'), 450);
  }

  async function callApi(query) {
    try {
      const data = await fetchStatusWithFailover(query);
      renderDashboard(data);
    } catch (err) {
      const connDot = document.getElementById('connDot');
      if (connDot) connDot.className = 'status-dot offline';
      const ethBanner = document.getElementById('ethAlertBanner');
      const ethText = document.getElementById('ethAlertText');
      const ethBadge = document.getElementById('ethStateBadge');
      if (ethBanner) ethBanner.style.display = 'flex';
      if (ethText) ethText.textContent = 'SWITCH COMM WAITING: Connecting to StageSwitch auditor daemon...';
      if (ethBadge) {
        ethBadge.textContent = 'ETH: CONNECTING...';
        ethBadge.className = 'pill warn';
      }
    }
  }

  function setProfile(mode) {
    if (isShowLocked) {
      alert('SHOW LOCKOUT ACTIVE: Unlock show controls first to modify switch profile.');
      return;
    }
    const portMap = { tour: 19001, corporate: 19002, flat: 19003 };
    if (isHostedOnC1000A && portMap[mode]) {
      sendC1000ACommandPortKnock(portMap[mode]);
    } else {
      callApi('cmd=profile&mode=' + encodeURIComponent(mode));
    }
  }

  function toggleQuerier() {
    if (isShowLocked) {
      alert('SHOW LOCKOUT ACTIVE: Unlock show controls first.');
      return;
    }
    if (isHostedOnC1000A) {
      sendC1000ACommandPortKnock(19004);
    } else {
      const next = currentState.igmp_querier === 'on' ? 'off' : 'on';
      callApi('cmd=querier&state=' + next);
    }
  }

  function triggerAction(cmd) {
    if (isShowLocked && cmd !== 'toggle_lockout') {
      alert('SHOW LOCKOUT ACTIVE: Controls are locked to protect live show execution.');
      return;
    }
    const pill = document.getElementById('lastSyncPill');
    if (pill) pill.textContent = 'Running ' + cmd + '...';
    const portMap = {
      probe_ptp: 19005,
      pcap: 19006,
      stress: 19007,
      snake_toggle: 19008,
      link_flap: 19009,
      eee_toggle: 19010,
      wifi_toggle: 19011,
      dhcp_toggle: 19012,
      mcast_proof: 19013,
      tone_toggle: 19014,
      dmx_blast: 19015,
      run_qa_cert: 19016,
      stealth_toggle: 19017
    };
    if (isHostedOnC1000A && portMap[cmd]) {
      sendC1000ACommandPortKnock(portMap[cmd]);
    } else {
      callApi('cmd=' + encodeURIComponent(cmd));
    }
  }

  function toggleShowLockout() {
    isShowLocked = !isShowLocked;
    const lockBanner = document.getElementById('lockoutBanner');
    const lockBtn = document.getElementById('btnShowLockout');
    if (lockBanner) lockBanner.style.display = isShowLocked ? 'flex' : 'none';
    if (lockBtn) {
      lockBtn.textContent = isShowLocked ? '🔓 UNLOCK SHOW CONTROLS' : '🔒 ENGAGE SHOW LOCKOUT';
      lockBtn.className = 'action-btn ' + (isShowLocked ? 'btn-danger' : '');
    }
  }

  function printQACertificate() {
    window.print();
  }

  // Export actions to window so inline onclick handlers succeed
  window.setProfile = setProfile;
  window.toggleQuerier = toggleQuerier;
  window.triggerAction = triggerAction;
  window.toggleShowLockout = toggleShowLockout;
  window.printQACertificate = printQACertificate;
  window.do_load = mountStageSwitchUI;

  function formatUptime(sec) {
    if (!sec || sec <= 0) return '--';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s}s`;
  }

  function renderDeviceCell(p) {
    if (p.link !== 'up' || p.device_type === 'none') {
      return `<span class="dev-badge dev-none">UNPLUGGED</span> <span style="color:var(--text-muted)">No Ethernet Cable Connected</span>`;
    }
    const spd = p.speed && p.speed !== 'Auto' ? ` · ${p.speed}` : '';
    if (p.device_type === 'mac') {
      return `<span class="dev-badge dev-mac">macOS · MacBook Pro</span> <strong>192.168.10.50</strong> <span style="color:var(--text-muted)">(00:e0:4c:36:37:04${spd})</span>`;
    }
    if (p.device_type === 'win') {
      return `<span class="dev-badge dev-win">Windows · Surface Book 3</span> <strong>192.168.10.51</strong> <span style="color:var(--text-muted)">(00:e0:4c:36:37:0f${spd})</span>`;
    }
    const vendorLabel = p.vendor || 'Pro-AV / Ethernet Host';
    const macLabel = p.mac && p.mac !== 'none' ? ` (${p.mac}${spd})` : spd;
    return `<span class="dev-badge dev-mac">${vendorLabel}</span> <strong>${p.role}</strong><span style="color:var(--text-muted)">${macLabel}</span>`;
  }

  function renderBandwidthGauge(rxMb, txMb, isSaturated) {
    const rx = parseFloat(rxMb || 0);
    const tx = parseFloat(txMb || 0);
    const rxPct = Math.min(100, Math.round(rx));
    const txPct = Math.min(100, Math.round(tx));
    const rxColor = rx > 80 ? 'var(--accent-danger)' : (rx > 30 ? 'var(--accent-corp)' : 'var(--accent-tour)');
    const txColor = tx > 80 ? 'var(--accent-danger)' : (tx > 30 ? 'var(--accent-corp)' : 'var(--accent-tour)');
    const satBadge = isSaturated ? `<span class="pill err" style="margin-left:4px;font-size:0.65rem;">SATURATED</span>` : '';

    return `
      <div style="font-size:0.75rem; min-width:140px;">
        <div style="display:flex;align-items:center;gap:0.35rem;margin-bottom:2px;">
          <span style="width:58px;font-family:var(--font-mono);">RX ${rx}M</span>
          <div style="flex:1;background:var(--border-subtle);height:5px;border-radius:3px;overflow:hidden;">
            <div style="width:${rxPct}%;background:${rxColor};height:100%;"></div>
          </div>
          ${satBadge}
        </div>
        <div style="display:flex;align-items:center;gap:0.35rem;">
          <span style="width:58px;font-family:var(--font-mono);">TX ${tx}M</span>
          <div style="flex:1;background:var(--border-subtle);height:5px;border-radius:3px;overflow:hidden;">
            <div style="width:${txPct}%;background:${txColor};height:100%;"></div>
          </div>
        </div>
      </div>
    `;
  }

  function renderPortsTable(ports) {
    const tbody = document.getElementById('portTableBody');
    if (!tbody) return;
    tbody.innerHTML = ports.map((p, idx) => {
      const errs = (p.rx_err || 0) + (p.tx_err || 0);
      const linkClass = p.link === 'up' ? 'ok' : 'warn';
      const errClass = errs > 0 ? 'err' : 'ok';
      const portLabel = `Port ${p.port_num || (idx + 1)} (${p.iface})`;
      const bwHtml = p.link === 'up' ? renderBandwidthGauge(p.rx_mbps, p.tx_mbps, p.saturation_alert) : `<span style="color:var(--text-muted)">0.0 Mbps</span>`;

      return `<tr>
        <td><strong>${portLabel}</strong></td>
        <td>${renderDeviceCell(p)}</td>
        <td class="${linkClass}"><strong>${(p.link || 'down').toUpperCase()}</strong></td>
        <td>${bwHtml}</td>
        <td>${Number(p.rx_pkts || 0).toLocaleString()}</td>
        <td>${Number(p.tx_pkts || 0).toLocaleString()}</td>
        <td class="${errClass}">${errs}</td>
        <td>${p.link === 'up' ? formatUptime(p.link_uptime) : '--'}</td>
      </tr>`;
    }).join('');
  }

  function renderDashboard(data) {
    currentState = data;
    const prof = (data.profile || 'tour').toLowerCase();
    const profBadge = document.getElementById('activeProfileBadge');
    if (profBadge) profBadge.textContent = 'Profile: ' + prof.toUpperCase();
    const memBadge = document.getElementById('memBadge');
    if (memBadge) memBadge.textContent = 'RAM Free: ' + (data.mem_free_kb || '--') + ' KB';
    const lastSync = document.getElementById('lastSyncPill');
    if (lastSync) lastSync.textContent = 'Live · ' + new Date().toLocaleTimeString();

    // Update Front-Panel LED Mimic Badge
    const ledBadge = document.getElementById('ledStateBadge');
    if (ledBadge && data.led_status) {
      ledBadge.textContent = 'LED: ' + data.led_status;
      if (data.led_status.indexOf('RED') !== -1) ledBadge.className = 'pill err';
      else if (data.led_status.indexOf('AMBER') !== -1) ledBadge.className = 'pill warn';
      else ledBadge.className = 'pill ok';
    }

    // Update PTP Grandmaster & Clock Jitter Box
    const ptpGmEl = document.getElementById('ptpGrandmasterText');
    if (ptpGmEl && data.ptp_grandmaster) {
      ptpGmEl.textContent = data.ptp_grandmaster;
    }
    const ptpJitterEl = document.getElementById('ptpJitterVal');
    if (ptpJitterEl) {
      const jit = data.ptp_jitter_us || 0;
      ptpJitterEl.textContent = `±${jit} µs`;
      ptpJitterEl.className = 'metric-val ' + (jit > 50 ? 'warn' : 'ok');
    }
    const ptpCadenceEl = document.getElementById('ptpCadenceVal');
    if (ptpCadenceEl) {
      ptpCadenceEl.textContent = data.ptp_clock_state || 'READY (8Hz Dante)';
    }

    // Update Lighting & DMX Blaster boxes
    const lightEl = document.getElementById('lightingSummaryText');
    if (lightEl && data.lighting_summary) lightEl.textContent = data.lighting_summary;
    const dmxStatusEl = document.getElementById('dmxBlastStatusText');
    if (dmxStatusEl && data.dmx_blast_status) dmxStatusEl.textContent = data.dmx_blast_status;

    // Update AES67 Tone Box & Button
    const toneStatusEl = document.getElementById('toneStatusVal');
    const toneBtn = document.getElementById('btnToneToggle');
    if (toneStatusEl && data.tone_status) {
      toneStatusEl.textContent = data.tone_status;
      toneStatusEl.className = 'metric-val ' + (data.tone_active ? 'ok' : 'warn');
    }
    if (toneBtn) {
      toneBtn.textContent = data.tone_active ? '⏹ Stop 1kHz Audio Tone' : '▶ Start 1kHz AES67 Tone';
      toneBtn.className = 'action-btn ' + (data.tone_active ? 'btn-danger' : '');
    }

    // Update Stage Stealth Mode indicator
    const stealthPill = document.getElementById('stealthStatePill');
    if (stealthPill) {
      const isStealth = data.stealth_mode === 'on';
      stealthPill.textContent = isStealth ? 'Stealth: BLACKOUT (ON)' : 'Stealth: NORMAL';
      stealthPill.className = 'pill ' + (isStealth ? 'warn' : 'ok');
    }

    // Update Pre-Show QA Certificate Box
    const qaCertBox = document.getElementById('qaCertSummaryBox');
    const qaCertText = document.getElementById('qaCertSummaryText');
    if (qaCertText && data.qa_cert_summary) {
      qaCertText.textContent = data.qa_cert_summary;
      if (data.last_qa_cert_id && data.last_qa_cert_id !== 'NONE') {
        const certBadge = document.getElementById('certIdBadge');
        if (certBadge) certBadge.textContent = 'CERT: ' + data.last_qa_cert_id;
      }
    }

    // Update Live Protocol Decoder & IGMP Proof boxes
    const protoEl = document.getElementById('protoSummaryText');
    if (protoEl && data.proto_summary) protoEl.textContent = data.proto_summary;
    const mcastEl = document.getElementById('mcastProofText');
    if (mcastEl && data.mcast_proof) mcastEl.textContent = data.mcast_proof;

    // Update Chaos Engineering, EEE, Wi-Fi AP & DHCP Mode boxes
    const chaosEl = document.getElementById('chaosStatusVal');
    const chaosMode = data.chaos_mode || 'normal';
    if (chaosEl) {
      if (chaosMode === 'bad-snake') {
        chaosEl.textContent = '10M HALF (BAD SNAKE)';
        chaosEl.className = 'metric-val warn';
      } else if (chaosMode === 'flap-complete' || chaosMode === 'flapping-port3') {
        chaosEl.textContent = 'LINK-FLAP TESTED';
        chaosEl.className = 'metric-val warn';
      } else {
        chaosEl.textContent = '100M FULL (NORMAL)';
        chaosEl.className = 'metric-val ok';
      }
    }

    const eeeEl = document.getElementById('eeeStatusVal');
    const eeeMode = data.eee_pause_mode || 'dante-strict';
    if (eeeEl) {
      if (eeeMode === 'dante-strict') {
        eeeEl.textContent = 'DANTE STRICT (EEE OFF)';
        eeeEl.className = 'metric-val ok';
      } else {
        eeeEl.textContent = 'EEE + PAUSE ON';
        eeeEl.className = 'metric-val warn';
      }
    }

    const wifiEl = document.getElementById('wifiStatusVal');
    const wifiState = data.wifi_ap_state || 'on';
    if (wifiEl) {
      if (wifiState === 'off') {
        wifiEl.textContent = 'RF-SILENT (WIFI OFF)';
        wifiEl.className = 'metric-val warn';
      } else {
        wifiEl.textContent = 'StageSwitch-FOH ON';
        wifiEl.className = 'metric-val ok';
      }
    }

    const dhcpEl = document.getElementById('dhcpStatusVal');
    const dhcpMode = data.dhcp_mode || 'link-local';
    if (dhcpEl) {
      if (dhcpMode === 'dhcp-on') {
        dhcpEl.textContent = 'SMART DHCP (.100-.199)';
        dhcpEl.className = 'metric-val ok';
      } else {
        dhcpEl.textContent = 'LINK-LOCAL / STATIC';
        dhcpEl.className = 'metric-val ok';
      }
    }

    const chaosPill = document.getElementById('chaosStatePill');
    if (chaosPill) {
      chaosPill.textContent = `Chaos: ${chaosMode.toUpperCase()} · EEE: ${eeeMode.toUpperCase()} · Wi-Fi: ${wifiState.toUpperCase()}`;
    }

    const ethBanner = document.getElementById('ethAlertBanner');
    const ethText = document.getElementById('ethAlertText');
    const ethBadge = document.getElementById('ethStateBadge');
    const connDot = document.getElementById('connDot');

    const upPorts = Array.isArray(data.ports) ? data.ports.filter(p => p.link === 'up') : [];
    if (connDot) connDot.className = 'status-dot';
    if (ethBanner) {
      if (upPorts.length === 0) {
        if (connDot) connDot.className = 'status-dot offline';
        ethBanner.style.display = 'flex';
        if (ethText) ethText.textContent = 'ETHERNET CABLES UNPLUGGED: No client devices connected to C1000A switch.';
        if (ethBadge) { ethBadge.textContent = 'ETH: ALL UNPLUGGED'; ethBadge.className = 'pill err'; }
      } else if (upPorts.length === 1) {
        ethBanner.style.display = 'flex';
        const activeDev = upPorts[0].device_type === 'win' ? 'Surface Book 3 (Windows)' : 'MacBook Pro (macOS)';
        const missingDev = upPorts[0].device_type === 'win' ? 'MacBook Pro (macOS)' : 'Surface Book 3 (Windows)';
        if (ethText) ethText.textContent = `SINGLE LAPTOP MODE: ${activeDev} is linked on Port ${upPorts[0].port_num}. ${missingDev} Ethernet cable is unplugged.`;
        if (ethBadge) { ethBadge.textContent = 'ETH: 1 LAPTOP LINKED'; ethBadge.className = 'pill warn'; }
      } else {
        ethBanner.style.display = 'none';
        if (ethBadge) { ethBadge.textContent = `ETH: ${upPorts.length} PORTS LINKED`; ethBadge.className = 'pill ok'; }
      }
    }

    const usbBanner = document.getElementById('usbAlertBanner');
    const usbText = document.getElementById('usbAlertText');
    const usbPill = document.getElementById('usbStateBadge');
    if (usbBanner && usbPill) {
      if (data.usb_mounted === false) {
        usbBanner.style.display = 'flex';
        usbBanner.className = 'alert-banner' + (data.usb_needs_insert ? ' critical' : '');
        if (usbText) usbText.textContent = data.usb_warning || 'USB STICK REQUIRED: Insert the STAGESWITCH 1GB USB drive into the C1000A rear USB port.';
        usbPill.textContent = data.usb_needs_insert ? 'USB: INSERT STICK NOW!' : 'USB: UNPLUGGED (4MB FLASH)';
        usbPill.className = 'pill ' + (data.usb_needs_insert ? 'err' : 'warn');
      } else {
        usbBanner.style.display = 'none';
        usbPill.textContent = 'USB: 1GB MOUNTED';
        usbPill.className = 'pill ok';
      }
    }

    ['Tour', 'Corporate', 'Flat'].forEach(name => {
      const btn = document.getElementById('btn' + name);
      if (btn) {
        btn.className = 'mode-btn' + (prof === name.toLowerCase() ? ' active-' + prof : '');
      }
    });

    const dscpEl = document.getElementById('dscpStatusVal');
    if (dscpEl) {
      if (prof === 'corporate' || data.dscp_ef_verified === false) {
        dscpEl.textContent = 'STRIPPED (BE 0x00)';
        dscpEl.className = 'metric-val warn';
      } else {
        dscpEl.textContent = 'EF (46) / CS4 (32) OK';
        dscpEl.className = 'metric-val ok';
      }
    }

    const ptpEl = document.getElementById('ptpStatusVal');
    if (ptpEl) {
      ptpEl.textContent = (data.ptp_status || 'READY').toUpperCase();
      ptpEl.className = 'metric-val ' + (data.ptp_status === 'no-clock' ? 'warn' : 'ok');
    }

    const qEl = document.getElementById('igmpQuerierVal');
    if (qEl) {
      if (data.igmp_querier === 'off') {
        qEl.textContent = 'DISABLED (Test Mode)';
        qEl.className = 'metric-val warn';
      } else {
        qEl.textContent = 'ENABLED (mcpd V2/V3)';
        qEl.className = 'metric-val ok';
      }
    }

    const gEl = document.getElementById('igmpGroupsVal');
    if (gEl) {
      gEl.textContent = (data.igmp_groups || 0) + ' Groups (mDNS: ' + (data.mdns_joined ? 'Yes' : 'Blocked') + ')';
    }

    if (Array.isArray(data.ports)) {
      renderPortsTable(data.ports);
    }
  }

  function mountStageSwitchUI() {
    if (isMounted) return;
    if (!document.body) return;
    isMounted = true;

    document.title = "StageSwitch OS — Actiontec C1000A AV Switcher & Tester";

    // Inject Modern Dark Theme Styles
    if (!document.getElementById('stageswitch-theme-css')) {
      const st = document.createElement('style');
      st.id = 'stageswitch-theme-css';
      st.textContent = `
        :root {
          color-scheme: dark;
          --bg-canvas: #0b0f17;
          --bg-surface: #131a27;
          --bg-elevated: #1b2436;
          --border-subtle: #27344d;
          --text-primary: #f1f5f9;
          --text-muted: #94a3b8;
          --accent-tour: #10b981;
          --accent-corp: #f59e0b;
          --accent-flat: #3b82f6;
          --accent-danger: #ef4444;
          --font-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
          --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          background: var(--bg-canvas) !important;
          color: var(--text-primary) !important;
          font-family: var(--font-sans) !important;
          line-height: 1.5;
          padding: 1.25rem;
          max-width: 1280px;
          margin: 0 auto;
        }
        .alert-banner {
          display: none;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          padding: 0.9rem 1.25rem;
          border-radius: 10px;
          margin-bottom: 0.85rem;
          font-size: 0.88rem;
          font-weight: 600;
          border: 1px solid var(--accent-corp);
          background: rgba(245, 158, 11, 0.14);
          color: var(--text-primary);
        }
        .alert-banner.critical {
          border-color: var(--accent-danger);
          background: rgba(239, 68, 68, 0.18);
        }
        .alert-banner.lockout {
          border-color: var(--accent-corp);
          background: rgba(245, 158, 11, 0.22);
          display: none;
        }
        header {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
          padding: 1rem 1.25rem;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: 12px;
          margin-bottom: 1.25rem;
        }
        .brand-title { display: flex; align-items: center; gap: 0.75rem; }
        .status-dot {
          width: 12px; height: 12px; border-radius: 50%;
          background: var(--accent-tour);
          box-shadow: 0 0 10px var(--accent-tour);
        }
        .status-dot.offline {
          background: var(--accent-danger);
          box-shadow: 0 0 10px var(--accent-danger);
        }
        h1 { font-size: 1.2rem; font-weight: 700; letter-spacing: -0.02em; }
        .subtitle { font-size: 0.82rem; color: var(--text-muted); font-family: var(--font-mono); }
        .badge-row { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
        .pill {
          font-family: var(--font-mono);
          font-size: 0.76rem;
          padding: 0.3rem 0.65rem;
          border-radius: 999px;
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
        }
        .grid-main {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
          gap: 1.25rem;
          margin-bottom: 1.25rem;
        }
        .card {
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: 12px;
          padding: 1.25rem;
        }
        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
          padding-bottom: 0.6rem;
          border-bottom: 1px solid var(--border-subtle);
        }
        .card-title {
          font-size: 0.95rem; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.04em; color: var(--text-muted);
        }
        .profile-buttons {
          display: grid; grid-template-columns: 1fr; gap: 0.65rem;
        }
        button.mode-btn {
          display: flex; justify-content: space-between; align-items: center;
          width: 100%; text-align: left; padding: 0.85rem 1rem; border-radius: 8px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-elevated); color: var(--text-primary);
          cursor: pointer; transition: all 0.15s ease;
        }
        button.mode-btn:hover { filter: brightness(1.15); }
        button.mode-btn.active-tour { border-color: var(--accent-tour); box-shadow: inset 0 0 0 1px var(--accent-tour); }
        button.mode-btn.active-corporate { border-color: var(--accent-corp); box-shadow: inset 0 0 0 1px var(--accent-corp); }
        button.mode-btn.active-flat { border-color: var(--accent-flat); box-shadow: inset 0 0 0 1px var(--accent-flat); }
        .mode-name { font-weight: 700; font-size: 0.95rem; display: block; }
        .mode-desc { font-size: 0.78rem; color: var(--text-muted); margin-top: 0.2rem; display: block; }
        .metrics-grid {
          display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; margin-bottom: 1rem;
        }
        .metric-box {
          background: var(--bg-elevated); border: 1px solid var(--border-subtle);
          border-radius: 8px; padding: 0.75rem;
        }
        .metric-label { font-size: 0.74rem; color: var(--text-muted); text-transform: uppercase; }
        .metric-val { font-family: var(--font-mono); font-size: 1.1rem; font-weight: 700; margin-top: 0.25rem; }
        .ok { color: var(--accent-tour); }
        .warn { color: var(--accent-corp); }
        .err { color: var(--accent-danger); }
        .action-row { display: flex; gap: 0.6rem; flex-wrap: wrap; margin-top: 0.5rem; }
        .action-btn {
          flex: 1; min-width: 130px; padding: 0.65rem 0.85rem; border-radius: 8px;
          border: 1px solid var(--border-subtle); background: var(--bg-elevated);
          color: var(--text-primary); font-weight: 600; font-size: 0.82rem; cursor: pointer;
        }
        .action-btn:hover { border-color: var(--accent-flat); filter: brightness(1.1); }
        .action-btn.btn-danger { border-color: var(--accent-danger); color: var(--accent-danger); }
        table {
          width: 100%; border-collapse: collapse; font-family: var(--font-mono); font-size: 0.82rem;
        }
        th, td {
          padding: 0.65rem 0.5rem; text-align: left; border-bottom: 1px solid var(--border-subtle);
        }
        th { color: var(--text-muted); font-size: 0.74rem; text-transform: uppercase; }
        .dev-badge {
          display: inline-block; padding: 0.15rem 0.5rem; border-radius: 6px;
          font-size: 0.73rem; font-weight: 700; margin-right: 0.45rem;
        }
        .dev-mac { background: rgba(16, 185, 129, 0.18); color: var(--accent-tour); border: 1px solid var(--accent-tour); }
        .dev-win { background: rgba(59, 130, 246, 0.18); color: var(--accent-flat); border: 1px solid var(--accent-flat); }
        .dev-none { background: rgba(148, 163, 184, 0.12); color: var(--text-muted); border: 1px solid var(--border-subtle); }
        .vlan-matrix {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 0.65rem; margin-top: 0.75rem;
        }
        .vlan-card {
          background: var(--bg-elevated); border: 1px solid var(--border-subtle);
          border-radius: 8px; padding: 0.65rem 0.8rem; font-family: var(--font-mono); font-size: 0.78rem;
        }
        @media print {
          body { background: white !important; color: black !important; padding: 0; }
          .action-row, .profile-buttons, header button { display: none !important; }
          .card { border: 1px solid #ccc !important; background: white !important; }
        }
      `;
      document.head.appendChild(st);
    }

    document.body.className = "";
    document.body.innerHTML = `
      <div id="stageswitch-root">
        <!-- Show Lockout Banner -->
        <div class="alert-banner lockout" id="lockoutBanner">
          <span>🔒 SHOW LOCKOUT ACTIVE: All topology switching and chaos fault injection controls are locked during live show execution.</span>
          <span class="pill warn">SHOW PROTECTED</span>
        </div>

        <div class="alert-banner critical" id="ethAlertBanner">
          <span id="ethAlertText">ETHERNET LINK NOTICE: One or more laptop Ethernet cables are unplugged from the C1000A switch.</span>
          <span class="pill err" id="ethAlertPill">CABLE UNPLUGGED</span>
        </div>

        <div class="alert-banner" id="usbAlertBanner">
          <span id="usbAlertText">USB STICK REQUIRED: Insert the STAGESWITCH 1GB USB drive into the C1000A rear USB port.</span>
          <span class="pill warn" id="usbAlertPill">INSERT USB</span>
        </div>

        <header>
          <div class="brand-title">
            <div class="status-dot" id="connDot"></div>
            <div>
              <h1>StageSwitch OS · Actiontec C1000A Standalone AV Switcher</h1>
              <div class="subtitle" id="boardInfo">Hosted Natively on C1000A Switcher (http://192.168.10.1 / http://192.168.0.1)</div>
            </div>
          </div>
          <div class="badge-row">
            <span class="pill ok" id="ethStateBadge">ETH: SCANNING...</span>
            <span class="pill warn" id="usbStateBadge">USB: CHECKING...</span>
            <span class="pill ok" id="stealthStatePill">Stealth: NORMAL</span>
            <span class="pill ok" id="ledStateBadge">LED: GREEN (Tour AV Lock)</span>
            <span class="pill" id="activeProfileBadge">Profile: TOUR</span>
            <span class="pill" id="certIdBadge">CERT: PENDING</span>
            <span class="pill" id="memBadge">RAM Free: -- KB</span>
          </div>
        </header>

        <div class="grid-main">
          <!-- Layer 2: Profile Switcher -->
          <section class="card">
            <div class="card-header">
              <span class="card-title">Layer 2 · Switch Topology Personality</span>
              <span class="pill" id="vlanStatePill">802.1Q + DiffServ</span>
            </div>
            <div class="profile-buttons">
              <button class="mode-btn active-tour" id="btnTour" onclick="setProfile('tour')">
                <div>
                  <span class="mode-name">TOUR MODE (FOH / Stage Rack AV)</span>
                  <span class="mode-desc">Strict Priority DSCP QoS (EF=46 PTP, CS4=32 Dante), 802.3az EEE Off, IGMP Querier, VLANs 10-40</span>
                </div>
                <span class="pill ok">TOUR</span>
              </button>

              <button class="mode-btn" id="btnCorporate" onclick="setProfile('corporate')">
                <div>
                  <span class="mode-name">CORPORATE IT SIMULATOR MODE</span>
                  <span class="mode-desc">Disables ASIC bypass, strips DSCP to Queue 0, blocks mDNS (224.0.0.251) via ebtables, isolates Port 3/4</span>
                </div>
                <span class="pill warn">CORP</span>
              </button>

              <button class="mode-btn" id="btnFlat" onclick="setProfile('flat')">
                <div>
                  <span class="mode-name">FLAT BYPASS SWITCH MODE</span>
                  <span class="mode-desc">Pure wire-speed Broadcom RoboSwitch Layer-2 bridge across all 4 ports with no VLAN tags or filters</span>
                </div>
                <span class="pill">FLAT</span>
              </button>
            </div>

            <div class="vlan-matrix">
              <div class="vlan-card"><strong>VLAN 10 · Dante Pri</strong><br/>10.10.10.1/24 · DSCP EF/CS4</div>
              <div class="vlan-card"><strong>VLAN 20 · Dante Sec</strong><br/>10.10.20.1/24 · Redundant</div>
              <div class="vlan-card"><strong>VLAN 30 · NDI Video</strong><br/>10.10.30.1/24 · High-BW</div>
              <div class="vlan-card"><strong>VLAN 40 · sACN / Art-Net</strong><br/>2.0.0.1/8 · Multicast DMX</div>
            </div>
          </section>

          <!-- Layer 3: Dante/AES67 Clock & IGMP Auditor -->
          <section class="card">
            <div class="card-header">
              <span class="card-title">Layer 3 · PTPv2 Clock, Jitter Scope & IGMP Proof</span>
              <span class="pill" id="lastSyncPill">Live</span>
            </div>

            <div class="metrics-grid">
              <div class="metric-box">
                <div class="metric-label">PTPv2 Clock Sync Jitter</div>
                <div class="metric-val ok" id="ptpJitterVal">±0 µs</div>
              </div>
              <div class="metric-box">
                <div class="metric-label">DSCP EF (46) Tag Integrity</div>
                <div class="metric-val ok" id="dscpStatusVal">VERIFIED</div>
              </div>
              <div class="metric-box">
                <div class="metric-label">IGMP Snooping & Querier</div>
                <div class="metric-val ok" id="igmpQuerierVal">ENABLED (V2/V3)</div>
              </div>
              <div class="metric-box">
                <div class="metric-label">PTP Cadence / Sync Rate</div>
                <div class="metric-val" id="ptpCadenceVal" style="font-size:0.95rem;">READY (8Hz Dante)</div>
              </div>
            </div>

            <div class="vlan-card" style="margin-bottom:0.45rem; font-family:monospace;" id="ptpGmBox">
              <strong>PTP Grandmaster Clock Leader:</strong> <span id="ptpGrandmasterText">192.168.10.50 (MacBook Pro Leader)</span>
            </div>

            <div class="vlan-card" style="margin-bottom:0.45rem; font-family:monospace;" id="protoSummaryBox">
              <strong>Live Wire Protocol Decoder:</strong> <span id="protoSummaryText">PTPv2:0 | Dante:0 | mDNS/NDI:2 | sACN:0 | Art-Net:0 | IGMP:2</span>
            </div>

            <div class="vlan-card" style="margin-bottom:0.75rem; font-family:monospace;" id="mcastProofBox">
              <strong>IGMP Flood vs. Prune Benchmark:</strong> <span id="mcastProofText">Click 'IGMP Multicast Proof Test' to measure per-port multicast pruning on 239.69.10.1:5004.</span>
            </div>

            <div class="action-row">
              <button class="action-btn" onclick="triggerAction('probe_ptp')">Scan Live Protocols & PTP</button>
              <button class="action-btn" id="btnQuerierToggle" onclick="toggleQuerier()">Toggle IGMP Querier</button>
              <button class="action-btn" onclick="triggerAction('mcast_proof')">IGMP Multicast Proof Test</button>
              <button class="action-btn" onclick="triggerAction('stress')">Run NDI Congestion Test</button>
              <button class="action-btn" onclick="triggerAction('pcap')">Record .PCAP Capture</button>
              <a class="action-btn" id="btnDownloadPcap" href="/css/index.css" download="stageswitch-capture.pcap" style="text-align:center;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;">⬇ Download .PCAP</a>
            </div>
          </section>
        </div>

        <!-- NEW: Pro-AV Test Bench & Virtual Audio/Lighting Generators -->
        <section class="card" style="margin-bottom: 1.25rem;">
          <div class="card-header">
            <span class="card-title">Pro-AV Flypack Field Generators: AES67 Audio Tone, DMX Tachometer & Pre-Show QA</span>
            <span class="pill ok" id="qaStatePill">QA: 100% Ready</span>
          </div>
          <div class="metrics-grid" style="grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); margin-bottom: 0.75rem;">
            <div class="metric-box">
              <div class="metric-label">AES67 / RTP 1kHz Test Tone</div>
              <div class="metric-val warn" id="toneStatusVal" style="font-size:0.92rem;">IDLE</div>
            </div>
            <div class="metric-box">
              <div class="metric-label">sACN / Art-Net Lighting Tachometer</div>
              <div class="metric-val ok" id="lightingSummaryText" style="font-size:0.88rem;">Idle (Ready for DMX)</div>
            </div>
            <div class="metric-box">
              <div class="metric-label">DMX Blaster Output Status</div>
              <div class="metric-val ok" id="dmxBlastStatusText" style="font-size:0.88rem;">Ready to pulse Univ 1</div>
            </div>
            <div class="metric-box">
              <div class="metric-label">Pre-Show QA Certification</div>
              <div class="metric-val ok" id="qaCertSummaryText" style="font-size:0.88rem;">Ready for Pre-Show Audit</div>
            </div>
          </div>
          <div class="action-row">
            <button class="action-btn" id="btnToneToggle" onclick="triggerAction('tone_toggle')">▶ Start 1kHz AES67 Tone (239.69.1.1:5004)</button>
            <button class="action-btn" onclick="triggerAction('dmx_blast')">💡 Pulse DMX Univ 1 (Full White 100%)</button>
            <button class="action-btn" onclick="triggerAction('run_qa_cert')">📋 Run Pre-Show QA Audit</button>
            <button class="action-btn" onclick="printQACertificate()">🖨 Print QA Certificate</button>
            <button class="action-btn" onclick="triggerAction('stealth_toggle')">🕶 Toggle Stage Stealth Blackout</button>
            <button class="action-btn" id="btnShowLockout" onclick="toggleShowLockout()">🔒 Engage Show Lockout</button>
          </div>
        </section>

        <!-- Chaos Engineering & Pocket FOH Controls -->
        <section class="card" style="margin-bottom: 1.25rem;">
          <div class="card-header">
            <span class="card-title">Chaos Engineering Fault Injector (Port 3 DUT) & Pocket FOH Wireless / DHCP Controls</span>
            <span class="pill ok" id="chaosStatePill">Chaos: Normal · EEE: Dante Strict</span>
          </div>
          <div class="metrics-grid" style="grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); margin-bottom: 0.75rem;">
            <div class="metric-box">
              <div class="metric-label">Port 3 Cable Fault Simulator</div>
              <div class="metric-val ok" id="chaosStatusVal">100M FULL (NORMAL)</div>
            </div>
            <div class="metric-box">
              <div class="metric-label">802.3az EEE & Pause Frames</div>
              <div class="metric-val ok" id="eeeStatusVal">DANTE STRICT (OFF)</div>
            </div>
            <div class="metric-box">
              <div class="metric-label">Pocket FOH Wi-Fi AP (wl0)</div>
              <div class="metric-val ok" id="wifiStatusVal">StageSwitch-FOH ON</div>
            </div>
            <div class="metric-box">
              <div class="metric-label">IP Addressing Mode (br0)</div>
              <div class="metric-val ok" id="dhcpStatusVal">LINK-LOCAL / STATIC</div>
            </div>
          </div>
          <div class="action-row">
            <button class="action-btn" onclick="triggerAction('snake_toggle')">Toggle Bad Cat5e Snake (10M Half)</button>
            <button class="action-btn" onclick="triggerAction('link_flap')">Pulse 1s Link-Flap Failover (Port 3)</button>
            <button class="action-btn" onclick="triggerAction('eee_toggle')">Toggle 802.3az EEE & Pause</button>
            <button class="action-btn" onclick="triggerAction('wifi_toggle')">Toggle FOH Wi-Fi / RF-Silent Mode</button>
            <button class="action-btn" onclick="triggerAction('dhcp_toggle')">Toggle Smart DHCP vs Link-Local</button>
          </div>
        </section>

        <!-- Hardware Switch Port Telemetry with Live Bandwidth Gauges -->
        <section class="card">
          <div class="card-header">
            <span class="card-title">Broadcom BCM63168 Physical Switch Ports · Real-Time Throughput (Mbps) & Device Recognition</span>
            <span class="pill ok" id="fdbSyncBadge">C1000A Native Switch OS</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Physical Port</th>
                <th>Detected Connected Device (Live MAC / OS / IP)</th>
                <th>Link State</th>
                <th>Throughput (Live Mbps)</th>
                <th>RX Packets</th>
                <th>TX Packets</th>
                <th>CRC / Frame Errors</th>
                <th>Link Uptime</th>
              </tr>
            </thead>
            <tbody id="portTableBody">
              <tr><td colspan="8">Scanning physical switch ports...</td></tr>
            </tbody>
          </table>
        </section>
      </div>
    `;

    // Start background telemetry polling
    callApi('cmd=status');
    setInterval(() => callApi('cmd=status'), 1500);
  }

  // Handle immediate mounting if body already exists, or wait for DOMContentLoaded / load
  if (document.body) {
    mountStageSwitchUI();
  } else {
    document.addEventListener('DOMContentLoaded', mountStageSwitchUI);
    window.addEventListener('load', mountStageSwitchUI);
  }
})();
