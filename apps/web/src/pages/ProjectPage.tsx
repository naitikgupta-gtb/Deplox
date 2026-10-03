import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Deployment, EnvVar, Project } from '@deplox/shared-types';
import { api } from '../lib/api';
import {
  IconExternalLink,
  IconGithub,
  IconPlus,
  IconRocket,
  IconTerminal,
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