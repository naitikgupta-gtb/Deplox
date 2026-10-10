import { Link } from 'react-router-dom';
import {
  IconCheck,
  IconBolt,
  IconUsers,
  IconShield,
  IconGlobe,
  IconRocket,
} from '../components/Icon';
import { useMeta } from '../lib/use-meta';

export function PricingPage(): JSX.Element {
  useMeta({
    title: 'Pricing — Free and Pro tiers',
    description:
      'DEPLOX free tier: 7 projects, 50 GB egress, free deplox.site subdomain. Pro: unlimited projects, custom domains, priority support.',
    path: '/pricing',
  });
  return (

interface Tier {
  readonly id: 'free' | 'pro' | 'team';
  readonly name: string;
  readonly price: string;
  readonly period: string;
  readonly tagline: string;
  readonly cta: { readonly label: string; readonly href: string };
  readonly highlight?: boolean;
  readonly features: ReadonlyArray<string>;
  readonly limits: ReadonlyArray<{ readonly label: string; readonly value: string }>;
}

const TIERS: ReadonlyArray<Tier> = [
  {
    id: 'free',
    name: 'Free',
    price: '₹0',
    period: 'forever',
    tagline: 'For solo devs and side projects.',
    cta: { label: 'Get started', href: '/auth/github?return_to=/dashboard' },
    limits: [
      { label: 'Projects', value: '7' },
      { label: 'Egress / month', value: '50 GB' },
      { label: 'Build queue', value: 'Standard' },
      { label: 'Custom domain', value: '—' },
    ],
    features: [
      'GitHub OAuth login',
      'Auto framework detection',
      'AES-256-GCM encrypted env vars',
      'Webhooks with HMAC verification',
      'Always-on runtime (no cold start)',
      'Public preview URL per deployment',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '₹199',
    period: '/month',
    tagline: 'For freelancers and serious side projects.',
    cta: { label: 'Upgrade to Pro', href: '/billing' },
    highlight: true,
    limits: [
      { label: 'Projects', value: '25' },
      { label: 'Egress / month', value: '500 GB' },
      { label: 'Build queue', value: 'Priority' },
      { label: 'Custom domain', value: 'Free' },
    ],
    features: [
      'Everything in Free, plus:',
      'Pay with UPI (Razorpay)',
      'Bring your own domain — no extra fee',
      'Instant rollback across all deployments',
      'Priority build queue (skip the line)',
      'Real-time build log streaming',
      'No egress overage surprises',
    ],
  },
  {
    id: 'team',
    name: 'Team',
    price: '₹999',
    period: '/month',
    tagline: 'For small teams and agencies.',
    cta: { label: 'Get Team plan', href: '/billing' },
    limits: [
      { label: 'Projects', value: 'Unlimited' },
      { label: 'Egress / month', value: '5 TB' },
      { label: 'Build queue', value: 'Priority +' },
      { label: 'Custom domains', value: 'Unlimited' },
    ],
    features: [
      'Everything in Pro, plus:',
      'Unlimited collaborators (no per-seat fee)',
      'Audit log for sensitive operations',
      'Team-scoped environment variables',
      'Private preview URLs for PRs (Phase 5)',
      'Email support, IST hours',
      'SOC2-readiness roadmap (when revenue justifies)',
    ],
  },
];

export function PricingPage(): JSX.Element {
  return (
    <div className="pricing">
      <header className="page-header" style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: 24 }}>
        <div className="title" style={{ alignItems: 'center', textAlign: 'center', width: '100%' }}>
          <h1 style={{ fontSize: 40, marginBottom: 12 }}>Pay in rupees. Stay in control.</h1>
          <span className="subtitle" style={{ maxWidth: 620, fontSize: 16, lineHeight: 1.5 }}>
            Vercel charges $20/mo and bills in USD. We charge ₹199/mo and bill in INR via UPI.
            No international card required. Same features, less paperwork.
          </span>
        </div>
      </header>

      <div className="founding-cta" role="region" aria-label="Founding member program">
        <div className="founding-cta-text">
          <div className="founding-cta-eyebrow">
            <IconBolt size={12} /> Founding members
          </div>
          <h2 style={{ margin: '6px 0 8px', fontSize: 22 }}>First 50 users get Pro free for 6 months</h2>
          <p className="muted small" style={{ margin: 0 }}>
            Limited to 50 slots. After 6 months, you choose to stay on Pro at ₹199/mo or drop back to Free.
            Founding members get direct access to the founder via email.
          </p>
        </div>
        <Link to="/founding" className="cta-primary" style={{ flexShrink: 0 }}>
          Claim a slot
        </Link>
      </div>

      <div className="tier-grid">
        {TIERS.map((t) => (
          <TierCard key={t.id} tier={t} />
        ))}
      </div>

      <section className="pricing-faq">
        <h2>Common questions</h2>
        <FAQ
          q="Do I need a credit card to start?"
          a="No. The Free tier is fully usable without any payment method. Pro and Team plans use Razorpay — you can pay via UPI, net banking, or any debit card. No international card required."
        />
        <FAQ
          q="What happens if I exceed my egress limit?"
          a="We'll email you when you hit 80% of the cap. Going over is fine — Pro caps at 500 GB and Team at 5 TB. We don't auto-bill overage; you'd be asked to upgrade before hitting a hard wall."
        />
        <FAQ
          q="Can I move from Free to Pro mid-month?"
          a="Yes, instantly. Razorpay handles proration. You keep the remaining time on Free days, and Pro starts immediately."
        />
        <FAQ
          q="Can I cancel Pro and keep my data?"
          a="Yes. Cancel anytime via the Billing page. Your projects stay on Free (with Free tier limits). Data is preserved for 30 days, then archived."
        />
        <FAQ
          q="Why ₹199 and not ₹299 like most SaaS?"
          a="Because we want paying customers, not gouged ones. ₹199 keeps Pro within reach of a student with a 5k monthly allowance."
        />
        <FAQ
          q="Is GST charged?"
          a="Yes, 18% GST applies on top of the listed price, billed via Razorpay's GST-compliant invoice."
        />
      </section>

      <section className="pricing-why">
        <h2>Why DEPLOX pricing looks like this</h2>
        <div className="why-grid">
          <WhyCard
            icon={<IconGlobe />}
            title="Built for India"
            body="UPI, INR, Hindi docs, IST support. Most deployment platforms are global-first; their Indian pricing is just USD with markup."
          />
          <WhyCard
            icon={<IconRocket />}
            title="Always-on free"
            body="Free tier has no cold start. Render free sleeps after 15 min; Vercel functions take 1-2s to wake. We don't."
          />
          <WhyCard
            icon={<IconShield />}
            title="No surprises"
            body="Hard egress limits with email alerts. No hidden overage fees. No auto-billing for unexpected usage."
          />
          <WhyCard
            icon={<IconUsers />}
            title="Team without seat fees"
            body="Vercel Pro charges $20/member. DEPLOX Team is ₹999 flat — invite 12 people or 50, same price."
          />
        </div>
      </section>
    </div>
  );
}

function TierCard({ tier }: { tier: Tier }): JSX.Element {
  return (
    <div className={`tier-card${tier.highlight ? ' tier-card-highlight' : ''}`}>
      {tier.highlight && <div className="tier-card-flag">Recommended</div>}
      <div className="tier-card-name">{tier.name}</div>
      <div className="tier-card-price">
        <span className="tier-card-price-amount">{tier.price}</span>
        <span className="tier-card-price-period">{tier.period}</span>
      </div>
      <p className="muted small" style={{ margin: '8px 0 16px' }}>
        {tier.tagline}
      </p>

      <div className="tier-card-limits">
        {tier.limits.map((l) => (
          <div className="tier-card-limit-row" key={l.label}>
            <span className="muted small">{l.label}</span>
            <span className="mono">{l.value}</span>
          </div>
        ))}
      </div>

      <ul className="tier-card-features">
        {tier.features.map((f) => (
          <li key={f}>
            <IconCheck size={12} />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <Link
        to={tier.cta.href}
        className={tier.highlight ? 'tier-card-cta primary' : 'tier-card-cta'}
      >
        {tier.cta.label}
      </Link>
    </div>
  );
}

function FAQ({ q, a }: { q: string; a: string }): JSX.Element {
  return (
    <details className="faq-item">
      <summary>{q}</summary>
      <p className="muted small" style={{ marginTop: 8 }}>{a}</p>
    </details>
  );
}

function WhyCard({
  icon,
  title,
  body,
}: {
  icon: JSX.Element;
  title: string;
  body: string;
}): JSX.Element {
  return (
    <div className="why-card">
      <span className="icon">{icon}</span>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}