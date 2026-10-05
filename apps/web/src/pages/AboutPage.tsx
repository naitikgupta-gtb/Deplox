import { Link } from 'react-router-dom';
import { IconArrowRight, IconGithub, IconRocket, IconShield, IconBolt } from '../components/Icon';

export function AboutPage(): JSX.Element {
  return (
    <div className="about">
      <header className="about-hero">
        <h1>Made by one developer, in India, for honest deployment.</h1>
        <p className="lede">
          DEPLOX started as a side project to scratch an itch: deployment shouldn't
          require a credit card in a foreign currency, an opinionated runtime, or
          a degree in DevOps.
        </p>
      </header>

      <section className="about-story">
        <h2>The story</h2>
        <p>
          I wanted to deploy a Next.js app to a custom domain. Vercel wanted $20/month.
          Render wanted a US credit card. AWS wanted me to learn 12 services.
        </p>
        <p>
          So I built the smallest thing that worked: a Docker-based runner that takes
          your GitHub repo, builds it inside an isolated container, and serves it
          on a deterministic URL. The first commit was on a Tuesday. The first deploy
          was on a Wednesday. The first paying customer was — well, that part
          is still pending. But the platform works.
        </p>
        <p>
          DEPLOX is honest about what it doesn't do. It doesn't replace AWS.
          It doesn't host your database. It doesn't have SOC2. It doesn't
          support every framework. It does what it says on the tin: deploy
          mainstream web apps to public URLs, with encrypted env vars, webhooks,
          and rollback. Nothing more.
        </p>
      </section>

      <section className="about-values">
        <h2>What we believe</h2>
        <div className="about-value-grid">
          <div className="about-value-card">
            <span className="icon"><IconRocket /></span>
            <h3>Ship the smallest thing that solves the problem</h3>
            <p>
              Most features start as "no" until proven necessary. We don't add
              multi-region failover because nobody asked for it. We don't add RBAC
              until we have an actual team. We don't add GraphQL until REST
              hurts.
            </p>
          </div>
          <div className="about-value-card">
            <span className="icon"><IconShield /></span>
            <h3>Security is not a marketing checkbox</h3>
            <p>
              Secrets are AES-256-GCM encrypted at rest. Webhooks use HMAC-SHA256.
              Build and runtime planes are isolated Docker networks. We don't
              store your source code. We don't ship features that compromise
              these for convenience.
            </p>
          </div>
          <div className="about-value-card">
            <span className="icon"><IconBolt /></span>
            <h3>No surprises</h3>
            <p>
              No "contact sales" pricing. No auto-billed overage. No hidden
              fees. No marketing screenshots of dashboards that don't exist.
              When something breaks, we say what broke.
            </p>
          </div>
        </div>
      </section>

      <section className="about-stack">
        <h2>The stack</h2>
        <p className="muted small" style={{ marginBottom: 16 }}>
          Built with boring, reliable tools. Nothing exotic.
        </p>
        <div className="about-stack-grid">
          <StackCard name="TypeScript" what="API + worker (Fastify, BullMQ)" />
          <StackCard name="React + Vite" what="Dashboard" />
          <StackCard name="PostgreSQL" what="Project state, deployments, users (Neon)" />
          <StackCard name="Redis" what="Job queues (Upstash)" />
          <StackCard name="Docker" what="Build + runtime isolation (Dockerode)" />
          <StackCard name="Caddy" what="Reverse proxy + on-demand TLS" />
          <StackCard name="Cloudflare Tunnel" what="Public HTTPS without exposing home IP" />
          <StackCard name="Razorpay" what="UPI + card payments (Phase 4)" />
        </div>
      </section>

      <section className="about-contact">
        <h2>Get in touch</h2>
        <div className="about-contact-grid">
          <a className="about-contact-card" href="https://github.com/deplox/deplox/issues" rel="noreferrer" target="_blank">
            <IconGithub size={14} />
            <div>
              <div className="about-contact-title">Bug reports &amp; feature requests</div>
              <div className="muted small">github.com/deplox/deplox/issues</div>
            </div>
          </a>
          <a className="about-contact-card" href="mailto:founder@deplox.net">
            <IconArrowRight size={14} />
            <div>
              <div className="about-contact-title">Direct line to the founder</div>
              <div className="muted small">founder@deplox.net · IST hours, mostly evenings</div>
            </div>
          </a>
        </div>
      </section>

      <section className="about-cta">
        <h2 style={{ fontSize: 24 }}>Try DEPLOX</h2>
        <p className="muted" style={{ marginBottom: 20 }}>
          7 free projects, no credit card. Pro is ₹199/mo when you're ready.
        </p>
        <a className="cta-primary" href="/auth/github?return_to=/dashboard">
          Get started
        </a>
        <Link to="/pricing" className="cta-secondary" style={{ marginLeft: 16 }}>
          See pricing →
        </Link>
      </section>
    </div>
  );
}

function StackCard({ name, what }: { name: string; what: string }): JSX.Element {
  return (
    <div className="about-stack-row">
      <div className="about-stack-name">{name}</div>
      <div className="muted small">{what}</div>
    </div>
  );
}