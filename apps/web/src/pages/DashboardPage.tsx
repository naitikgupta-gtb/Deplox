import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Deployment, Project, User } from '@deplox/shared-types';
import { api } from '../lib/api';
import {
  IconExternalLink,
  FrameworkIcon,
  IconPlus,
  IconTrash,
  IconCheck,
  IconX,
  IconArrowUpRight,
} from '../components/Icon';
import { IconCircleDashed } from '../components/IconNav';

const FREE_PROJECT_LIMIT = 7;

export function DashboardPage({ user }: { user: User }): JSX.Element {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [deployments, setDeployments] = useState<Record<string, Deployment[]>>({});
  const [removing, setRemoving] = useState<string | null>(null);

  const refresh = () => {
    api
      .listProjects()
      .then(async (p) => {
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
      })
      .catch(() => setProjects([]));
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

  const activity = useMemo(() => {
    if (!projects) return [];
    const items: Array<{ project: Project; deployment: Deployment }> = [];
    for (const p of projects) {
      const d = deployments[p.id]?.[0];
      if (d) items.push({ project: p, deployment: d });
    }
    items.sort(
      (a, b) =>
        new Date(b.deployment.startedAt).getTime() - new Date(a.deployment.startedAt).getTime(),
    );
    return items.slice(0, 8);
  }, [projects, deployments]);

  return (
    <div className="dash-page">
      {/* Founding member banner — only on free + low project count */}
      {total <= 5 && (
        <div className="dash-founding-banner">
          <div>
            <strong>First 50 users get Pro for 6 months</strong>
            <span>· ₹11,940 value, free for 6 months in exchange for feedback.</span>
          </div>
          <Link to="/founding" className="dash-founding-link">
            Claim a slot <IconArrowUpRight size={12} />
          </Link>
        </div>
      )}

      <div className="dash-page-header">
        <h1>Overview</h1>
        <span className="dash-page-sub">Hi {user.displayName ?? user.username} — here's what you've deployed.</span>
      </div>

      <div className="dash-section-head">
        <h2>Projects</h2>
        {total > 0 && (
          <span className="dash-section-sub">
            {total} / {FREE_PROJECT_LIMIT} on Free
          </span>
        )}
      </div>

      {projects === null ? (
        <p className="muted">Loading…</p>
      ) : projects.length === 0 ? (
        <div className="dash-project-grid">
          <button
            type="button"
            className="dash-project-card dash-project-card--create"
            onClick={() => navigate('/new')}
          >
            <IconPlus size={20} />
            <span>Create new project</span>
            <span className="dash-project-card--create-sub">
              Connect a GitHub repo to deploy it in under two minutes.
            </span>
          </button>
        </div>
      ) : (
        <div className="dash-project-grid">
          {projects.map((p) => {
            const latest = deployments[p.id]?.[0];
            const isRemoving = removing === p.id;
            return (
              <Link
                to={`/projects/${p.id}`}
                key={p.id}
                className="dash-project-card"
              >
                <div className="dash-project-card-row">
                  <div className="dash-project-card-name">
                    {p.framework ? <FrameworkIcon framework={p.framework} size={14} /> : null}
                    {p.name}
                  </div>
                  <button
                    type="button"
                    className="dash-project-card-remove"
                    title="Remove project"
                    aria-label={`Remove project ${p.name}`}
                    disabled={isRemoving}
                    onClick={(e) => handleRemove(p, e)}
                  >
                    <IconTrash size={13} />
                  </button>
                </div>

                <StatusBadge deployment={latest} />

                <div className="dash-project-card-meta">
                  <span className="dash-project-card-repo">
                    {p.githubRepoFullName}
                  </span>
                  {p.customDomain && (
                    <span className="dash-project-card-domain">{p.customDomain}</span>
                  )}
                </div>

                {latest?.publicUrl && (
                  <div className="dash-project-card-url">
                    <IconExternalLink size={11} />
                    {latest.publicUrl.replace(/^https?:\/\//, '')}
                  </div>
                )}

                <div className="dash-project-card-foot">
                  <span>{latest ? timeAgo(latest.startedAt) : '—'}</span>
                  {latest?.commitSha && (
                    <span className="dash-project-card-sha">
                      {latest.commitSha.slice(0, 7)}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}

          <button
            type="button"
            className="dash-project-card dash-project-card--create"
            onClick={() => navigate('/new')}
            disabled={total >= FREE_PROJECT_LIMIT}
            title={total >= FREE_PROJECT_LIMIT ? 'Free plan limit reached' : 'Create a new project'}
          >
            <IconPlus size={20} />
            <span>Create new project</span>
          </button>
        </div>
      )}

      {activity.length > 0 && (
        <section className="dash-section" id="activity">
          <div className="dash-section-head">
            <h2>Activity</h2>
            <span className="dash-section-sub">latest {activity.length}</span>
          </div>
          <div className="dash-activity">
            {activity.map(({ project, deployment }) => (
              <Link
                to={`/projects/${project.id}/deployments/${deployment.id}`}
                key={deployment.id}
                className="dash-activity-item"
              >
                <span className="dash-activity-time">{timeAgo(deployment.startedAt)}</span>
                <StatusBadge deployment={deployment} compact />
                <span className="dash-activity-name">
                  <strong>{project.name}</strong>
                  <span className="muted"> · {deployment.commitSha.slice(0, 7)}</span>
                </span>
                <IconArrowUpRight size={13} className="dash-activity-arrow" />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StatusBadge({
  deployment,
  compact = false,
}: {
  deployment: Deployment | undefined;
  compact?: boolean;
}): JSX.Element {
  if (!deployment) {
    return (
      <span className="dash-badge dash-badge--muted">
        <IconCircleDashed size={12} /> {compact ? 'no deploys' : 'No deployments yet'}
      </span>
    );
  }
  if (deployment.status === 'running') {
    return (
      <span className="dash-badge dash-badge--ok">
        <IconCheck size={12} /> {compact ? 'live' : 'All services are up and running'}
      </span>
    );
  }
  if (deployment.status === 'failed') {
    return (
      <span className="dash-badge dash-badge--err">
        <IconX size={12} /> {compact ? 'failed' : 'Last deploy failed'}
      </span>
    );
  }
  if (deployment.status === 'building' || deployment.status === 'cloning' || deployment.status === 'detecting') {
    return (
      <span className="dash-badge dash-badge--warn">
        <IconCircleDashed size={12} /> {compact ? deployment.status : `Building — ${deployment.status}`}
      </span>
    );
  }
  if (deployment.status === 'queued') {
    return (
      <span className="dash-badge dash-badge--muted">
        <IconCircleDashed size={12} /> {compact ? 'queued' : 'Queued for deploy'}
      </span>
    );
  }
  return (
    <span className="dash-badge dash-badge--muted">
      <IconCircleDashed size={12} /> {compact ? deployment.status : deployment.status}
    </span>
  );
}

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