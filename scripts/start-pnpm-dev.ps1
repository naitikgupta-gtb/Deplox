# Auto-starter for the Deplox dev server. Runs `pnpm dev` and exits so
# Task Scheduler sees the task as Completed (not stuck in Running).
#
# Why this shape: Task Scheduler's "At logon" trigger fires the task once
# at user logon. We start pnpm dev as a fully detached background process
# and exit immediately. The dev server keeps running because we used
# -WindowStyle Hidden + RedirectStandardOutput (not WaitFor).
#
# The previous version of this script had a broken PATH-concat line and
# tried to `Wait-Process` on a process object that was never assigned,
# which left the task in a permanent "Running" state with no actual
# pnpm dev running.
#
# Required PATH additions (nvm4w + pnpm + cloudflared) are set inline so
# the script works even when Task Scheduler runs it with a minimal env.

$ErrorActionPreference = 'SilentlyContinue'
Set-Location 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox'

# Add node + pnpm + cloudflared to PATH for the spawned process.
# (The Task Scheduler process inherits this script's env; modifying
# $env:PATH here doesn't help child processes, but Start-Process with
# -ArgumentList will use the current env as the base for the new env.)
$env:PATH = 'C:\nvm4w\nodejs;' + 'C:\Users\naiti\AppData\Roaming\npm;' + 'C:\Program Files (x86)\cloudflared;' + $env:PATH

# Start pnpm dev fully detached. No -Wait, no -PassThru — we want to
# return to Task Scheduler immediately so the task is marked Completed.
$logDir = 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox\.runlogs\services'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }
Start-Process `
  -FilePath 'C:\Users\naiti\AppData\Roaming\npm\pnpm.cmd' `
  -ArgumentList 'dev' `
  -WorkingDirectory 'C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox' `
  -WindowStyle Hidden `
  -RedirectStandardOutput "$logDir\pnpm-dev.out.log" `
  -RedirectStandardError "$logDir\pnpm-dev.err.log"

# Brief log so we can see in Task Scheduler history that this ran.
Add-Content -Path "$logDir\pnpm-dev.start.log" -Value ("[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] pnpm dev launched (PID will appear in pnpm-dev.out.log)") -Encoding UTF8

# Exit immediately. Do NOT Wait-Process.
exit 0
