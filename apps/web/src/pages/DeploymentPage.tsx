import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { Deployment, DeploymentStatus, LogStreamEvent, Project } from '@deplox/shared-types';
import { api } from '../lib/api';
import { IconExternalLink, IconTerminal } from '../components/Icon';

const STAGES = ['queued', 'cloning', 'detecting', 'building', 'starting', 'running'] as const;

export function DeploymentPage(): JSX.Element {
  const { projectId, deploymentId } = useParams<{ projectId: string; deploymentId: string }>();
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<DeploymentStatus | null>(null);
  const logRef = useRef<HTMLPreElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    api.getProject(projectId).then(setProject).catch(() => undefined);
  }, [projectId]);

  useEffect(() => {
    if (!deploymentId) return;

    let cancelled = false;
    const refresh = async (): Promise<void> => {
      try {
        const r = await fetch(`/api/deployments/${deploymentId}`, { credentials: 'include' });
        if (r.ok && !cancelled) setDeployment(await r.json());
      } catch {/* ignore */}
    };
    void refresh();

    const es = new EventSource(`/api/deployments/${deploymentId}/logs`, { withCredentials: true });
    es.addEventListener('log', (e) => {
      const event = JSON.parse((e as MessageEvent).data) as LogStreamEvent;
      if (event.type === 'log') setLogs((prev) => [...prev, event.line]);
      else if (event.type === 'status') setStatus(event.status);
      else if (event.type === 'error') setLogs((prev) => [...prev, `[error] ${event.message}`]);
      else if (event.type === 'done') setStatus(event.status);
    });

    const pollTimer = setInterval(refresh, 5000);

    return () => {
      cancelled = true;
      es.close();
      clearInterval(pollTimer);
    };
  }, [deploymentId]);

  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  async function stop(): Promise<void> {
    if (!deploymentId) return;
    await fetch(`/api/deployments/${deploymentId}/stop`, { method: 'POST', credentials: 'include' });
  }

  const currentStatus = status ?? deployment?.status ?? 'queued';
  const currentStageIdx = STAGES.indexOf(currentStatus as typeof STAGES[number]);
  const isFailed = currentStatus === 'failed';
  const isStopped = currentStatus === 'stopped' || currentStatus === 'rolled-back';

  return (
    <div className="deployment">
      <header className="page-header">
        <div className="title">
          <h1>Deployment</h1>
          <Link to={`/projects/${projectId}`} className="subtitle">
            ← back to project
          </Link>
        </div>
        <div className="actions">
          {deployment?.publicUrl && (
            <a href={deployment.publicUrl} target="_blank" rel="noreferrer" className="link small">
              <IconExternalLink size={12} /> {deployment.publicUrl.replace(/^https?:\/\//, '')}
            </a>
          )}
          <span className={`status status-${currentStatus}`}>
            <span className="dot" /> {currentStatus}
          </span>
          <button onClick={stop} disabled={isFailed || isStopped}>Stop</button>
        </div>
      </header>

      {project?.customDomain && (
        <div className="banner info">
          <strong>Custom domain:</strong>&nbsp;{project.customDomain}
          <span style={{ marginLeft: 10, color: 'var(--color-fg-muted)' }}>
            — recorded for future provisioning. Until DNS + Caddy on-demand TLS are configured (Stage 3.1),
            use the localhost URL above.
          </span>
        </div>
      )}

      <div className="timeline">
        {STAGES.map((stage, i) => {
          const state =
            isFailed && i === currentStageIdx ? 'failed'
            : i < currentStageIdx ? 'done'
            : i === currentStageIdx ? 'active'
            : '';
          return (
            <div className={`step ${state}`} key={stage}>
              <span className="dot" />
              {stage}
            </div>
          );
        })}
      </div>

      <div className="log-controls">
        <div className="left">
          <IconTerminal size={14} />
          <span className="mono small">build &amp; runtime log</span>
          <span>·</span>
          <span>{logs.length} {logs.length === 1 ? 'line' : 'lines'}</span>
        </div>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
          />
          Auto-scroll
        </label>
      </div>

      <pre ref={logRef} className="log-viewer">
        {logs.join('\n')}
      </pre>

      {deployment?.errorMessage && (
        <div className="banner" style={{
          background: 'var(--color-error-bg)',
          borderColor: 'rgba(176, 0, 32, 0.2)',
          color: 'var(--color-error)',
          marginTop: 20,
        }}>
          <strong>Error:</strong>&nbsp;{deployment.errorMessage}
        </div>
      )}
    </div>
  );
}