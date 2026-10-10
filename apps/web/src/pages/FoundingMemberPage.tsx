import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { IconBolt, IconCheck, IconGithub } from '../components/Icon';
import { useMeta } from '../lib/use-meta';

interface FoundingMemberInput {
  readonly email: string;
  readonly githubUsername: string;
  readonly useCase: string;
}

interface FoundingMemberResponse {
  readonly ok: boolean;
  readonly slotNumber: number;
  readonly remainingSlots: number;
  readonly message?: string;
}

const SLOTS_TOTAL = 50;

export function FoundingMemberPage(): JSX.Element {
  useMeta({
    title: 'Founding Member — 6 months of DEPLOX Pro free',
    description:
      'The first 50 DEPLOX users get Pro free for 6 months: unlimited projects, custom domains, priority support, and a direct line to the founder.',
    path: '/founding',
  });
  const [form, setForm] = useState<FoundingMemberInput>({
    email: '',
    githubUsername: '',
    useCase: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<FoundingMemberResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  // Optional: ping API for live remaining slot count (falls back gracefully if endpoint missing)
  useEffect(() => {
    api
      .foundingSlotsRemaining()
      .then((r) => setRemaining(r.remaining))
      .catch(() => setRemaining(null));
  }, []);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.becomeFoundingMember(form);
      setSuccess(res);
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="founding-success">
        <div className="founding-success-icon">
          <IconCheck size={28} />
        </div>
        <h1 style={{ fontSize: 32, marginBottom: 8 }}>You're founding member #{success.slotNumber}</h1>
        <p className="muted" style={{ maxWidth: 520, margin: '0 auto 24px' }}>
          We'll email you within 24 hours to confirm. Your account will be upgraded to Pro
          (free for 6 months) as soon as we verify your GitHub username. After 6 months,
          you can stay on Pro at ₹199/mo or fall back to Free.
        </p>
        <Link to="/dashboard" className="cta-primary">
          Go to dashboard
        </Link>
      </div>
    );
  }

  const slotsLeft = remaining ?? SLOTS_TOTAL;
  const slotsTaken = SLOTS_TOTAL - slotsLeft;
  const pct = (slotsTaken / SLOTS_TOTAL) * 100;

  return (
    <div className="founding">
      <header className="founding-hero">
        <div className="founding-hero-eyebrow">
          <IconBolt size={12} /> Founding members
        </div>
        <h1 style={{ fontSize: 48, letterSpacing: '-0.03em', lineHeight: 1.05 }}>
          Pro plan, free for 6 months.<br />
          <span style={{ color: 'var(--color-fg-muted)' }}>For the first 50.</span>
        </h1>
        <p className="lede" style={{ maxWidth: 600, margin: '20px auto 32px' }}>
          We're launching DEPLOX as a paid product. Before we go wide, we're giving
          50 founding members Pro for free — half a year of unlimited projects,
          custom domains, priority builds, in exchange for feedback and a public testimonial.
        </p>

        <div className="founding-meter">
          <div className="founding-meter-track">
            <div className="founding-meter-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="founding-meter-labels">
            <span><strong>{slotsTaken}</strong> of {SLOTS_TOTAL} claimed</span>
            <span className="muted"><strong>{slotsLeft}</strong> slots left</span>
          </div>
        </div>
      </header>

      <div className="founding-grid">
        <form className="founding-form" onSubmit={submit}>
          <h2 style={{ marginBottom: 4, fontSize: 18 }}>Claim your slot</h2>
          <p className="muted small" style={{ marginBottom: 20 }}>
            We'll verify your GitHub username before activating Pro.
          </p>

          <label>
            <span className="label-text">Email</span>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="you@example.com"
              disabled={submitting}
            />
            <span className="help">For confirmation email and Pro activation notice.</span>
          </label>

          <label>
            <span className="label-text">GitHub username</span>
            <input
              required
              value={form.githubUsername}
              onChange={(e) => setForm({ ...form, githubUsername: e.target.value })}
              placeholder="your-handle"
              pattern="[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}"
              disabled={submitting}
            />
            <span className="help">We'll cross-check that the username exists.</span>
          </label>

          <label>
            <span className="label-text">What will you deploy?</span>
            <textarea
              required
              value={form.useCase}
              onChange={(e) => setForm({ ...form, useCase: e.target.value })}
              placeholder="A side project, a college assignment, a client website… (1-2 sentences)"
              rows={3}
              minLength={10}
              maxLength={500}
              disabled={submitting}
            />
            <span className="help">Helps us prioritise features. Honest answers only — we don't pick favorites.</span>
          </label>

          {error && <div className="form-error">{error}</div>}

          <div className="form-actions">
            <button type="submit" className="primary" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Claim my slot'}
            </button>
            <span className="muted small">
              No spam. One email when your slot is verified, then monthly product updates.
            </span>
          </div>
        </form>

        <aside className="founding-side">
          <h3 style={{ marginBottom: 12, fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-fg-muted)' }}>
            What you get
          </h3>
          <ul className="founding-bullets">
            <li><IconCheck size={13} /> Pro plan for 6 months (₹11,940 value)</li>
            <li><IconCheck size={13} /> Up to 25 projects</li>
            <li><IconCheck size={13} /> 500 GB egress / month</li>
            <li><IconCheck size={13} /> Free custom domain</li>
            <li><IconCheck size={13} /> Priority build queue</li>
            <li><IconCheck size={13} /> Direct email line to the founder</li>
            <li><IconCheck size={13} /> Public "Built with DEPLOX" badge</li>
          </ul>

          <div className="founding-divider" />

          <h3 style={{ marginBottom: 12, fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-fg-muted)' }}>
            What we ask
          </h3>
          <ul className="founding-bullets">
            <li><IconCheck size={13} /> Honest feedback on the dashboard UX</li>
            <li><IconCheck size={13} /> One testimonial (text or tweet) after 30 days</li>
            <li><IconCheck size={13} /> Permission to use your GitHub project as a case study</li>
          </ul>
        </aside>
      </div>

      <div className="founding-trust">
        <p className="faint small" style={{ marginBottom: 12 }}>
          Already have an account?
        </p>
        <Link to="/auth/github?return_to=/dashboard" className="login">
          <IconGithub size={14} />
          Log in with GitHub
        </Link>
      </div>
    </div>
  );
}