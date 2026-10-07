import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Deployment, Project, User } from '@deplox/shared-types';
import { api } from '../lib/api';
import {
  IconBolt,
  IconExternalLink,
  FrameworkIcon,
  IconArrowRight,
  IconPlus,
  IconRocket,
  IconTrash,
} from '../components/Icon';

const FREE_PROJECT_LIMIT = 7;

export function DashboardPage({ user }: { user: User }): JSX.Element {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [deployments, setDeployments] = useState<Record<string, Deployment[]>>({});
  const [removing, setRemoving] = useState<string | null>(null);

  const refresh = () => {
    api.listProjects().then(async (p) => {
      setProjects(p);
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
  };

  useEffect(() => {
    refresh();
  }, []);

  async function handleRemove(p: Project, ev: React.MouseEvent): Promise<void> {
    ev.preventDefault();
    ev.stopPropagation();
    const ok = window.confirm(
      `Remove project "${p.name}"?\n\nThis will:\n` +
        `  • Stop all running deployments\n` +
        `  • Delete all environment variables\n` +
        `  • Delete all deployment history\n` +
        `  • Remove the Caddy custom-domain route\n\n` +
        `This cannot be undone. The GitHub repo is untouched.`,
    );
    if (!ok) return;
    setRemoving(p.id);
    try {
      await api.deleteProject(p.id);
      refresh();
    } catch (e) {
      window.alert(`Failed to remove: ${(e as Error).message ?? e}`);
    } finally {
      setRemoving(null);
    }
  }

  const total = projects?.length ?? 0;
  const running = Object.values(deployments).flat().filter((d) => d.status === 'running').length;
  const failed = Object.values(deployments).flat().filter((d) => d.status === 'failed').length;
  const lastDeploy = Object.values(deployments).flat()
    .map((d) => new Date(d.startedAt).getTime())
    .reduce((a, b) => Math.max(a, b), 0);
  const lastDeployStr = lastDeploy
    ? new Date(lastDeploy).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    : '—';

  const projectPct = useMemo(
    () => Math.min(100, (total / FREE_PROJECT_LIMIT) * 100),
    [total],
  );

  // Build a recent-activity feed: latest deployment per project, sorted by time.
  const activity = useMemo(() => {
    if (!projects) return [];
    const items: Array<{ project: Project; deployment: Deployment }> = [];
    for (const p of projects) {
      const d = deployments[p.id]?.[0];
      if (d) items.push({ project: p, deployment: d });
    }
    items.sort((a, b) =>
      new Date(b.deployment.startedAt).getTime() - new Date(a.deployment.startedAt).getTime()
    );
    return items.slice(0, 6);
  }, [projects, deployments]);

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

      {/* Founding member banner — only on free + low project count */}
      {total <= 5 && (
        <div className="founding-banner">
          <div className="founding-banner-text">
            <h3>First 50 users get Pro for 6 months</h3>
            <p>Claim your slot before they're gone. ₹11,940 value, free for 6 months in exchange for feedback.</p>
          </div>
          <Link to="/founding" className="cta-primary" style={{ fontSize: 13, padding: '8px 14px' }}>
            <IconBolt size={13} /> Claim a slot
          </Link>
        </div>
      )}

      <div className="summary">
        <div className="card">
          <div className="label">Projects</div>
          <div className="value">{total} <span style={{ fontSize: 14, color: 'var(--color-fg-faint)', fontWeight: 400 }}>/ {FREE_PROJECT_LIMIT}</span></div>
          <div className="usage-bar" style={{ marginTop: 8 }}>
            <div className="usage-bar-fill" style={{ width: `${projectPct}%` }} />
          </div>
          <div className="sub">{total === 0 ? 'no projects yet' : `${FREE_PROJECT_LIMIT - total} slots left on Free`}</div>
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
            const isRemoving = removing === p.id;
            return (
              <Link to={`/projects/${p.id}`} key={p.id} style={{ color: 'inherit' }}>
                <div className="project-card">
                  <div className="top">
                    <div>
                      <div className="name">{p.name}</div>
                      <div className="repo">{p.githubRepoFullName}</div>
                    </div>
                    <div className="top-right">
                      {latest && (
                        <span className={`status status-${latest.status}`}>
                          <span className="dot" /> {latest.status}
                        </span>
                      )}
                      <button
                        type="button"
                        className="icon-btn danger"
                        title="Remove project"
                        aria-label={`Remove project ${p.name}`}
                        disabled={isRemoving}
                        onClick={(e) => handleRemove(p, e)}
                      >
                        <IconTrash size={14} />
                      </button>
                    </div>
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

      {activity.length > 0 && (
        <section className="activity-feed">
          <h2>Recent activity</h2>
          {activity.map(({ project, deployment }) => (
            <Link
              to={`/projects/${project.id}/deployments/${deployment.id}`}
              key={deployment.id}
              style={{ color: 'inherit' }}
            >
              <div className="activity-item">
                <span className="time">{timeAgo(deployment.startedAt)}</span>
                <span className={`status status-${deployment.status}`} style={{ flexShrink: 0 }}>
                  <span className="dot" /> {deployment.status}
                </span>
                <span className="body">
                  <strong>{project.name}</strong>
                  <span className="muted"> · {deployment.commitSha.slice(0, 7)}</span>
                </span>
                <span style={{ color: 'var(--color-fg-faint)' }}>
                  <IconArrowRight size={12} />
                </span>
              </div>
            </Link>
          ))}
        </section>
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