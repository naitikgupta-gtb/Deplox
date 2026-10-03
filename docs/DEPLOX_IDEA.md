# DEPLOX

**Complete Product Specification & Execution Strategy**

Version: 1.0.0 — Status: Blueprint

---

## 1. DEPLOX Ek Line Me

DEPLOX ek website hai jaha developers apna GitHub code daalte hain, aur wo automatically live website ban jata hai. Jaise Vercel, Netlify, ya Railway — bas apna, apne rules ke saath.

## 2. PROBLEM KYA HAI

Aaj koi bhi developer agar apni website ya app internet pe live karna chahta hai, toh usse ye poora circus karna padta hai:

**Infrastructure Burden**
- Server (VPS) kharidna (₹500-2000/month)
- Server pe Linux setup & updates
- Nginx ya Apache web server install karna
- SSL Certificate (HTTPS) configure karna

**DevOps & Maintenance**
- Docker containerization seekhna
- CI/CD deployment pipelines banana
- Domain & DNS records wire up karna
- Manual deployment, logging & security patches

**Result:** Experienced developers ke liye 2-5 din ka waste kaam. Naye developers ke liye mahino ka confusion. Aur har naye project pe ye drama repeat hota hai.

## 3. SOLUTION KYA HAI

DEPLOX ye poora drama khatam kar deta hai. Developer ko sirf 3 simple steps karne hain:

1. **GitHub se login karo**
2. **Apna repo select karo**
3. **"Deploy" click karo**

**Result:** 2 minute me website live, SSL-enabled URL pe ready to share. Zero server management, zero Docker overhead.

## 4. YE KAAM KAISE KARTA HAI (PEECHE KA JAADU)

- **Step 1 — Code Uthana:** Selected commit se GitHub API dwara directly code fetch kiya jata hai.
- **Step 2 — Auto Framework Detection:** Repository inspection se auto-detect hota hai:
  - React
  - Next.js
  - Node.js
  - Python
  - Go
  - HTML/CSS
- **Step 3 — Isolated Build System:** Framework ke hisaab se build command & output directory decide hoti hai. Sab kuch temporary isolated Docker container me run hota hai.

## 5. KIS KE LIYE HAI DEPLOX

**Primary Audience (Ideal Fit)**
- Solo Developers: Side projects ko bina server complexity deploy karne ke liye.
- Small Teams (2-10): Fast iterations aur internal previews share karne ke liye.
- Freelancers & Agencies: Client projects fast deliver karne ke liye.
- Students: Learning projects ko instant live URL par shift karne ke liye.

**Out of Scope (Non-Users)**
- Large Enterprises: Unko custom AWS/GCP/Kubernetes topology chahiye.
- High-Traffic Apps: Ultra scale architectures currently out of scope.
- GPU Heavy Workloads: ML model training, video processing apps.
- Strictly Regulated Industries: Banking, Healthcare (special compliance required).

## 6. DEPLOX KE MAIN FEATURES

| Feature | Functionality & Value |
|---------|----------------------|
| GitHub Auth & Deploy | 1-click GitHub login, repo selection, branch deployment, and webhook integration. |
| Auto Framework Detection | Inspects project files (`package.json`, `go.mod`, etc.) to auto-configure build pipeline. |
| Automatic HTTPS & URLs | Free automated SSL certificates and deterministic preview URLs per deployment. |
| Encrypted Env Variables | Secure secret storage with build/runtime isolation and automatic log redaction. |
| Live Logs & Instant Rollback | Real-time streaming build logs and 5-second 1-click instant version rollback. |
| Auto-Deploy & Previews | Automatic trigger on `git push` and temporary URL previews for Pull Requests (Phase 2). |

## 7. DEPLOX KYA NAHI HAI (HONEST BOUNDARIES)

- **Not an AWS Replacement:** Simple web apps ke liye hai, complex cloud infra ke liye nahi.
- **Not Universal Framework Runner:** Sirf top mainstream web frameworks support karega.
- **Not a Managed Database Host:** User apna database laayega (Supabase, Neon, etc.).
- **Not Free Forever:** Sustainable business ke liye structured paid plans rahenge.
- **Not Source Storage:** GitHub source of truth hai, DEPLOX sirf build-and-run runner hai.
- **Not Enterprise SLA Day-1:** Early phases me maintenance downtime possible hai.

**Core Philosophy:** DEPLOX koi magic tool nahi hai. Ye ek honest, clean deployment platform hai jo developers ka time save karta hai without selling fake promises.

## 8. SECURITY ARCHITECTURE — ISOLATED PLANES

DEPLOX user ka untrusted code execute karta hai. Isliye core isolation model ko 3 explicit planes me structure kiya gaya hai:

**Plane 1 — Control Plane (DEPLOX Brain)**
User authentication, project state, secrets database, and orchestration API. User code never runs here.

**Plane 2 — Build Plane (Ephemeral Pipeline)**
Where user code builds. Strictly network-limited (package registries only), CPU/RAM capped, no runtime secrets injected. Container escape affects only build host.

**Plane 3 — Runtime Plane (Execution Environment)**
Built application runner. Completely isolated from other users' containers, running as unprivileged non-root user with project-only secrets injected.

**Non-Negotiable Security Rules**
- User code never runs directly on the DEPLOX host server — always inside containers.
- Docker socket (`docker.sock`) is NEVER exposed to user containers.
- Build time and Runtime secrets are isolated; build logs auto-redact secrets.
- All database queries strictly scoped to authorized user IDs.
- Aggressive rate limiting on authentication, deployments, and webhook endpoints.

## 9. DESIGN PHILOSOPHY & COPY RULES

**What We Avoid (Anti-Patterns)**
- No purple gradient buttons or pill buttons
- No emoji icons in functional UI
- No "Made with AI" badges or cursor tricks
- No fake social proof ("10k+ developers")
- No marketing jargon ("Revolutionize your dev")

**What We Build (DEPLOX Standard)**
- Plain, crisp whitespace layout
- Typography-driven contrast & hierarchy
- Standard Lucide / Heroicons icon set
- Direct, honest, micro-copy
- Real UI screenshots & verifiable stats

**Tone Guidelines:**
- ✅ "Deploy your GitHub repository."
- ✅ "Your build failed. Check the logs."
- ❌ "Seamlessly unlock the future of modern deployment!"

## 10. LAUNCH CRITERIA & CHECKLIST

**Legal & Policy Standards**
- Custom domain setup (deplox.dev)
- Real Privacy Policy at /privacy
- Real Terms & Conditions at /terms
- Security contact: security@deplox.dev

**Product Polish Standards**
- Custom favicon (no default templates)
- Monitored support email operational
- Honest 404 & 500 error pages
- Zero placeholder / "Lorem Ipsum" text

## 11. BUSINESS MODEL (PRICING STRUCTURE)

| Tier | Projects & Build Limits | Features & Support |
|-------|----------------------|--------------------|
| Free Tier | 2 Projects \| 100 Build Mins/mo \| 10GB Bandwidth | 30-day logs, Community Support |
| Pro Tier (₹X/mo) | 10 Projects \| 1,000 Build Mins/mo \| 100GB Bandwidth | 90-day logs, Email Support, Custom Domains |
| Team Tier (₹Y/mo) | 50 Projects \| 5,000 Build Mins/mo \| 1TB Bandwidth | 10 Seats, 1-yr logs, Priority Support |

## 12. HONEST LIMITATIONS

- **Docker vs MicroVM:** Shared kernel limits perfect isolation (Migration to Firecracker MicroVMs planned in Stage 3).
- **Single Region:** Global edge latency deferred to future infrastructure phases.
- **Framework Boundaries:** Non-supported obscure build systems require manual container setups.
- **No Native DB:** Relies on external managed databases.

## 13. DEVELOPMENT ROADMAP

**Stage 1 — Baby DEPLOX (Weeks 2-3):**
Single-user local build prototype. GitHub link input → local container build → serve on `localhost:8000`. Target: Validate core build pipeline mechanics.

**Stage 2 — Public Beta DEPLOX (Months 3-6):**
Multi-tenant system with GitHub OAuth, Docker isolation, environment variable encryption, basic custom domains, and live logs.

**Stage 3 — Full DEPLOX Platform (Years 1-2):**
Team organizations, Firecracker MicroVM isolation, multi-region routing, usage-based billing, and SLA guarantees.

## 14. TECH STACK ARCHITECTURE

| Layer | Technology | Role in DEPLOX |
|-------|-----------|----------------|
| Frontend | React + Vite + TypeScript | Fast, type-safe dashboard interface |
| Backend API | Node.js + Fastify + TS | High-performance API server with strict typing |
| Database & Queue | PostgreSQL + Redis + BullMQ | State storage & async background job queuing |
| Runtime Isolation | Docker + Caddy Proxy | Isolated executions & automatic TLS termination |
| Hosting & Auth | Linux VPS + GitHub OAuth | Infrastructure foundation & developer auth |

## 15. REPOSITORY STRUCTURE

```
deplox/
├── apps/
│   ├── api/      # Backend Fastify REST API
│   ├── web/      # Frontend React Dashboard
│   └── worker/   # BullMQ Background Build Processors
├── packages/
│   ├── shared-types/  # End-to-end TypeScript Interfaces
│   ├── shared-config/ # Validated Environment Schemas
│   └── shared-logger/ # Redacted Structured Logging
├── docs/         # 11 Architecture Specification Specs
├── infra/         # Caddy & Server Deployment Manifests
└── .env.example
```

## 16. SPECIFICATION DOCUMENTS INDEX

| Doc | Covers |
|-----|--------|
| ARCHITECTURE.md | Core System Model |
| SECURITY_ARCHITECTURE.md | Isolation Rules |
| THREAT_MODEL.md | Threat Vectors & Fixes |
| PROJECT_STRUCTURE.md | Repo Organization |
| ENVIRONMENT_VARIABLES.md | Secret Schemas |
| DEVELOPMENT_ROADMAP.md | Phased Plan |
| DESIGN_RULES.md | Visual & Copy Guidelines |
| BUILD_SYSTEM.md | Container Pipeline |
| USER_FLOWS.md | Auth & Deployment UX |
| OPERATIONS.md | Incidents & Billing |
| DEPLOX_IDEA.md | Complete Vision Spec |

## 17. FINAL EXECUTION MINDSET

**Real Talk for Single Maintainers:**
DEPLOX ek ambitious 1-2 saal ka commitment hai. Jaldi karne ke chakkar me security aur foundational architecture ko compromise mat karna.

Pehle **Stage 1 (Baby DEPLOX)** build karke build mechanics ko pure depth me samjho. AI tools se guidance lo, lekin har ek line code ki thoroughly understand karke khud drive karo. Step-by-step execute karo: **Stability > Speed**.