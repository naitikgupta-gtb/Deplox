import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Project, User } from '@deplox/shared-types';
import { api } from '../lib/api';
import {
  IconArrowUpRight,
  IconCheck,
  IconCreditCard,
  IconRocket,
  IconShield,
  IconWarning,
} from '../components/Icon';

interface BillingInfo {
  readonly plan: 'free' | 'pro' | 'team';
  readonly status: 'active' | 'past_due' | 'cancelled' | 'none';
  readonly currentPeriodEnd: string | null;
  readonly cancelAtPeriodEnd: boolean;
}

const PLAN_LIMITS = {
  free: { projects: 7, egressGb: 50, customDomain: false },
  pro: { projects: 25, egressGb: 500, customDomain: true },
  team: { projects: Infinity, egressGb: 5000, customDomain: true },
} as const;

const PLAN_PRICES = {
  free: { amount: 0, label: '₹0' },
  pro: { amount: 19900, label: '₹199/mo' },
  team: { amount: 99900, label: '₹999/mo' },
} as const;

export function BillingPage({ user }: { user: User }): JSX.Element {
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(): Promise<void> {
    try {
      const [b, p] = await Promise.all([
        api.getBilling(),
        api.listProjects().catch(() => [] as Project[]),
      ]);
      setBilling(b);
      setProjects(p);
    } catch (err) {
      setError(String(err));
    }
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  if (!billing) {
    return <p className="muted">Loading billing…</p>;
  }

  const limits = PLAN_LIMITS[billing.plan];
  const price = PLAN_PRICES[billing.plan];
  const projectsUsed = projects.length;
  const projectsPct = Math.min(100, (projectsUsed / limits.projects) * 100);

  return (
    <div className="billing">
      <header className="page-header">
        <div className="title">
          <h1>Billing</h1>
          <span className="subtitle">Logged in as <strong>{user.username}</strong></span>
        </div>
      </header>

      {error && <div className="form-error">{error}</div>}

      {/* Current plan card */}
      <section className="billing-card">
        <div className="billing-card-top">
          <div>
            <div className="billing-eyebrow">Current plan</div>
            <div className="billing-plan-name">
              {billing.plan === 'free' ? 'Free' : billing.plan === 'pro' ? 'Pro' : 'Team'}
            </div>
            <div className="billing-plan-price">{price.label}</div>
          </div>
          <div>
            <span className={`status status-${billing.status === 'active' ? 'running' : 'stopped'}`}>
              <span className="dot" /> {billing.status}
            </span>
          </div>
        </div>

        {billing.currentPeriodEnd && (
          <p className="muted small" style={{ marginTop: 12 }}>
            {billing.cancelAtPeriodEnd ? 'Cancels' : 'Renews'} on{' '}
            <strong>{new Date(billing.currentPeriodEnd).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</strong>
          </p>
        )}

        {billing.plan === 'free' && (
          <div className="billing-cta">
            <Link to="/pricing" className="cta-primary">
              <IconRocket size={14} /> Upgrade to Pro — ₹199/mo
            </Link>
            <Link to="/founding" className="cta-secondary">
              Or claim a free Pro slot →
            </Link>
          </div>
        )}

        {billing.plan !== 'free' && (
          <div className="billing-actions">
            <button
              className="ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api.openBillingPortal();
                  window.location.reload();
                } catch (err) {
                  setError(String(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <IconCreditCard size={13} /> {busy ? 'Opening…' : 'Manage subscription'}
            </button>
            <Link to="/pricing" className="cta-secondary">
              Compare plans →
            </Link>
          </div>
        )}
      </section>

      {/* Usage meters */}
      <section className="billing-card">
        <h2 style={{ marginBottom: 16, fontSize: 16, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-fg-muted)' }}>
          This month
        </h2>

        <UsageRow
          label="Projects"
          used={projectsUsed}
          limit={limits.projects}
          pct={projectsPct}
          unit=""
        />
        <UsageRow
          label="Egress"
          used={0}
          limit={limits.egressGb}
          pct={0}
          unit=" GB"
        />
      </section>

      {/* What's included */}
      <section className="billing-card">
        <h2 style={{ marginBottom: 16, fontSize: 16, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-fg-muted)' }}>
          Included in {billing.plan === 'free' ? 'Free' : billing.plan === 'pro' ? 'Pro' : 'Team'}
        </h2>
        <ul className="billing-bullets">
          <li><IconCheck size={13} /> {billing.plan === 'free' ? 'Up to' : ''} {limits.projects === Infinity ? 'unlimited' : limits.projects} project{limits.projects !== 1 ? 's' : ''}</li>
          <li><IconCheck size={13} /> {limits.egressGb} GB egress per month</li>
          <li><IconCheck size={13} /> {billing.plan === 'team' ? 'Unlimited collaborators' : billing.plan === 'pro' ? 'Single account (Team plan adds collaborators)' : 'Single account'}</li>
          <li><IconCheck size={13} /> {limits.customDomain ? 'Custom domain support' : 'Custom domain not included (Pro adds this)'}</li>
          <li><IconCheck size={13} /> Encrypted environment variables (AES-256-GCM)</li>
          <li><IconCheck size={13} /> Webhook auto-deploy with HMAC verification</li>
          {billing.plan !== 'free' && (
            <li><IconCheck size={13} /> Priority build queue (skip the line)</li>
          )}
          {billing.plan === 'team' && (
            <>
              <li><IconCheck size={13} /> Audit log for sensitive operations</li>
              <li><IconCheck size={13} /> Email support, IST hours</li>
            </>
          )}
        </ul>
      </section>

      {/* Invoice history (placeholder) */}
      <section className="billing-card">
        <h2 style={{ marginBottom: 16, fontSize: 16, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-fg-muted)' }}>
          Invoices
        </h2>
        {billing.plan === 'free' || !billing.currentPeriodEnd ? (
          <p className="muted small">No invoices yet — upgrade to Pro to start receiving GST-compliant monthly invoices.</p>
        ) : (
          <table className="env-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Amount</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{new Date(billing.currentPeriodEnd).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</td>
                <td className="mono">{price.label}</td>
                <td><span className="status status-running"><span className="dot" /> paid</span></td>
                <td><a className="link small" href="#">View</a></td>
              </tr>
            </tbody>
          </table>
        )}
      </section>

      {/* Trust signal */}
      <div className="billing-trust">
        <IconShield size={14} />
        <span className="small">
          Payments processed by Razorpay. Your card details never touch DEPLOX servers.
          Cancellable anytime, no questions asked.
        </span>
      </div>

      {billing.plan === 'free' && projectsUsed >= 5 && (
        <div className="banner mock" style={{ marginTop: 16 }}>
          <IconWarning size={14} />
          <span>
            You're using {projectsUsed} of {limits.projects} free projects.{' '}
            <Link to="/pricing" className="link">Upgrade to Pro</Link> to get 25 projects and 500 GB egress.
          </span>
        </div>
      )}
    </div>
  );
}

function UsageRow({
  label,
  used,
  limit,
  pct,
  unit,
}: {
  label: string;
  used: number;
  limit: number;
  pct: number;
  unit: string;
}): JSX.Element {
  const limitStr = limit === Infinity ? '∞' : `${limit}${unit}`;
  return (
    <div className="usage-row">
      <div className="usage-row-top">
        <span className="small">{label}</span>
        <span className="mono small">
          {used}{unit} / {limitStr}
        </span>
      </div>
      <div className="usage-bar">
        <div className="usage-bar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}