# NSSM services for DEPLOX

## Why NSSM, not Task Scheduler

DEPLOX used to run `pnpm dev` and the watchdog via Task Scheduler tasks (`DeploxDevServer`, `watchdog-ensure`). Both have been **disabled** because Task Scheduler is fragile on Windows for long-lived background processes:

- Tasks can fail to start if the user session is locked or a network share is briefly unavailable.
- "Hidden" mode in Task Scheduler only sets the *parent* cmd window style — the child processes can still flash.
- A crashed task that the user doesn't notice will silently take deplox down.

NSSM (Non-Sucking Service Manager) registers a real Windows service. Pros:

| | Task Scheduler | NSSM service |
|---|---|---|
| Survives user logoff | ❌ | ✅ |
| Auto-restart on crash | ❌ (manual `Restart=On Failure`) | ✅ built-in, configurable |
| Captures stdout/stderr to log files | clunky | `AppStdout` / `AppStderr` |
| Throttles restart loops | ❌ | `AppThrottle` |
| Visible in `Get-Service` | ❌ | ✅ |
| Requires admin to install | ❌ | ✅ |

## What gets installed

Two services:

| Service | Runs | Why |
|---|---|---|
| `DeploxDev` | `node scripts/dev.mjs` (from `C:\nvm4w\nodejs\node.exe`) | Hosts the API on `:8080` and Vite on `:5173`. The Vite dev server is what Caddy proxies to, which is what Cloudflare tunnel forwards, which is what `deplox.site` resolves to. |
| `DeploxWatchdog` | `powershell.exe -File scripts\deplox-watchdog.ps1` | 15-second loop that restarts Docker, Caddy, the per-project containers, pnpm dev, and the cloudflared tunnel if any of them dies. |

The watchdog depends on `DeploxDev` being present? No — they're independent. If `DeploxDev` crashes, NSSM restarts it. If the **watchdog** itself crashes (very rare), NSSM restarts the watchdog. Belt + suspenders.

## Install

```powershell
# Right-click PowerShell → "Run as administrator"
cd C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox
.\scripts\nssm-install-all.ps1
```

Output:

```
==== installing DeploxDev ====
[nssm] using C:\Users\naiti\...\nssm.exe
[nssm] installing DeploxDev
[nssm] DeploxDev is RUNNING (pid lookup via Get-Process node)
        node PID=...

==== installing DeploxWatchdog ====
[nssm] installing DeploxWatchdog
[nssm] DeploxWatchdog is RUNNING

==== status ====
Name             Status   StartType
----             ------   ---------
DeploxDev        Running  Automatic
DeploxWatchdog   Running  Automatic
```

## Uninstall

```powershell
# As Administrator
.\scripts\nssm-uninstall-all.ps1
```

## Status check (no admin needed)

```powershell
.\scripts\nssm-status.ps1
```

Shows service status, port listeners (5173 + 8080), cloudflared PID, and a few public URL HEAD probes.

## Logs

| Service | Log |
|---|---|
| `DeploxDev` | `.runlogs\services\nssm-deploxdev.out.log` and `.err.log` |
| `DeploxWatchdog` | `.runlogs\services\nssm-watchdog.out.log` and `.err.log` |
| The watchdog's own actions | `.runlogs\watchdog.log` |

All logs rotate at 5–10 MB.

## Reboot test

1. `.\scripts\nssm-install-all.ps1`
2. Confirm both services are `Running` with `.\scripts\nssm-status.ps1`
3. `Restart-Computer`
4. After logon, `.\scripts\nssm-status.ps1` should show:
   - `DeploxDev` Running
   - `DeploxWatchdog` Running
   - Ports 5173 + 8080 LISTEN
   - `cloudflared` PID present
   - `https://deplox.site/` → 200
5. No flashing terminal windows should appear at any point.

## Old Task Scheduler tasks

After NSSM is installed, the old tasks (`DeploxDevServer`, `watchdog-ensure`) should be deleted so they don't fight the NSSM services:

```powershell
Unregister-ScheduledTask -TaskName 'DeploxDevServer' -Confirm:$false
Unregister-ScheduledTask -TaskName 'watchdog-ensure' -Confirm:$false
```

## Why `LocalSystem`?

Both services run as `LocalSystem`. This is fine because:
- NSSM services don't have a "user session" — they run in Session 0.
- The dev server doesn't need the user's `~/.cloudflared` or `~/.ssh`.
- Caddy, Docker, and cloudflared are all system-wide services.
- We want them up even before the user logs in.

If the user later wants the API to read user-specific config, change `ObjectName` to their account. For now `LocalSystem` is correct.

## Failover philosophy

This is a single-Windows-box setup, not a cluster. Failure modes we *do* protect against:

- A `pnpm dev` child process crashes → NSSM restarts the service.
- The watchdog itself crashes → NSSM restarts the watchdog.
- Docker daemon dies → watchdog starts Docker Desktop.
- cloudflared tunnel drops → watchdog respawns it.
- A deplox app container stops → watchdog `docker start`s it.
- A `*.deplox.site` route disappears from Caddy → API self-heal re-adds it (already in place).

Failure modes we *don't* protect against:

- The Windows box itself dies. (Manual recovery.)
- Supabase is down. (External dependency.)
- Cloudflare tunnel account is suspended. (External dependency.)
- A power blip + UPS failure. (User concern.)
