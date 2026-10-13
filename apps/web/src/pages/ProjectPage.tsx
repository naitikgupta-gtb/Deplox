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
  IconTrash,
  IconZap,
  IconCheck,
  IconCopy,
} from '../components/Icon';
import { IconCircleDashed } from '../components/IconNav';
import { SubdomainPicker } from '../components/SubdomainPicker';

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

  // Set the page title on <html> so DashboardLayout's topbar can show the
  // project name as the page heading (Vercel-style). Cleaned up on unmount
  // so the next page doesn't inherit it.
  useEffect(() => {
    if (project?.name) {
      document.documentElement.setAttribute('data-page-title', project.name);
      return () => {
        document.documentElement.removeAttribute('data-page-title');
      };
    }
    return undefined;
  }, [project?.name]);

  // While any deployment is in flight (queued/cloning/detecting/building/starting),
  // poll every 3s so the dashboard reflects new state without a manual reload.
  useEffect(() => {
    const inFlight = deployments?.some((d) =>
      ['queued', 'cloning', 'detecting', 'building', 'starting'].includes(d.status),
    );
    if (!inFlight) return;
    const id = window.setInterval(() => {
      refreshAll().catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deployments]);

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
        <div className="banner info public-url-banner" style={{ marginBottom: 24 }}>
          <IconTerminal size={14} />
          <span style={{ flex: 1 }}>
            Public URL:&nbsp;
            <a href={latest.publicUrl} target="_blank" rel="noreferrer" className="link mono">
              {latest.publicUrl.replace(/^https?:\/\//, '')}
            </a>
            <span className="muted small" style={{ marginLeft: 8 }}>
              (auto-generated — every deplox deployment gets one)
            </span>
          </span>
          <a
            href={latest.publicUrl}
            target="_blank"
            rel="noreferrer"
            className="link small"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <IconExternalLink size={12} /> Open
          </a>
        </div>
      )}

      <WebhookSection
        projectId={project.id}
        autoDeploy={project.autoDeploy}
        onChange={refreshAll}
      />

      <SubdomainSection
        projectId={project.id}
        pickedSubdomain={project.pickedSubdomain}
        publicUrl={latest?.publicUrl ?? null}
        onChange={refreshAll}
      />

      <PublicListingSection
        projectId={project.id}
        publiclyListed={project.publiclyListed}
        publicUrl={latest?.publicUrl ?? null}
        onChange={refreshAll}
      />

      <CustomDomainSection
        projectId={project.id}
        customDomain={project.customDomain}
        customDomainVerified={project.customDomainVerified}
        customDomainVerifiedAt={project.customDomainVerifiedAt}
        customDomainVerificationToken={project.customDomainVerificationToken}
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

  async function clearAll(): Promise<void> {
    const count = rows_.filter((r) => r.key).length;
    if (count === 0) return;
    const ok = window.confirm(
      `Remove all ${count} environment variable${count === 1 ? '' : 's'} for this project?\n\n` +
        `This is useful when swapping Supabase projects, rotating auth, or\n` +
        `copying a friend's keys by accident. The next deploy will build\n` +
        `without any of these variables. This cannot be undone — but you\n` +
        `can re-add them here at any time.`,
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await api.clearAllEnv(projectId);
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
        <span style={{ flex: 1 }} />
        {rows_.some((r) => r.key) && (
          <button
            className="danger"
            onClick={clearAll}
            disabled={busy}
            title="Remove all environment variables for this project"
          >
            <IconTrash size={12} /> Clear all
          </button>
        )}
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

function PublicListingSection({
  projectId,
  publiclyListed,
  publicUrl,
  onChange,
}: {
  projectId: string;
  publiclyListed: boolean;
  publicUrl: string | null;
  onChange: () => Promise<void>;
}): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(next: boolean): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api.updateProject(projectId, { publiclyListed: next });
      await onChange();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section">
      <h2>Public showcase</h2>
      <p className="muted small" style={{ marginBottom: 12 }}>
        When enabled, this project appears in the <code>Live on deplox</code>{' '}
        strip on the public marketing page so anyone visiting{' '}
        <code>deplox.site</code> can see it. Off by default — your projects are
        private until you opt in.
      </p>

      <div className="webhook-row">
        <label className="toggle">
          <input
            type="checkbox"
            checked={publiclyListed}
            disabled={busy}
            onChange={(e) => toggle(e.target.checked)}
          />
          <span className="toggle-track">
            <span className="toggle-thumb" />
          </span>
          <span className="toggle-label">
            <IconZap size={13} />
            Show on the public landing page
          </span>
        </label>
      </div>

      {publiclyListed && (
        <p className="small muted" style={{ marginTop: 12 }}>
          Will appear as:{' '}
          <strong>{publicUrl ? publicUrl.replace(/^https?:\/\//, '') : '(deploy first)'}</strong>
        </p>
      )}

      {error ? <p className="error small" style={{ marginTop: 8 }}>{error}</p> : null}
    </section>
  );
}

function SubdomainSection({
  projectId,
  pickedSubdomain,
  publicUrl,
  onChange,
}: {
  projectId: string;
  pickedSubdomain: string | null;
  publicUrl: string | null;
  onChange: () => Promise<void>;
}): JSX.Element {
  return (
    <section className="section">
      <h2>deplox.site subdomain</h2>
      <p className="muted small" style={{ marginBottom: 12 }}>
        Pick a short, memorable <code>&lt;name&gt;.deplox.site</code> for this
        project. No DNS setup, no purchase — first-come-first-served. The
        current public URL is{' '}
        {publicUrl ? (
          <a href={publicUrl} target="_blank" rel="noreferrer">
            {publicUrl.replace(/^https?:\/\//, '')}
          </a>
        ) : (
          <span className="muted">not yet (deploy first)</span>
        )}
        .
      </p>
      <SubdomainPicker
        projectId={projectId}
        current={pickedSubdomain}
        onChange={onChange}
      />
    </section>
  );
}

function CustomDomainSection({
  projectId,
  customDomain,
  customDomainVerified,
  customDomainVerifiedAt,
  customDomainVerificationToken,
  onChange,
}: {
  projectId: string;
  customDomain: string | null;
  customDomainVerified: boolean;
  customDomainVerifiedAt: string | null;
  customDomainVerificationToken: string | null;
  onChange: () => Promise<void>;
}): JSX.Element {
  const [draft, setDraft] = useState(customDomain ?? '');
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);

  // Compute the TXT record the user must add. We reconstruct it from the
  // token + domain because the API only returns the token while the
  // domain is unverified.
  const txtHost = customDomain ? `_deplox-verify.${customDomain}` : '';
  const txtValue = customDomainVerificationToken
    ? `deplox-verify=${customDomainVerificationToken}`
    : '';

  async function startVerification(): Promise<void> {
    setBusy(true);
    setError(null);
    setVerifyMessage(null);
    try {
      const next = draft.trim().toLowerCase();
      if (next === '') {
        await api.removeCustomDomain(projectId);
      } else {
        await api.startCustomDomain(projectId, next);
      }
      await onChange();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(): Promise<void> {
    setVerifying(true);
    setError(null);
    setVerifyMessage(null);
    try {
      const res = await api.verifyCustomDomain(projectId);
      if (res.status === 'verified') {
        setVerifyMessage('Verified! Custom domain is now serving traffic.');
      } else if (res.status === 'pending') {
        const reason = res.reason;
        if (reason === 'dns_not_found') {
          setVerifyMessage(
            'TXT record not found yet. DNS can take a few minutes to propagate — try again shortly.',
          );
        } else if (reason === 'txt_value_mismatch') {
          setVerifyMessage(
            'TXT record found but the value does not match. Re-check the value below against what you published.',
          );
        } else if (reason.startsWith('dns_error:')) {
          setVerifyMessage(`DNS lookup error (${reason}). Try again in a minute.`);
        } else {
          setVerifyMessage(`Pending: ${reason}`);
        }
      } else {
        setVerifyMessage(`No challenge issued yet.`);
      }
      await onChange();
    } catch (err) {
      setError(String(err));
    } finally {
      setVerifying(false);
    }
  }

  async function remove(): Promise<void> {
    if (!window.confirm(`Remove custom domain "${customDomain}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.removeCustomDomain(projectId);
      setDraft('');
      await onChange();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function copyValue(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* clipboard unavailable */
    }
  }

  // No custom domain yet -- show the input.
  if (!customDomain) {
    return (
      <section className="section">
        <h2>Custom domain</h2>
        <p className="muted small" style={{ marginBottom: 12 }}>
          Serve this project on your own domain (e.g. <code>app.yourcompany.com</code>).
          TLS is issued automatically once you verify ownership.
        </p>
        <div className="form" style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
          <label style={{ flex: 1 }}>
            <span className="label-text">Hostname</span>
            <input
              placeholder="myapp.example.com"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              pattern="^[a-z0-9.-]+\.[a-z]{2,}$"
              disabled={busy}
            />
          </label>
          <button
            className="primary"
            onClick={startVerification}
            disabled={busy || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(draft.trim())}
          >
            {busy ? 'Starting…' : 'Add domain'}
          </button>
        </div>
        {error ? <p className="error small" style={{ marginTop: 8 }}>{error}</p> : null}
      </section>
    );
  }

  // Custom domain is set. Show different states.
  return (
    <section className="section">
      <h2>Custom domain</h2>

      <div className="kv">
        <div className="kv-label">Hostname</div>
        <div className="kv-value mono">
          <code>{customDomain}</code>
          {customDomainVerified && (
            <a
              href={`https://${customDomain}`}
              target="_blank"
              rel="noreferrer"
              className="ghost"
              style={{ textDecoration: 'none' }}
            >
              Open ↗
            </a>
          )}
        </div>
        <div className="kv-label">Status</div>
        <div className="kv-value">
          {customDomainVerified ? (
            <span className="dash-badge dash-badge--ok">
              <IconCheck size={12} /> Verified
              {customDomainVerifiedAt
                ? ` on ${new Date(customDomainVerifiedAt).toLocaleDateString()}`
                : ''}
            </span>
          ) : (
            <span className="dash-badge dash-badge--warn">
              <IconCircleDashed size={12} /> Pending verification
            </span>
          )}
        </div>
      </div>

      {!customDomainVerified && (
        <div className="dash-domain-verify">
          <p className="small">
            To prove you own <code>{customDomain}</code>, add this DNS TXT record at
            your domain provider, then click <strong>Verify</strong>:
          </p>
          <div className="kv" style={{ marginTop: 8 }}>
            <div className="kv-label">Type</div>
            <div className="kv-value"><code>TXT</code></div>
            <div className="kv-label">Host</div>
            <div className="kv-value">
              <code>{txtHost}</code>
              <button
                type="button"
                className="icon-btn"
                onClick={() => copyValue(txtHost)}
                aria-label="Copy host"
                title="Copy"
              >
                <IconCopy size={13} />
              </button>
            </div>
            <div className="kv-label">Value</div>
            <div className="kv-value">
              <code>{txtValue}</code>
              <button
                type="button"
                className="icon-btn"
                onClick={() => copyValue(txtValue)}
                aria-label="Copy value"
                title="Copy"
              >
                <IconCopy size={13} />
              </button>
            </div>
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>
            After saving the TXT record, DNS can take a few minutes to propagate.
            Once verified, this section turns green and traffic flows immediately.
          </p>

          <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="primary"
              onClick={verify}
              disabled={verifying}
            >
              {verifying ? 'Checking DNS…' : 'Verify now'}
            </button>
            {verifyMessage && (
              <span className="small muted">{verifyMessage}</span>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button
          type="button"
          className="ghost"
          onClick={remove}
          disabled={busy}
        >
          {busy ? 'Removing…' : 'Remove custom domain'}
        </button>
      </div>

      {error ? <p className="error small" style={{ marginTop: 8 }}>{error}</p> : null}
    </section>
  );
}