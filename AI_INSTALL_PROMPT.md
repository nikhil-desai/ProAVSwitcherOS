# Copy-Paste Prompt for Your AI Assistant

> **Instructions for Humans:**
> Copy the text block below and paste it directly into your AI assistant (Cursor, Antigravity, Claude, ChatGPT, Copilot, etc.) to have it automatically install and configure ProAVSwitcherOS on your router.

```markdown
I have downloaded the ProAVSwitcherOS repository and want to install it on my router/switch to turn it into a professional AV flypack network switcher.

Please read `AGENTS.md` in the root of this repository and perform the installation for me:
1. Scan for and connect to my router at IP: [ENTER ROUTER IP HERE, e.g., 192.168.1.1 or 192.168.0.1]
2. Use Telnet or SSH with credentials: [USERNAME / PASSWORD, or use defaults like admin / admin]
3. Run the hardware probe (`installer/probe_target.sh`) to detect architecture and storage.
4. Stage and deploy the universal HAL, profile controller, pro-AV telemetry daemon, and web dashboard.
5. Apply the Tour AV profile (Dante QoS, EEE disabled, IGMP Querier on).
6. Verify the deployment and give me the link to open the live dashboard.
```
