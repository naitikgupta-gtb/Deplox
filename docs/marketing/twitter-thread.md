# Twitter / X thread — #buildinpublic

**Format**: 8-tweet thread. Each tweet under 280 chars. Number them.

---

**1/8** (hook)

I built a Vercel alternative that runs on a single Windows box in my apartment.

Log in with GitHub, pick a repo, ~2 minutes later it's live on a public URL with HTTPS, encrypted env vars, and instant rollback.

It's called DEPLOX. Here's the architecture in 8 tweets. 🧵

---

**2/8** (the surface)

The user-facing surface is dead simple:
- GitHub OAuth login
- Repo picker
- "Deploy" button
- Live URL like `https://myapp-a1b2.deplox.site`

Everything else is plumbing. Let's talk about the plumbing.

---

**3/8** (the parts)

The runtime is 4 things:

1. A node API (Fastify) — webhooks, framework detection, Docker orchestration, env var encryption
2. Caddy (Docker) — reverse proxy + on-demand TLS
3. A Cloudflare tunnel — forwards `*.deplox.site` traffic from the internet
4. Supabase Postgres — state

That's it. No Kubernetes. No Lambda. No queues.

---

**4/8** (the magic)

The part that makes this work is Caddy's on-demand TLS combined with a Cloudflare tunnel.

When a request hits `<myapp>.deplox.site`:
1. Cloudflare tunnel forwards it to Caddy
2. Caddy sees no cert for that subdomain, asks Cloudflare DNS for a challenge
3. Cloudflare proves the challenge, Caddy mints a Let's Encrypt cert
4. Caddy reverse-proxies to the right Docker container

Total time: ~3 seconds on first request. Free. Forever.

---

**5/8** (the hard parts)

Things that bit me:

- **Windows process management**: no systemd. Ended up writing a node watchdog that spawns each app's dev script with `windowsHide:true` so no terminal window pops up.
- **Subdomain collisions**: if two projects both want `myapp.deplox.site`, fall back to `myapp-<uuid>.deplox.site`. Handle this at deploy time, not at request time.
- **Webhook auth**: HMAC-SHA256, but only auto-deploy on pushes to the *configured* default branch — otherwise PR forks from contributors accidentally deploy private code.

---

**6/8** (env vars)

Env vars are AES-256-GCM at rest. Master key in an env var on the server, never logged, never sent to the client.

On deploy, the orchestrator decrypts them and passes them to the container as `--env-file`. The container has them in memory only. The DB always holds ciphertext.

If you steal the DB, you get nothing.

---

**7/8** (pricing)

I charge ₹199/mo instead of $20/mo. Bills in INR via UPI.

Why:
- Most of my users are in India
- They don't have foreign cards
- ₹199 hits the sweet spot between "feels like a scam" and "why not just use Vercel"

First 50 signups get Pro free for 6 months in exchange for honest feedback. Conversion has been 4x better than paid-only.

---

**8/8** (CTA)

If you want to try it: https://deplox.site

If you want to follow along: @deploxhq

I post about the architecture, the bugs, and the economics of running a single-developer SaaS out of an apartment in India.

AMA in the replies.
