# r/SaaS post

**Title**: I built a Vercel-for-the-Indian-market because I was tired of explaining to non-tech clients what "USD billing" means

**Post**:

Quick context: most of my freelance clients are Indian small businesses. They want a web app, they don't want to deal with international cards, and they definitely don't want a $20/mo recurring surprise on a credit card statement they don't check.

Vercel is great. Netlify is great. Render is great. They all also bill in USD, require a foreign card, and the support team is on the other side of the world.

So I built [DEPLOX](https://deplox.site) — same one-click deploy, but:
- ₹199/mo instead of $20/mo
- Bills in INR via UPI / Razorpay (when Razorpay is wired in — currently free for first 50 signups)
- 7 projects on the free tier
- 50 GB egress on the free tier
- Encrypted env vars, instant rollback, custom domains

**The honest "this is not for you" section:**

- You're at a US SaaS company with a sales team → use Vercel
- You need autoscaling, multi-region, audit logs → use Vercel/Render/Fly
- You need managed Postgres → use Supabase directly

**The "this is for you" section:**

- You're building side projects and don't want to think about nginx
- You're a freelancer with mostly Indian clients
- You want a single-developer / single-tenant deploy that's predictable
- You're OK with "one container per project" instead of "1000 containers per service"

**What I learned about pricing for the Indian market:**

- ₹199 hits a sweet spot. Below that, people think it's a scam. Above ₹499, they ask why not just use Vercel.
- "First 50 free for 6 months" has been a 4x conversion lift over "₹199/mo" alone. People will give you feedback if you ask for it.
- UPI > cards. Even for B2B. The credit card penetration in SMB India is much lower than people assume.

**What I learned about running SaaS infra on a single Windows box:**

- It's actually fine for 100 projects. Caddy + Cloudflare tunnel + a node API handles it with CPU to spare.
- The real bottleneck is *not* the box, it's the rate at which you can answer support messages. Plan accordingly.
- Backups matter more than uptime. If my box dies, can I restore state? Yes — Supabase daily snapshots + this repo + a cron that uploads the Caddyfile to S3. Uptime is downstream of backups.

If you're building SaaS for the Indian market, happy to chat. I'm at @deploxhq on Twitter or hello@deplox.site.
