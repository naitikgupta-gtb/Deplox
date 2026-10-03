import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Deployment, Project, User } from '@deplox/shared-types';
import { api } from '../lib/api';
import {
  IconExternalLink,
  FrameworkBadge,
  FrameworkIcon,
  IconArrowRight,
  IconPlus,
  IconRocket,
} from '../components/Icon';

export function DashboardPage({ user }: { user: User }): JSX.Element {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [deployments, setDeployments] = useState<Record<string, Deployment[]>>({});

  useEffect(() => {
    api.listProjects().then(async (p) => {
      setProjects(p);
      // load latest deployment per project
      const map: Record<string, Deployment[]> = {};
      for (const proj of p) {
        try {
          map[proj.id] = await api.listDeployments(proj.id);
        } catch {
          map[proj.id] = [];
        }
      }
      setDeployments(map);
    }).catch(() => setProjects([]));
  }, []);

  const total = projects?.length ?? 0;
  const running = Object.values(deployments).flat().filter((d) => d.status === 'running').length;
  const failed = Object.values(deployments).flat().filter((d) => d.status === 'failed').length;
  const lastDeploy = Object.values(deployments).flat()
    .map((d) => new Date(d.startedAt).getTime())
    .reduce((a, b) => Math.max(a, b), 0);
  const lastDeployStr = lastDeploy
    ? new Date(lastDeploy).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    : '—';

  return (
    <div className="dashboard">
      <header className="page-header">
        <div className="title">
          <h1>Projects</h1>
          <span className="subtitle">Logged in as <strong>{user.username}</strong></span>
        </div>
        <div className="actions">
          <Link to="/new" className="primary" style={btnPrimary}>
            <IconPlus size={14} /> New project
          </Link>
        </div>
      </header>

      <div className="summary">
        <div className="card">
          <div className="label">Projects</div>
          <div className="value">{total}</div>
          <div className="sub">{total === 0 ? 'no projects yet' : `across ${total} ${total === 1 ? 'repo' : 'repos'}`}</div>
        </div>
        <div className="card">
          <div className="label">Running</div>
          <div className="value" style={{ color: running > 0 ? 'var(--color-running)' : undefined }}>{running}</div>
          <div className="sub">{running === 0 ? 'all quiet' : 'live deployments'}</div>
        </div>
        <div className="card">
          <div className="label">Failed</div>
          <div className="value" style={{ color: failed > 0 ? 'var(--color-failed)' : undefined }}>{failed}</div>
          <div className="sub">need attention</div>
        </div>
        <div className="card">
          <div className="label">Last deploy</div>
          <div className="value" style={{ fontSize: 16 }}>{lastDeployStr}</div>
          <div className="sub">most recent attempt</div>
        </div>
      </div>

      {projects === null ? (
        <p className="muted">Loading…</p>
      ) : projects.length === 0 ? (
        <div className="empty-state">
          <IconRocket size={28} />
          <h3>No projects yet</h3>
          <p>Connect a GitHub repo to deploy it in under two minutes.</p>
          <Link to="/new" className="primary" style={btnPrimary}>
            <IconPlus size={14} /> Connect a GitHub repo
          </Link>
        </div>
      ) : (
        <div className="project-grid">
          {projects.map((p) => {
            const latest = deployments[p.id]?.[0];
            return (
              <Link to={`/projects/${p.id}`} key={p.id} style={{ color: 'inherit' }}>
                <div className="project-card">
                  <div className="top">
                    <div>
                      <div className="name">{p.name}</div>
                      <div className="repo">{p.githubRepoFullName}</div>
                    </div>
                    {latest && (
                      <span className={`status status-${latest.status}`}>
                        <span className="dot" /> {latest.status}
                      </span>
                    )}
                  </div>

                  <div className="meta">
                    <span className="fw">
                      {p.framework ? <FrameworkIcon framework={p.framework} size={12} /> : null}
                      {p.framework ?? 'auto'}
                    </span>
                    {p.customDomain && (
                      <span className="faint">· {p.customDomain}</span>
                    )}
                    {latest && (
                      <span className="faint" style={{ marginLeft: 'auto' }}>
                        {timeAgo(latest.startedAt)}
                      </span>
                    )}
                  </div>

                  <div className="actions">
                    {latest?.publicUrl && (
                      <span className="mono small" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-fg-muted)' }}>
                        <IconExternalLink size={11} /> {latest.publicUrl.replace(/^https?:\/\//, '')}
                      </span>
                    )}
                    <span style={{ marginLeft: 'auto', color: 'var(--color-fg-faint)' }}>
                      <IconArrowRight size={14} />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

const btnPrimary: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 14px',
  background: 'var(--color-primary)',
  color: 'var(--color-primary-fg)',
  borderRadius: 'var(--radius)',
  fontWeight: 500,
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}