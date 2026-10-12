# r/webdev post

**Title**: I built a self-hosted deploy platform (clone → build → serve) on a single Windows box. AMA about the Caddy + Cloudflare tunnel wiring.

**Post**:

Wanted to share something I built because the dev-loop / deployment plumbing questions come up here weekly.

[DEPLOX](https://deplox.site) — push to GitHub → live on a public URL in ~2 minutes.

**The architecture in one paragraph:**

The whole thing runs on a Windows 11 box in my apartment. A node API handles the orchestration (webhooks, framework detection, Docker). A Caddy container terminates TLS and reverse-proxies to per-project containers. A Cloudflare tunnel brings `*.deplox.site` traffic in from outside. Postgres on Supabase holds state. That's it.

**Things that were harder than they should have been:**

- **On-demand TLS with wildcards**: Cloudflare DNS challenge + Caddy `on_demand_tls` is the cleanest way I found. No need to mint certs ahead of time.
- **Windows process management**: No systemd. Ended up writing a small node watchdog that spawns each app's dev script via `process.execPath` (bypassing the .cmd shim) with `windowsHide:true` so no terminal window pops up.
- **Subdomain allocation**: Each project gets `<name>-<hash>.deplox.site`. Had to handle DB collisions gracefully — if a slug is taken, fall back to a longer form with the project UUID suffix.

**Things that were easier than I expected:**

- **GitHub webhooks**: HMAC-SHA256 verification is 5 lines of node. The hard part was remembering to only auto-deploy on pushes to the *configured* default branch, not on PR-fork pushes.
- **Encrypted env vars**: AES-256-GCM with a master key from env. Decrypt only inside the runtime container. Never log.
- **Framework detection**: A small "what files does this repo have?" table — `package.json` + `next.config.js` → Next.js, `requirements.txt` + `manage.py` → Python, etc. ~30 lines.

**Free tier**: 7 projects, 50 GB egress, always-on runtime. First 50 signups get Pro free for 6 months if they're willing to give honest feedback.

If you've been considering building something similar, the parts that saved me the most time were:
1. Use Caddy, not nginx (you'll thank me)
2. Use Cloudflare tunnel, not port forwarding
3. Use HMAC, not OAuth tokens, for webhook auth
4. Use Supabase, not a self-hosted Postgres

Happy to go deeper on any of it.
