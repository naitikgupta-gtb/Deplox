import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Deployment, EnvVar, Project } from '@deplox/shared-types';
import { api, type WebhookInfo } from '../lib/api';
import {
  IconExternalLink,
  IconGithub,
  IconPlus,
  IconRefresh,
  IconRocket,
  IconTerminal,
  IconZap,
} from '../components/Icon';

export function ProjectPage(): JSX.Element {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [deployments, setDeployments] = useState<Deployment[] | null>(null);
  const [env, setEnv] = useState<EnvVar[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function refreshAll(): Promise<void> {
    if (!projectId) return;
    const [p, d, e] = await Promise.all([
      api.getProject(projectId),
      api.listDeployments(projectId),
      api.listEnv(projectId),
    ]);
    setProject(p);
    setDeployments(d);
    setEnv(e);
  }

  useEffect(() => {
    refreshAll().catch(() => undefined);
  }, [projectId]);

  async function deploy(): Promise<void> {
    if (!projectId) return;
    setBusy(true);
    try {
      await api.createDeployment(projectId);
      await refreshAll();
    } finally {
      setBusy(false);
    }
  }

  if (!project) return <p className="muted">Loading project…</p>;
  const latest = deployments?.[0];

  return (
    <div className="project">
      <header className="page-header">
        <div className="title">
          <h1>{project.name}</h1>
          <a
            href={`https://github.com/${project.githubRepoFullName}`}
            target="_blank"
            rel="noreferrer"
            className="subtitle"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <IconGithub size={13} /> {project.githubRepoFullName}
            <IconExternalLink size={11} />
          </a>
        </div>
        <div className="actions">
          <button className="primary" onClick={deploy} disabled={busy}>
            <IconRocket size={14} /> {busy ? 'Deploying…' : 'Deploy'}
          </button>
        </div>
      </header>

      {latest && (
        <div className="commit-card">
          <span className="sha">{latest.commitSha.slice(0, 7)}</span>
          <span style={{ flex: 1 }}>{latest.commitMessage ?? '(no commit message)'}</span>
          <span className={`status status-${latest.status}`}>
            <span className="dot" /> {latest.status}
          </span>
        </div>
      )}

      {project.customDomain === null && latest?.publicUrl && (
        <div className="banner info" style={{ marginBottom: 24 }}>
          <IconTerminal size={14} />
          <span>
            Live preview at <a href={latest.publicUrl} target="_blank" rel="noreferrer" className="link">{latest.publicUrl}</a>.
            Add one in env vars + DNS for a custom domain.
          </span>
        </div>
      )}

      <WebhookSection
        projectId={project.id}
        autoDeploy={project.autoDeploy}
        onChange={refreshAll}
      />

      <section className="section">
        <h2>Deployments</h2>
        {deployments === null ? (
          <p className="muted">Loading…</p>
        ) : deployments.length === 0 ? (
          <p className="muted">No deployments yet. Click Deploy above.</p>
        ) : (
          <table className="deployment-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Commit</th>
                <th>Framework</th>
                <th>URL</th>
                <th>Started</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {deployments.map((d) => (
                <tr key={d.id}>
                  <td>
                    <span className={`status status-${d.status}`}>
                      <span className="dot" /> {d.status}
                    </span>
                  </td>
                  <td className="mono">{d.commitSha.slice(0, 7)}</td>
                  <td className="muted small">{d.framework ?? '—'}</td>
                  <td>
                    {d.publicUrl ? (
                      <a href={d.publicUrl} target="_blank" rel="noreferrer" className="link small">
                        {d.publicUrl.replace(/^https?:\/\//, '')}
                      </a>
                    ) : <span className="faint">—</span>}
                  </td>
                  <td className="muted small">
                    {new Date(d.startedAt).toLocaleString('en-IN', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </td>
                  <td>
                    <Link to={`/projects/${project.id}/deployments/${d.id}`} className="link small">
                      View logs
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="section">
        <h2>Environment variables</h2>
        <p className="muted small" style={{ marginBottom: 12 }}>
          Encrypted with AES-256-GCM. Decrypted only inside the runtime container.
          Never logged.
        </p>
        {env === null ? (
          <p className="muted">Loading…</p>
        ) : (
          <EnvEditor projectId={project.id} initial={env} onChange={refreshAll} />
        )}
      </section>
    </div>
  );
}

function EnvEditor({
  projectId,
  initial,
  onChange,
}: {
  projectId: string;
  initial: EnvVar[];
  onChange: () => Promise<void>;
}): JSX.Element {
  const [rows_, setRows] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setRows(initial), [initial]);

  function updateRow(idx: number, patch: Partial<{ key: string; value: string; isSecret: boolean }>): void {
    setRows((r) => r.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  }

  function add(): void {
    setRows((r) => [
      ...r,
      { id: `new-${Date.now()}`, projectId, key: '', value: '', isSecret: true, createdAt: '', updatedAt: '' },
    ]);
  }

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const toUpsert = rows_
        .filter((r) => r.key && (r.value ?? '').length > 0)
        .map((r) => ({ key: r.key, value: r.value ?? '', isSecret: r.isSecret }));
      if (toUpsert.length > 0) await api.setEnv(projectId, { variables: toUpsert });
      for (const r of rows_) {
        if (r.key && (r.value ?? '').length === 0) {
          await api.deleteEnv(projectId, r.key).catch(() => undefined);
        }
      }
      await onChange();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <table className="env-table">
        <thead>
          <tr>
            <th style={{ width: 200 }}>Key</th>
            <th>Value</th>
            <th style={{ width: 100 }}>Secret</th>
          </tr>
        </thead>
        <tbody>
          {rows_.map((r, idx) => (
            <tr key={r.id}>
              <td>
                <input
                  value={r.key}
                  onChange={(e) => updateRow(idx, { key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') })}
                  placeholder="API_KEY"
                />
              </td>
              <td>
                <input
                  type={r.isSecret ? 'password' : 'text'}
                  value={r.value ?? ''}
                  onChange={(e) => updateRow(idx, { value: e.target.value })}
                  placeholder={r.isSecret ? '••••••••' : ''}
                />
              </td>
              <td>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={r.isSecret}
                    onChange={(e) => updateRow(idx, { isSecret: e.target.checked })}
                  />
                  <span className="small">{r.isSecret ? 'yes' : 'no'}</span>
                </label>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="form" style={{ marginTop: 12, flexDirection: 'row', gap: 8 }}>
        <button onClick={add}><IconPlus size={12} /> Add variable</button>
        <button className="primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
      {error ? <p className="error small" style={{ marginTop: 8 }}>{error}</p> : null}
    </div>
  );
}

function WebhookSection({
  projectId,
  autoDeploy,
  onChange,
}: {
  projectId: string;
  autoDeploy: boolean;
  onChange: () => Promise<void>;
}): JSX.Element {
  const [info, setInfo] = useState<WebhookInfo | null>(null);
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'url' | 'secret' | null>(null);

  useEffect(() => {
    api
      .getWebhook(projectId)
      .then(setInfo)
      .catch((err) => setError(String(err)));
  }, [projectId]);

  async function copy(text: string, which: 'url' | 'secret'): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied((c) => (c === which ? null : c)), 1500);
    } catch (err) {
      setError(`Copy failed: ${err}`);
    }
  }

  async function rotate(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const next = await api.rotateWebhook(projectId);
      setInfo(next);
      setReveal(true);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleAutoDeploy(next: boolean): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api.updateProject(projectId, { autoDeploy: next });
      await onChange();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!info) {
    return (
      <section className="section">
        <h2>Auto-deploy</h2>
        <p className="muted small">Loading webhook…</p>
      </section>
    );
  }

  const maskedSecret = info.secret
    ? `${info.secret.slice(0, 4)}…${info.secret.slice(-4)}`
    : '—';

  return (
    <section className="section">
      <h2>Auto-deploy</h2>

      <div className="webhook-row">
        <label className="toggle">
          <input
            type="checkbox"
            checked={autoDeploy}
            disabled={busy}
            onChange={(e) => toggleAutoDeploy(e.target.checked)}
          />
          <span className="toggle-track">
            <span className="toggle-thumb" />
          </span>
          <span className="toggle-label">
            <IconZap size={13} />
            Auto-deploy on push to <code className="mono">{info.events.join(', ')}</code>
          </span>
        </label>
      </div>

      <p className="muted small" style={{ marginBottom: 12 }}>
        Point a GitHub webhook at the URL below and DEPLOX will trigger a new
        deployment whenever the configured branch updates.
      </p>

      <div className="kv">
        <div className="kv-label">Payload URL</div>
        <div className="kv-value mono">
          <code>{info.url}</code>
          <button
            className="ghost"
            onClick={() => copy(info.url, 'url')}
            disabled={!info.url}
          >
            {copied === 'url' ? 'Copied' : 'Copy'}
          </button>
        </div>

        <div className="kv-label">Secret</div>
        <div className="kv-value mono">
          <code>{reveal ? info.secret : maskedSecret}</code>
          <button className="ghost" onClick={() => setReveal((r) => !r)}>
            {reveal ? 'Hide' : 'Reveal'}
          </button>
          <button
            className="ghost"
            onClick={() => copy(info.secret, 'secret')}
            disabled={!info.secret}
          >
            {copied === 'secret' ? 'Copied' : 'Copy'}
          </button>
          <button className="ghost" onClick={rotate} disabled={busy}>
            <IconRefresh size={12} /> {busy ? 'Rotating…' : 'Rotate'}
          </button>
        </div>

        <div className="kv-label">Content type</div>
        <div className="kv-value mono"><code>{info.contentType}</code></div>

        <div className="kv-label">Events</div>
        <div className="kv-value mono">
          <code>{info.events.join(', ')}</code>
        </div>
      </div>

      {error ? <p className="error small" style={{ marginTop: 8 }}>{error}</p> : null}
    </section>
  );
}