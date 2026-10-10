import { Link } from 'react-router-dom';
import { IconArrowUpRight, IconCheck, IconGithub, IconWarning } from '../components/Icon';
import { useMeta } from '../lib/use-meta';

export function ChangelogPage(): JSX.Element {
  useMeta({
    title: 'Changelog — DEPLOX',
    description:
      'Every release, fix, and breaking change in DEPLOX. Versioned history with date, tag, highlights, and migration notes.',
    path: '/changelog',
  });
  return (

interface ReleaseEntry {
  readonly version: string;
  readonly date: string;
  readonly title: string;
  readonly tag: 'shipping' | 'fix' | 'breaking' | 'security';
  readonly highlights: ReadonlyArray<string>;
  readonly fixes?: ReadonlyArray<string>;
  readonly note?: string;
}

const RELEASES: ReadonlyArray<ReleaseEntry> = [
  {
    version: '0.4.0',
    date: '2026-10-05',
    title: 'Pricing page + founding member program',
    tag: 'shipping',
    highlights: [
      'Public pricing page (Free / ₹199 Pro / ₹999 Team)',
      'Founding member program: first 50 users get Pro free for 6 months',
      'Billing page with usage meters (projects, egress)',
      'Updated UI: Dashboard activity feed, founding banner, pricing preview',
      'New icons: Users, CreditCard, Shield, Globe, Bolt, +12 more',
    ],
  },
  {
    version: '0.3.0',
    date: '2026-09-28',
    title: 'Custom domains + Caddy integration',
    tag: 'shipping',
    highlights: [
      'Caddy admin API client (registerDomainRoute, unregisterDomainRoute, primeCaddyRoutes)',
      'Custom domain field with DNS guidance',
      'Auto-registration when deployment goes "running"',
      'Auto-cleanup when deployment stops or project deleted',
      'Caddyfile uses host.docker.internal:5173 to reach the host Vite dev server',
    ],
    fixes: [
      'Caddyfile syntax error (:8000 was inside a global options block)',
      'Caddy admin API is HTTPS by default — verified separately',
    ],
  },
  {
    version: '0.2.0',
    date: '2026-09-15',
    title: 'Webhooks + auto-deploy',
    tag: 'shipping',
    highlights: [
      'GitHub webhook signature verification (HMAC-SHA256)',
      'Auto-deploy on push to configured branch',
      'One-time secret reveal + rotate endpoint',
      'Per-project webhook secret, encrypted at rest',
    ],
    fixes: [
      'Fixed webhook 502 when tunnel URL was stale',
      'Webhook secret now generated during project create (no orphan secrets)',
    ],
  },
  {
    version: '0.1.1',
    date: '2026-09-12',
    title: 'Health check + tunnel friendliness',
    tag: 'fix',
    highlights: [
      'Orchestrator waits up to 30s for app to listen before marking "running"',
      'Failed deployments include recent container logs in error message',
      'Vite dev server: host 0.0.0.0 + allowedHosts: true (Cloudflare Tunnel compatible)',
      'Helper: pnpm tunnel:public for zero-cost public URL via Cloudflare Quick Tunnel',
    ],
    note: 'This was the fix for "I clicked Deploy and it says running but the app is dead".',
  },
  {
    version: '0.1.0',
    date: '2026-08-25',
    title: 'Initial public release',
    tag: 'shipping',
    highlights: [
      'GitHub OAuth login',
      'Project create + deployment pipeline',
      'Docker-based runtime with framework auto-detection (React, Next.js, Node, Python, Go, Static)',
      'Encrypted environment variables (AES-256-GCM)',
      'Live build logs + instant rollback',
      'Cloudflare Tunnel integration for public HTTPS URLs',
    ],
  },
];

const TAG_LABELS: Record<ReleaseEntry['tag'], string> = {
  shipping: 'Shipping',
  fix: 'Fixes',
  breaking: 'Breaking',
  security: 'Security',
};

export function ChangelogPage(): JSX.Element {
  return (
    <div className="changelog">
      <header className="page-header" style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: 24 }}>
        <div className="title">
          <h1>Changelog</h1>
          <span className="subtitle">What we shipped, what we broke, what we fixed. Honest, dated, in order.</span>
        </div>
      </header>

      <div className="changelog-rss">
        <a href="/changelog/feed.xml" className="link small">
          <IconArrowUpRight size={11} /> RSS feed
        </a>
        <a
          href="https://github.com/deplox/deplox/releases"
          target="_blank"
          rel="noreferrer"
          className="link small"
          style={{ marginLeft: 16 }}
        >
          <IconGithub size={11} /> GitHub releases
        </a>
      </div>

      <ol className="changelog-list">
        {RELEASES.map((rel) => (
          <li key={rel.version} className="changelog-entry">
            <div className="changelog-entry-aside">
              <div className="changelog-version">{rel.version}</div>
              <div className="muted small">{rel.date}</div>
              <div className={`changelog-tag changelog-tag-${rel.tag}`}>
                {TAG_LABELS[rel.tag]}
              </div>
            </div>

            <div className="changelog-entry-body">
              <h2 style={{ fontSize: 20, marginBottom: 12 }}>{rel.title}</h2>

              <ul className="changelog-bullets">
                {rel.highlights.map((h, i) => (
                  <li key={i}><IconCheck size={12} /> <span>{h}</span></li>
                ))}
              </ul>

              {rel.fixes && rel.fixes.length > 0 && (
                <details className="changelog-fixes">
                  <summary>{rel.fixes.length} fix{rel.fixes.length === 1 ? '' : 'es'} (click to expand)</summary>
                  <ul className="changelog-bullets" style={{ marginTop: 8 }}>
                    {rel.fixes.map((f, i) => (
                      <li key={i}><IconCheck size={12} /> <span>{f}</span></li>
                    ))}
                  </ul>
                </details>
              )}

              {rel.note && (
                <div className="changelog-note">
                  <IconWarning size={12} />
                  <span>{rel.note}</span>
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>

      <p className="muted small" style={{ marginTop: 32 }}>
        Older releases (0.0.x) not shown. DEPLOX launched publicly on 2026-08-25.{' '}
        <Link to="/about" className="link">Read the founding story</Link>.
      </p>
    </div>
  );
}