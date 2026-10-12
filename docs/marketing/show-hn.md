# Show HN — DEPLOX

**Title**: Show HN: I built a self-hosted Vercel alternative that runs on a Windows box

**Post**:

Hey HN,

I built [DEPLOX](https://deplox.site) — a deploy platform that clones a GitHub repo, builds it, and serves it on a public URL with HTTPS, encrypted env vars, and instant rollback.

The "trick" is that the whole thing runs on one Windows box in my apartment:
- Caddy on Docker as the reverse proxy / on-demand TLS
- A node API that handles webhooks, orchestrates Docker, and stores state in Supabase Postgres
- A Cloudflare tunnel forwarding `*.deplox.site` traffic in
- pnpm dev / pm2-style process manager to keep everything alive

You log in with GitHub, pick a repo, and ~2 minutes later it's live on `https://<project>-<hash>.deplox.site`. Each push to `main` auto-deploys via GitHub webhook (HMAC-SHA256 verified). Encrypted env vars are AES-256-GCM at rest.

**Why I built it**:
- Vercel is $20/mo and bills in USD. I wanted the same with INR / UPI for the Indian market.
- I'm tired of setting up nginx + certbot + systemd for every side project.
- I wanted to dogfood my own infra so I'd be the first person paged when it broke.

**What's honest about the limits**:
- Only 4 mainstream web frameworks (React, Next.js, Node, Python, Go, static HTML)
- No managed database
- Not an AWS replacement
- I run it on a single Windows box, so a power blip means downtime

**What I learned**:
- On-demand TLS via Caddy + Cloudflare tunnel is genuinely the easiest way to get wildcard HTTPS
- Windows services + node is its own kind of pain (no systemd, weird process signals)
- Auto-scaling is a non-goal — single-tenant deployments are way simpler to reason about

**Free tier**: 7 projects, 50 GB egress. First 50 signups get Pro free for 6 months in exchange for honest feedback.

Try it: https://deplox.site

Would love feedback on the build pipeline specifically — that's the part I'm least confident in.
