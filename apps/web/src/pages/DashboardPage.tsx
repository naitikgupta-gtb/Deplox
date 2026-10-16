import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { Deployment, Project, User } from '@deplox/shared-types';
import { api, type WebhookInfo } from '../lib/api';
import {
  IconExternalLink,
  FrameworkIcon,
  IconPlus,
  IconTrash,
  IconCheck,
  IconX,
  IconArrowUpRight,
  IconCopy,
  IconRefresh,
  IconChart,
  IconTrendingUp,
  IconShieldCheck,
} from '../components/Icon';
import { IconCircleDashed, IconActivity, IconWebhooks, IconBell } from '../components/IconNav';

const FREE_PROJECT_LIMIT = 7;

type Section = 'overview' | 'activity' | 'webhooks' | 'observability' | 'notifications' | 'settings';

function sectionFromHash(hash: string): Section {
  const h = hash.replace(/^#/, '');
  switch (h) {
    case 'activity':
      return 'activity';
    case 'webhooks':
      return 'webhooks';
    case 'observability':
      return 'observability';
    case 'notifications':
      return 'notifications';
    case 'settings':
      return 'settings';
    default:
      return 'overview';
  }
}

export function DashboardPage({ user }: { user: User }): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('q') ?? '';
  const section = sectionFromHash(location.hash);

  const [projects, setProjects] = useState<Project[] | null>(null);
  const [deployments, setDeployments] = useState<Record<string, Deployment[]>>({});
  const [removing, setRemoving] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<Project | null>(null);

  const filteredProjects = useMemo(() => {
    if (!projects) return null;
    if (!search.trim()) return projects;
    const q = search.trim().toLowerCase();
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.githubRepoFullName.toLowerCase().includes(q) ||
        (p.customDomain ?? '').toLowerCase().includes(q),
    );
  }, [projects, search]);

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

  // For "Activity" hash, scroll to the section after data loads.
  useEffect(() => {
    if (section === 'activity' && projects !== null) {
      const el = document.getElementById('activity');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [section, projects]);

  async function handleRemove(p: Project, ev: React.MouseEvent): Promise<void> {
    ev.preventDefault();
    ev.stopPropagation();
    setConfirmRemove(p);
  }

  async function confirmRemoveProject(): Promise<void> {
    if (!confirmRemove) return;
    const p = confirmRemove;
    setConfirmRemove(null);
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

  if (section === 'webhooks') {
    return <WebhooksSection projects={projects} />;
  }
  if (section === 'observability') {
    return <ObservabilitySection projects={projects} deployments={deployments} />;
  }
  if (section === 'notifications') {
    return <NotificationsSection user={user} />;
  }
  if (section === 'settings') {
    return <SettingsSection user={user} />;
  }

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

      <OverviewUsageStats projects={projects} deployments={deployments} />

      <RecentPreviews projects={projects} deployments={deployments} />

      <AlertsCard />

      <div className="dash-section-head">
        <h2>Projects</h2>
        {total > 0 && (
          <span className="dash-section-sub">
            {search && filteredProjects
              ? `${filteredProjects.length} of ${total}`
              : `${total} / ${FREE_PROJECT_LIMIT} on Free`}
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
      ) : filteredProjects && filteredProjects.length === 0 ? (
        <div className="dash-empty-search">
          <p className="muted">No projects match <code>{search}</code>.</p>
          <button
            type="button"
            className="ghost"
            onClick={() => setSearchParams((p) => { p.delete('q'); return p; }, { replace: true })}
          >
            Clear search
          </button>
        </div>
      ) : (
        <div className="dash-project-grid">
          {(filteredProjects ?? projects).map((p) => {
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
                    <IconTrash size={15} strokeWidth={2} />
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

      {confirmRemove ? (
        <RemoveProjectModal
          project={confirmRemove}
          busy={removing === confirmRemove.id}
          onConfirm={confirmRemoveProject}
          onCancel={() => setConfirmRemove(null)}
        />
      ) : null}
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

// =============================================================================
// Webhooks section
// =============================================================================

function WebhooksSection({ projects }: { projects: Project[] | null }): JSX.Element {
  if (projects === null) {
    return (
      <div className="dash-page">
        <PageHeader
          icon={<IconWebhooks size={16} />}
          title="Webhooks"
          subtitle="Per-project GitHub webhook URLs and HMAC secrets used to trigger auto-deploys."
        />
        <p className="muted">Loading…</p>
      </div>
    );
  }
  if (projects.length === 0) {
    return (
      <div className="dash-page">
        <PageHeader
          icon={<IconWebhooks size={16} />}
          title="Webhooks"
          subtitle="Per-project GitHub webhook URLs and HMAC secrets used to trigger auto-deploys."
        />
        <EmptyState
          message="No projects yet — create one to see its webhook configuration."
        />
      </div>
    );
  }
  return (
    <div className="dash-page">
      <PageHeader
        icon={<IconWebhooks size={16} />}
        title="Webhooks"
        subtitle="Per-project GitHub webhook URLs and HMAC secrets used to trigger auto-deploys."
      />
      <div className="dash-webhook-list">
        {projects.map((p) => (
          <ProjectWebhookCard key={p.id} project={p} />
        ))}
      </div>
    </div>
  );
}

function ProjectWebhookCard({ project }: { project: Project }): JSX.Element {
  const [info, setInfo] = useState<WebhookInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [copied, setCopied] = useState<'url' | 'secret' | null>(null);

  async function load(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const w = await api.getWebhook(project.id);
      setInfo(w);
    } catch (e) {
      setError((e as Error).message ?? 'Failed to load webhook');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [project.id]);

  async function rotate(): Promise<void> {
    if (!info) return;
    const ok = window.confirm(
      'Rotate the webhook secret? The old secret will stop working immediately — update GitHub with the new one.',
    );
    if (!ok) return;
    setRotating(true);
    try {
      const next = await api.rotateWebhook(project.id);
      setInfo(next);
    } catch (e) {
      window.alert(`Failed to rotate: ${(e as Error).message ?? e}`);
    } finally {
      setRotating(false);
    }
  }

  async function copy(value: string, which: 'url' | 'secret'): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      setTimeout(() => setCopied((c) => (c === which ? null : c)), 1400);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="dash-webhook-card">
      <div className="dash-webhook-card-head">
        <div>
          <div className="dash-webhook-card-name">{project.name}</div>
          <div className="dash-webhook-card-repo">{project.githubRepoFullName}</div>
        </div>
        <Link to={`/projects/${project.id}`} className="dash-webhook-card-link">
          Open project <IconArrowUpRight size={12} />
        </Link>
      </div>

      {loading && <p className="muted small">Loading…</p>}
      {error && <p className="error small">{error}</p>}

      {info && (
        <>
          <div className="kv dash-webhook-kv">
            <div className="kv-label">Payload URL</div>
            <div className="kv-value">
              <code>{info.url}</code>
              <button
                type="button"
                className="icon-btn"
                onClick={() => copy(info.url, 'url')}
                aria-label="Copy webhook URL"
                title={copied === 'url' ? 'Copied' : 'Copy URL'}
              >
                {copied === 'url' ? <IconCheck size={13} /> : <IconCopy size={13} />}
              </button>
            </div>
            <div className="kv-label">Content type</div>
            <div className="kv-value">
              <code>{info.contentType}</code>
            </div>
            <div className="kv-label">Secret</div>
            <div className="kv-value">
              <code>{info.secret}</code>
              <button
                type="button"
                className="icon-btn"
                onClick={() => copy(info.secret, 'secret')}
                aria-label="Copy webhook secret"
                title={copied === 'secret' ? 'Copied' : 'Copy secret'}
              >
                {copied === 'secret' ? <IconCheck size={13} /> : <IconCopy size={13} />}
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={rotate}
                disabled={rotating}
                aria-label="Rotate webhook secret"
                title="Rotate secret"
              >
                <IconRefresh size={13} />
              </button>
            </div>
            <div className="kv-label">Events</div>
            <div className="kv-value">
              {info.events.map((e) => (
                <span key={e} className="dash-webhook-tag">
                  {e}
                </span>
              ))}
            </div>
          </div>
          <p className="dash-webhook-hint small muted">
            Paste the Payload URL and Secret into your GitHub repo's Webhook settings
            (Settings → Webhooks → Add webhook). Content type must be{' '}
            <code>application/json</code>.
          </p>
        </>
      )}
    </div>
  );
}

// =============================================================================
// Observability section
// =============================================================================

function ObservabilitySection({
  projects,
  deployments,
}: {
  projects: Project[] | null;
  deployments: Record<string, Deployment[]>;
}): JSX.Element {
  const allDeployments: Deployment[] = useMemo(() => {
    if (!projects) return [];
    const out: Deployment[] = [];
    for (const p of projects) {
      for (const d of deployments[p.id] ?? []) {
        out.push(d);
      }
    }
    out.sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );
    return out;
  }, [projects, deployments]);

  const stats = useMemo(() => {
    const total = allDeployments.length;
    let succeeded = 0;
    let failed = 0;
    let building = 0;
    let totalBuildMs = 0;
    let buildCount = 0;
    for (const d of allDeployments) {
      if (d.status === 'running' || d.status === 'stopped') succeeded++;
      else if (d.status === 'failed') failed++;
      else if (d.status === 'building' || d.status === 'cloning' || d.status === 'detecting' || d.status === 'queued') building++;
      if (d.startedAt && d.finishedAt) {
        const ms = new Date(d.finishedAt).getTime() - new Date(d.startedAt).getTime();
        if (ms > 0 && ms < 30 * 60 * 1000) {
          totalBuildMs += ms;
          buildCount++;
        }
      }
    }
    const successRate = total > 0 ? Math.round((succeeded / total) * 100) : 0;
    const avgBuildSec = buildCount > 0 ? Math.round(totalBuildMs / buildCount / 1000) : 0;
    return { total, succeeded, failed, building, successRate, avgBuildSec };
  }, [allDeployments]);

  // Build-time trend: bucket last 10 completed by start time, display as bar chart.
  const recent = useMemo(() => {
    return allDeployments
      .filter((d) => d.startedAt && d.finishedAt)
      .slice(0, 10)
      .reverse();
  }, [allDeployments]);

  if (projects === null) {
    return (
      <div className="dash-page">
        <PageHeader
          icon={<IconActivity size={16} />}
          title="Observability"
          subtitle="Real build metrics across all of your projects — no synthetics, no estimates."
        />
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="dash-page">
      <PageHeader
        icon={<IconActivity size={16} />}
        title="Observability"
        subtitle="Real build metrics across all of your projects — no synthetics, no estimates."
      />

      <div className="dash-obs-grid">
        <ObsStat label="Total deploys" value={String(stats.total)} sub={`across ${projects.length} project${projects.length === 1 ? '' : 's'}`} />
        <ObsStat label="Success rate" value={`${stats.successRate}%`} sub={`${stats.succeeded} succeeded, ${stats.failed} failed`} />
        <ObsStat
          label="Avg build time"
          value={stats.avgBuildSec > 0 ? `${stats.avgBuildSec}s` : '—'}
          sub={stats.avgBuildSec > 0 ? 'mean of completed builds' : 'no completed builds yet'}
        />
        <ObsStat
          label="In progress"
          value={String(stats.building)}
          sub={stats.building === 0 ? 'idle' : 'active right now'}
        />
      </div>

      <div className="dash-section-head" style={{ marginTop: 32 }}>
        <h2>Last 10 build times</h2>
        <span className="dash-section-sub">oldest → newest</span>
      </div>

      {recent.length === 0 ? (
        <p className="muted small">No completed builds yet — deploy a project to see build-time trends.</p>
      ) : (
        <div className="dash-obs-chart">
          {recent.map((d) => {
            const ms = new Date(d.finishedAt!).getTime() - new Date(d.startedAt).getTime();
            const sec = Math.max(1, Math.round(ms / 1000));
            // Scale: 1px = 1s, capped at 240px so a 4min build fills the bar.
            const widthPct = Math.min(100, (sec / 240) * 100);
            return (
              <div className="dash-obs-bar" key={d.id}>
                <span className="dash-obs-bar-sha">{d.commitSha.slice(0, 7)}</span>
                <div className="dash-obs-bar-track">
                  <div
                    className={'dash-obs-bar-fill' + (d.status === 'failed' ? ' dash-obs-bar-fill--err' : '')}
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
                <span className="dash-obs-bar-time">{formatSeconds(sec)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ObsStat({ label, value, sub }: { label: string; value: string; sub: string }): JSX.Element {
  return (
    <div className="dash-obs-stat">
      <div className="dash-obs-stat-label">{label}</div>
      <div className="dash-obs-stat-value">{value}</div>
      <div className="dash-obs-stat-sub">{sub}</div>
    </div>
  );
}

function formatSeconds(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

// =============================================================================
// Notifications section
// =============================================================================

function NotificationsSection({ user }: { user: User }): JSX.Element {
  return (
    <div className="dash-page">
      <PageHeader
        icon={<IconBell size={16} />}
        title="Notifications"
        subtitle="Choose how you want to hear about deploys."
      />

      <div className="dash-notif-card">
        <div className="dash-notif-row">
          <div>
            <div className="dash-notif-row-title">Email — {user.email ?? 'no email on file'}</div>
            <div className="dash-notif-row-sub">Deploy started, succeeded, failed.</div>
          </div>
          <span className="dash-badge dash-badge--muted">Coming soon</span>
        </div>
        <div className="dash-notif-row">
          <div>
            <div className="dash-notif-row-title">Slack</div>
            <div className="dash-notif-row-sub">Post deploy events to a Slack channel via webhook.</div>
          </div>
          <span className="dash-badge dash-badge--muted">Coming soon</span>
        </div>
        <div className="dash-notif-row">
          <div>
            <div className="dash-notif-row-title">Discord</div>
            <div className="dash-notif-row-sub">Post deploy events to a Discord channel via webhook.</div>
          </div>
          <span className="dash-badge dash-badge--muted">Coming soon</span>
        </div>
        <div className="dash-notif-row">
          <div>
            <div className="dash-notif-row-title">Webhooks</div>
            <div className="dash-notif-row-sub">Outgoing HTTP webhooks to your own URL with HMAC signing.</div>
          </div>
          <span className="dash-badge dash-badge--muted">Coming soon</span>
        </div>
      </div>

      <p className="muted small" style={{ marginTop: 16 }}>
        These are on the roadmap. For now, watch live deploys in the project dashboard.
      </p>
    </div>
  );
}

// =============================================================================
// Settings section
// =============================================================================

function SettingsSection({ user }: { user: User }): JSX.Element {
  return (
    <div className="dash-page">
      <PageHeader
        icon={<span className="dash-icon-placeholder">⚙</span>}
        title="Settings"
        subtitle="Account and workspace preferences."
      />

      <div className="dash-settings-card">
        <h3>Account</h3>
        <div className="kv">
          <div className="kv-label">Display name</div>
          <div className="kv-value">{user.displayName ?? '—'}</div>
          <div className="kv-label">GitHub</div>
          <div className="kv-value">
            <code>@{user.username}</code>
            <a
              href={`https://github.com/${user.username}`}
              target="_blank"
              rel="noreferrer"
              className="dash-settings-link"
            >
              Open profile <IconArrowUpRight size={12} />
            </a>
          </div>
          <div className="kv-label">Email</div>
          <div className="kv-value">{user.email ?? <span className="muted">private — GitHub did not share it</span>}</div>
        </div>
      </div>

      <div className="dash-settings-card">
        <h3>Session</h3>
        <p className="muted small" style={{ marginBottom: 12 }}>
          You are signed in with GitHub. Logging out clears this device's session cookie.
        </p>
        <button
          type="button"
          className="dash-settings-btn"
          onClick={async () => {
            await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
            window.location.href = '/';
          }}
        >
          Log out
        </button>
      </div>

      <div className="dash-settings-card dash-settings-card--danger">
        <h3>Danger zone</h3>
        <p className="muted small" style={{ marginBottom: 12 }}>
          Account deletion is not yet exposed in the UI. To remove your account and all
          of its data, email <a className="link" href="mailto:hello@deplox.site">hello@deplox.site</a>.
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// Shared primitives
// =============================================================================

function PageHeader({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}): JSX.Element {
  return (
    <div className="dash-page-header">
      <div className="dash-page-header-row">
        {icon && <span className="dash-page-header-icon">{icon}</span>}
        <h1>{title}</h1>
      </div>
      <p className="dash-page-sub">{subtitle}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }): JSX.Element {
  return (
    <div className="dash-empty">
      <p className="muted">{message}</p>
    </div>
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

// =============================================================================
// Overview top-row: Usage stats (Vercel-style), Alerts, Recent Previews
// =============================================================================

function OverviewUsageStats({
  projects,
  deployments,
}: {
  projects: Project[] | null;
  deployments: Record<string, Deployment[]>;
}): JSX.Element {
  const stats = useMemo(() => {
    const all: Deployment[] = [];
    for (const list of Object.values(deployments)) all.push(...list);
    const total = all.length;
    let succeeded = 0;
    let failed = 0;
    let building = 0;
    let totalBuildMs = 0;
    let buildCount = 0;
    for (const d of all) {
      if (d.status === 'running' || d.status === 'stopped') succeeded++;
      else if (d.status === 'failed') failed++;
      else if (
        d.status === 'building' ||
        d.status === 'cloning' ||
        d.status === 'detecting' ||
        d.status === 'starting' ||
        d.status === 'queued'
      ) {
        building++;
      }
      if (d.startedAt && d.finishedAt) {
        const ms = new Date(d.finishedAt).getTime() - new Date(d.startedAt).getTime();
        if (ms > 0 && ms < 30 * 60 * 1000) {
          totalBuildMs += ms;
          buildCount++;
        }
      }
    }
    const successRate = total > 0 ? Math.round((succeeded / total) * 100) : 0;
    const avgBuildSec = buildCount > 0 ? Math.round(totalBuildMs / buildCount / 1000) : 0;
    return { total, succeeded, failed, building, successRate, avgBuildSec };
  }, [deployments]);

  const projectCount = projects?.length ?? 0;
  const liveCount = (projects ?? []).filter(
    (p) => deployments[p.id]?.[0]?.status === 'running',
  ).length;

  return (
    <div className="dash-overview-row">
      <UsageCard
        icon={<IconTrendingUp size={14} />}
        label="Deploys"
        value={String(stats.total)}
        sub={`${stats.succeeded} succeeded, ${stats.failed} failed`}
        ctaText="View all"
        ctaHref="/dashboard#activity"
      />
      <UsageCard
        icon={<IconShieldCheck size={14} />}
        label="Success rate"
        value={stats.total > 0 ? `${stats.successRate}%` : '—'}
        sub={
          stats.total === 0
            ? 'No deploys yet'
            : stats.failed === 0
              ? 'No failures — clean streak'
              : `${stats.failed} failure${stats.failed === 1 ? '' : 's'}`
        }
        tone={stats.failed === 0 ? 'ok' : stats.successRate < 80 ? 'err' : 'warn'}
        ctaText="Observability"
        ctaHref="/dashboard#observability"
      />
      <UsageCard
        icon={<IconChart size={14} />}
        label="Avg build time"
        value={stats.avgBuildSec > 0 ? `${stats.avgBuildSec}s` : '—'}
        sub="mean of completed builds"
        ctaText="Details"
        ctaHref="/dashboard#observability"
      />
      <UsageCard
        icon={<IconCheck size={14} />}
        label="Live now"
        value={`${liveCount} / ${projectCount}`}
        sub={projectCount === 0 ? 'no projects yet' : 'projects serving traffic'}
        tone={liveCount === projectCount && projectCount > 0 ? 'ok' : undefined}
      />
    </div>
  );
}

function UsageCard({
  icon,
  label,
  value,
  sub,
  ctaText,
  ctaHref,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  ctaText?: string | undefined;
  ctaHref?: string | undefined;
  tone?: 'ok' | 'warn' | 'err' | undefined;
}): JSX.Element {
  return (
    <div className={`dash-usage-card${tone ? ` dash-usage-card--${tone}` : ''}`}>
      <div className="dash-usage-card-label">
        <span className="dash-usage-card-icon">{icon}</span>
        {label}
      </div>
      <div className="dash-usage-card-value">{value}</div>
      <div className="dash-usage-card-sub">{sub}</div>
      {ctaText && ctaHref && (
        <Link to={ctaHref} className="dash-usage-card-cta">
          {ctaText} <IconArrowUpRight size={11} />
        </Link>
      )}
    </div>
  );
}

function RecentPreviews({
  projects,
  deployments,
}: {
  projects: Project[] | null;
  deployments: Record<string, Deployment[]>;
}): JSX.Element | null {
  const items = useMemo(() => {
    if (!projects) return [];
    const out: Array<{ project: Project; deployment: Deployment }> = [];
    for (const p of projects) {
      const ds = deployments[p.id] ?? [];
      // First 4 across all projects
      for (const d of ds.slice(0, 4 - out.length)) {
        out.push({ project: p, deployment: d });
        if (out.length >= 4) break;
      }
      if (out.length >= 4) break;
    }
    return out;
  }, [projects, deployments]);

  if (items.length === 0) return null;

  return (
    <section className="dash-section">
      <div className="dash-section-head">
        <h2>Recent previews</h2>
        <span className="dash-section-sub">latest 4</span>
      </div>
      <div className="dash-previews-grid">
        {items.map(({ project, deployment }) => (
          <Link
            key={deployment.id}
            to={`/projects/${project.id}/deployments/${deployment.id}`}
            className="dash-preview-card"
          >
            <div className="dash-preview-card-top">
              <div className="dash-preview-card-name">
                {project.framework ? <FrameworkIcon framework={project.framework} size={12} /> : null}
                {project.name}
              </div>
              <StatusBadge deployment={deployment} compact />
            </div>
            <div className="dash-preview-card-sha">{deployment.commitSha.slice(0, 7)}</div>
            <div className="dash-preview-card-time">{timeAgo(deployment.startedAt)}</div>
            {deployment.publicUrl && (
              <div className="dash-preview-card-url">{deployment.publicUrl.replace(/^https?:\/\//, '')}</div>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}

function AlertsCard(): JSX.Element {
  return (
    <section className="dash-section">
      <div className="dash-section-head">
        <h2>Alerts</h2>
      </div>
      <div className="dash-alerts-card">
        <div className="dash-alerts-icon">
          <IconShieldCheck size={20} />
        </div>
        <div className="dash-alerts-body">
          <div className="dash-alerts-title">Get alerted for anomalies</div>
          <p>
            Automatically monitor your projects for anomalies and get notified
            when something needs your attention.
          </p>
          <Link to="/billing" className="dash-alerts-cta">
            Upgrade to Pro
          </Link>
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// Remove-project confirmation modal
// =============================================================================

function RemoveProjectModal({
  project,
  busy,
  onConfirm,
  onCancel,
}: {
  project: Project;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}): JSX.Element {
  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape' && !busy) onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  return (
    <div className="dash-modal-backdrop" onClick={() => !busy && onCancel()}>
      <div
        className="dash-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-project-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dash-modal-icon" aria-hidden="true">
          <IconTrash size={22} strokeWidth={2} />
        </div>
        <h2 id="remove-project-title" className="dash-modal-title">
          Delete project?
        </h2>
        <p className="dash-modal-subtitle">
          <strong>{project.name}</strong> will be permanently removed.
        </p>

        <ul className="dash-modal-list">
          <li>Stop all running deployments</li>
          <li>Delete all environment variables</li>
          <li>Delete all deployment history</li>
          <li>Remove the Caddy custom-domain route</li>
        </ul>

        <p className="dash-modal-note">
          Your GitHub repository is not touched. This action cannot be undone.
        </p>

        <div className="dash-modal-actions">
          <button
            type="button"
            className="dash-modal-btn dash-modal-btn--ghost"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="dash-modal-btn dash-modal-btn--danger"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Deleting…' : 'Delete project'}
          </button>
        </div>
      </div>
    </div>
  );
}
