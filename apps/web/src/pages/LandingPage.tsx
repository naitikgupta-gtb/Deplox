import { Link } from 'react-router-dom';
import {
  IconArrowRight,
  IconBolt,
  IconCheck,
  IconGithub,
  IconHistory,
  IconLayers,
  IconLock,
  IconRocket,
  IconZap,
} from '../components/Icon';

export function LandingPage(): JSX.Element {
  return (
    <div className="landing">
      <div className="founding-strip">
        <div className="founding-strip-text">
          <span className="dot" />
          <span>
            <strong>First 50 users</strong> get DEPLOX Pro free for 6 months.
          </span>
        </div>
        <Link to="/founding" className="cta-link">
          Claim a slot →
        </Link>
      </div>

      <section className="hero">
        <div>
          <h1>
            Deploy your GitHub repo.<br />
            <span style={{ color: 'var(--color-fg-muted)' }}>In 2 minutes.</span>
          </h1>
          <p className="lede">
            Log in, click one button. We clone, build, and serve your app on a
            deterministic URL — with HTTPS, encrypted secrets, and instant rollback.
            No server juggling, no nginx archaeology.
          </p>
          <div className="ctas">
            <a className="cta-primary" href="/auth/github?return_to=/dashboard">
              <IconGithub size={14} /> Log in with GitHub
            </a>
            <a className="cta-secondary" href="#how">
              How it works →
            </a>
          </div>
        </div>

        <div className="hero-visual" aria-hidden="true">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ color: 'var(--color-fg-muted)' }}>vercel / next.js</span>
            <span className="status status-running">
              <span className="dot" /> running
            </span>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span className="label">build</span>
              <span>2.4s</span>
            </div>
            <div className="bar"><div style={{ width: '100%' }} /></div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span className="label">queued</span>
              <span>—</span>
            </div>
            <div className="bar"><div style={{ width: '0%' }} /></div>
          </div>
          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 12, fontSize: 11, color: 'var(--color-fg-muted)' }}>
            <div>$ deplox deploy</div>
            <div>→ cloning vercel/next.js @ a1b2c3d</div>
            <div>→ detected framework: nextjs</div>
            <div>→ building (12s)</div>
            <div style={{ color: 'var(--color-running)' }}>✓ running on https://next-app.deplox.dev</div>
          </div>
        </div>
      </section>

      <section className="trusted">
        <div className="label">Works with the frameworks you already use</div>
        <div className="frameworks">
          {['React', 'Next.js', 'Node.js', 'Python', 'Go', 'Static HTML'].map((fw) => (
            <span className="framework" key={fw}>{fw}</span>
          ))}
        </div>
      </section>

      <section id="how" className="features">
        <Feature
          icon={<IconRocket />}
          title="Three steps."
          body="Log in, pick a repo, click Deploy. We do the rest in roughly two minutes."
        />
        <Feature
          icon={<IconZap />}
          title="Auto framework detection."
          body="React, Next.js, Node, Python, Go, static HTML — we pick the right build pipeline for each."
        />
        <Feature
          icon={<IconLock />}
          title="Encrypted env vars."
          body="AES-256-GCM at rest. Decrypted only inside the runtime container. Never logged."
        />
        <Feature
          icon={<IconLayers />}
          title="Live logs and instant rollback."
          body="Stream build output in real time. Restore any previous deploy in five seconds."
        />
        <Feature
          icon={<IconCheck />}
          title="No surprises."
          body="Deterministic URLs, real status badges, honest error messages. No fake dashboards in marketing."
        />
        <Feature
          icon={<IconHistory />}
          title="Your code stays on GitHub."
          body="We never store source. GitHub is the source of truth; we are the runner."
        />
      </section>

      <section className="pricing-preview">
        <h2>Pay in rupees. Stay in control.</h2>
        <p>
          Vercel charges $20/mo and bills in USD. We charge ₹199/mo and bill in INR via UPI.
          Same features, less paperwork. No international card required.
        </p>
        <div className="pricing-preview-grid">
          <div className="pricing-preview-card">
            <div className="name">Free</div>
            <div className="price">₹0</div>
            <ul>
              <li>7 projects</li>
              <li>50 GB egress / month</li>
              <li>Always-on runtime</li>
              <li>Encrypted env vars</li>
            </ul>
          </div>
          <div className="pricing-preview-card pro">
            <div className="name">Pro · recommended</div>
            <div className="price">₹199/mo</div>
            <ul>
              <li>25 projects</li>
              <li>500 GB egress / month</li>
              <li>Free custom domain</li>
              <li>Priority builds</li>
            </ul>
          </div>
          <div className="pricing-preview-card">
            <div className="name">Team</div>
            <div className="price">₹999/mo</div>
            <ul>
              <li>Unlimited projects</li>
              <li>5 TB egress / month</li>
              <li>Unlimited collaborators</li>
              <li>Audit logs</li>
            </ul>
          </div>
        </div>
        <div className="pricing-preview-cta">
          <Link to="/pricing" className="cta-primary">
            Compare plans in detail <IconArrowRight size={14} />
          </Link>
          <Link to="/founding" className="cta-secondary" style={{ marginLeft: 16 }}>
            Or claim a free Pro slot →
          </Link>
        </div>
      </section>

      <section className="boundaries">
        <h2>What DEPLOX is not.</h2>
        <p className="muted" style={{ marginBottom: 24 }}>
          An honest product is one that knows its limits. Here are ours:
        </p>
        <div className="grid">
          <ul>
            <li>Not an AWS replacement.</li>
            <li>Not a managed database host.</li>
            <li>Not source storage — GitHub is the source of truth.</li>
          </ul>
          <ul>
            <li>Not free forever.</li>
            <li>Not enterprise SLA at day 1.</li>
            <li>Not universal — only top mainstream web frameworks.</li>
          </ul>
        </div>
        <p className="faint small" style={{ marginTop: 24 }}>
          Full list in <Link to="/pricing" className="link">Pricing &amp; Boundaries</Link>.
        </p>
      </section>

      <section style={{ padding: '60px 0 0', textAlign: 'center' }}>
        <h2 style={{ fontSize: 28, marginBottom: 12 }}>Ready to deploy?</h2>
        <p className="muted" style={{ marginBottom: 24 }}>
          Free tier available. No credit card required. Pay with UPI when you're ready.
        </p>
        <a className="cta-primary" href="/auth/github?return_to=/dashboard">
          Get started <IconArrowRight size={14} />
        </a>
        <div style={{ marginTop: 16, fontSize: 12, color: 'var(--color-fg-faint)' }}>
          <IconBolt size={11} /> Bonus: first 50 signups get Pro free for 6 months.
        </div>
      </section>
    </div>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: JSX.Element;
  title: string;
  body: string;
}): JSX.Element {
  return (
    <div className="feature">
      <span className="icon">{icon}</span>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}