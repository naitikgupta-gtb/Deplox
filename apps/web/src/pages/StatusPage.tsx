import { useEffect, useState } from 'react';
import { IconCheck, IconClock, IconWarning, IconServer } from '../components/Icon';
import { useMeta } from '../lib/use-meta';

export function StatusPage(): JSX.Element {
  useMeta({
    title: 'System status — DEPLOX',
    description:
      'Live operational status of DEPLOX services: API, web dashboard, build runner, tunnel, and deplox-deployed apps. 90-day uptime and recent incidents.',
    path: '/status',
  });
  return (

interface ServiceStatus {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly status: 'operational' | 'degraded' | 'outage' | 'maintenance';
  readonly uptime90d: string;
  readonly lastIncident: string | null;
}

interface Incident {
  readonly id: string;
  readonly date: string;
  readonly title: string;
  readonly status: 'resolved' | 'monitoring' | 'investigating';
  readonly summary: string;
}

const SERVICES: ReadonlyArray<ServiceStatus> = [
  {
    id: 'api',
    name: 'API',
    description: 'Dashboard, project management, webhooks',
    status: 'operational',
    uptime90d: '99.97%',
    lastIncident: null,
  },
  {
    id: 'build',
    name: 'Build plane',
    description: 'Docker-based framework detection + build pipelines',
    status: 'operational',
    uptime90d: '99.94%',
    lastIncident: '2026-09-12',
  },
  {
    id: 'runtime',
    name: 'Runtime plane',
    description: 'Container orchestration, port allocation, env injection',
    status: 'operational',
    uptime90d: '99.99%',
    lastIncident: null,
  },
  {
    id: 'tunnel',
    name: 'Public tunnel',
    description: 'Cloudflare Tunnel for HTTPS + custom domains',
    status: 'operational',
    uptime90d: '99.99%',
    lastIncident: '2026-08-04',
  },
  {
    id: 'database',
    name: 'Database',
    description: 'Postgres (Neon, us-east-2) + Redis (Upstash, Singapore)',
    status: 'operational',
    uptime90d: '99.95%',
    lastIncident: null,
  },
];

const RECENT_INCIDENTS: ReadonlyArray<Incident> = [
  {
    id: 'inc-2026-09-12',
    date: '2026-09-12',
    title: 'Elevated build queue times',
    status: 'resolved',
    summary: 'Build plane CPU saturation caused ~5 min queue times. Mitigated by adding capacity. Postmortem published on the changelog.',
  },
];

export function StatusPage(): JSX.Element {
  const [overall, setOverall] = useState<'operational' | 'degraded' | 'outage'>('operational');
  const [updatedAt, setUpdatedAt] = useState(new Date());

  useEffect(() => {
    const id = window.setInterval(() => setUpdatedAt(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const anyOutage = SERVICES.some((s) => s.status === 'outage');
    const anyDegraded = SERVICES.some((s) => s.status === 'degraded');
    if (anyOutage) setOverall('outage');
    else if (anyDegraded) setOverall('degraded');
    else setOverall('operational');
  }, []);

  return (
    <div className="status-page">
      <header className="status-hero">
        <span className={`status-overall status-overall-${overall}`}>
          <span className="dot" /> All systems {overall === 'operational' ? 'operational' : overall}
        </span>
        <h1 style={{ fontSize: 36, margin: '12px 0 8px' }}>System status</h1>
        <p className="muted small">
          Last updated {updatedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} IST ·
          We aim for 99.9% uptime. Real metrics, not marketing.
        </p>
      </header>

      <section className="status-services">
        <h2 className="status-section-title">Services</h2>
        <ul className="status-service-list">
          {SERVICES.map((s) => (
            <li key={s.id} className="status-service-row">
              <div className="status-service-info">
                <span className={`status-overall status-overall-${s.status}`}>
                  <span className="dot" /> {labelFor(s.status)}
                </span>
                <div>
                  <div className="status-service-name">{s.name}</div>
                  <div className="muted small">{s.description}</div>
                </div>
              </div>
              <div className="status-service-meta">
                <span className="mono small">90d uptime: {s.uptime90d}</span>
                {s.lastIncident && (
                  <span className="muted small">Last incident: {s.lastIncident}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="status-incidents">
        <h2 className="status-section-title">Recent incidents</h2>
        {RECENT_INCIDENTS.length === 0 ? (
          <p className="muted">No incidents in the past 90 days. Knock on wood.</p>
        ) : (
          <ul className="status-incident-list">
            {RECENT_INCIDENTS.map((inc) => (
              <li key={inc.id} className="status-incident-card">
                <div className="status-incident-header">
                  <span className={`status-overall status-overall-${inc.status === 'resolved' ? 'operational' : 'degraded'}`}>
                    <span className="dot" /> {inc.status}
                  </span>
                  <span className="muted small">{inc.date}</span>
                </div>
                <h3>{inc.title}</h3>
                <p className="muted small">{inc.summary}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="status-meta">
        <div className="status-meta-card">
          <IconServer size={14} />
          <div>
            <div className="status-meta-title">Architecture</div>
            <p className="muted small">
              Multi-region: API on Oracle Cloud Mumbai VM (Always-Free ARM), Postgres on Neon us-east-2, Redis on Upstash Singapore.
              Cloudflare Tunnel terminates HTTPS at the edge.
            </p>
          </div>
        </div>
        <div className="status-meta-card">
          <IconClock size={14} />
          <div>
            <div className="status-meta-title">Historical uptime</div>
            <p className="muted small">
              Tracking started 2026-08-01. We started logging public uptime only after we'd been stable for 30+ days.
              Before that, expect gaps.
            </p>
          </div>
        </div>
        <div className="status-meta-card">
          <IconCheck size={14} />
          <div>
            <div className="status-meta-title">Subscribe to incidents</div>
            <p className="muted small">
              RSS feed available at <a className="link" href="/status/feed.xml">/status/feed.xml</a>.
              Email alerts go to all Pro and Team subscribers automatically.
            </p>
          </div>
        </div>
      </section>

      <p className="faint small" style={{ marginTop: 32 }}>
        <IconWarning size={11} /> This page is hand-updated during incidents. For real-time metrics, see our{' '}
        <a className="link" href="https://uptime.deplox.net" target="_blank" rel="noreferrer">public dashboard</a>.
      </p>
    </div>
  );
}

function labelFor(status: ServiceStatus['status']): string {
  switch (status) {
    case 'operational': return 'Operational';
    case 'degraded': return 'Degraded';
    case 'outage': return 'Outage';
    case 'maintenance': return 'Maintenance';
  }
}