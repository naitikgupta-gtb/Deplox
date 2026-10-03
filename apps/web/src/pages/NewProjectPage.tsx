import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { IconGithub, IconRocket } from '../components/Icon';

export function NewProjectPage(): JSX.Element {
  const navigate = useNavigate();
  const [githubRepoFullName, setRepo] = useState('');
  const [name, setName] = useState('');
  const [customDomain, setCustomDomain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const project = await api.createProject({
        githubRepoFullName: githubRepoFullName.trim(),
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(customDomain.trim() ? { customDomain: customDomain.trim() } : {}),
      });
      navigate(`/projects/${project.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(String(err));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <header className="page-header">
        <div className="title">
          <h1>Connect a GitHub repo</h1>
          <span className="subtitle">Public repos deploy in about two minutes.</span>
        </div>
      </header>

      <div className="banner info">
        <IconGithub size={14} />
        <span>Your GitHub OAuth token is encrypted and stored on your user record. Used only to fetch repo metadata and clone on Deploy.</span>
      </div>

      <form onSubmit={submit} className="form" style={{ marginTop: 24 }}>
        <label>
          <span className="label-text">GitHub repo</span>
          <span className="help">Format: <code>owner/repo</code>. Public repos only for now.</span>
          <input
            required
            pattern="[\w.-]+/[\w.-]+"
            placeholder="vercel/next.js"
            value={githubRepoFullName}
            onChange={(e) => setRepo(e.target.value)}
          />
        </label>
        <label>
          <span className="label-text">Display name <span className="faint">(optional)</span></span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="My App"
          />
        </label>
        <label>
          <span className="label-text">Custom domain <span className="faint">(optional)</span></span>
          <span className="help">Stage 3 feature; recorded now for future provisioning.</span>
          <input
            placeholder="myapp.example.com"
            value={customDomain}
            onChange={(e) => setCustomDomain(e.target.value)}
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <div className="actions">
          <button type="submit" className="primary" disabled={busy}>
            <IconRocket size={14} /> {busy ? 'Creating…' : 'Create project'}
          </button>
          <button type="button" onClick={() => navigate(-1)} className="ghost">Cancel</button>
        </div>
      </form>
    </div>
  );
}