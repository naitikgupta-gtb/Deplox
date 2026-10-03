# Manual WSL install — 5 minutes

Open an **Administrator PowerShell** and run the 4 commands below. Two ways to get one:

## Option 1 — Start menu (easiest)

1. Press the **Windows key**
2. Type `powershell`
3. You'll see **"Windows PowerShell"** — right-click it
4. Click **"Run as administrator"**
5. Click **"Yes"** on the UAC popup

## Option 2 — Win+X menu

1. Right-click the **Start button** (or press `Win+X`)
2. Click **"Terminal (Admin)"** or **"PowerShell (Admin)"**
3. Click **"Yes"** on UAC

## Then run these 4 commands

```powershell
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
wsl --set-default-version 2
wsl --install --distribution Ubuntu
```

Each may take 1-2 minutes. When done you'll see:
- "The operation completed successfully" (for both `dism` commands)
- "For information on key differences with WSL 2 please visit..." (for `wsl --set-default-version 2`)
- "Installation successful!" (for `wsl --install`)

## After install — REBOOT

In that same admin PowerShell:
```powershell
shutdown /r /t 0
```

Laptop restarts.

## After reboot

Ubuntu setup window appears asking for **username + password**. Pick anything (lowercase, no spaces).

Then come back to me and we'll:
1. Switch Docker Desktop to use WSL 2 backend
2. Set `DEPLOX_MOCK_DOCKER=0` in `.env`
3. Run `pnpm compose:up`
4. Click Deploy → real Ember-Coffee website live! ☕