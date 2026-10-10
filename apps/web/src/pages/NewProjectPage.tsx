import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, UserRepo } from '../lib/api';
import { IconGithub, IconRocket, IconLock, IconArrowRight, IconHistory } from '../components/Icon';
import { useMeta } from '../lib/use-meta';

export function NewProjectPage(): JSX.Element {
  useMeta({
    title: 'New project — DEPLOX',
    description: 'Connect a GitHub repo and deploy it on a public deplox.site URL in 2 minutes.',
    noindex: true,
  });
  const navigate = useNavigate();
  const [repos, setRepos] = useState<UserRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedFullName, setSelectedFullName] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [customDomain, setCustomDomain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Fallback: user can type owner/repo manually if the picker is empty or
  // the user wants a repo the API didn't return.
  const [manualMode, setManualMode] = useState(false);
  const [manualRepo, setManualRepo] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listUserRepos()
      .then((r) => {
        if (cancelled) return;
        setRepos(r);
        if (r.length === 0) setManualMode(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter(
      (r) =>
        r.fullName.toLowerCase().includes(q) ||
        (r.description ?? '').toLowerCase().includes(q),
    );
  }, [repos, search]);

  const selected = useMemo(
    () => repos.find((r) => r.fullName === selectedFullName) ?? null,
    [repos, selectedFullName],
  );

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const finalRepo = manualMode ? manualRepo.trim() : (selectedFullName ?? '');
    if (!finalRepo) {
      setError('Pick a repo or type owner/name.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const project = await api.createProject({
        githubRepoFullName: finalRepo,
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
        <span>
          Your GitHub OAuth token is encrypted and stored on your user record.
          Used only to fetch repo metadata and clone on Deploy.
        </span>
      </div>

      <form onSubmit={submit} className="form" style={{ marginTop: 24 }}>
        <fieldset className="repo-picker">
          <legend>
            <span className="label-text">GitHub repo</span>
            {repos.length > 0 && !manualMode && (
              <button
                type="button"
                className="link"
                onClick={() => setManualMode(true)}
                style={{ marginLeft: 'auto', fontSize: 12 }}
              >
                Type owner/name instead
              </button>
            )}
            {manualMode && repos.length > 0 && (
              <button
                type="button"
                className="link"
                onClick={() => setManualMode(false)}
                style={{ marginLeft: 'auto', fontSize: 12 }}
              >
                Pick from list
              </button>
            )}
          </legend>

          {manualMode ? (
            <input
              required
              pattern="[\w.-]+/[\w.-]+"
              placeholder="vercel/next.js"
              value={manualRepo}
              onChange={(e) => setManualRepo(e.target.value)}
            />
          ) : (
            <>
              <input
                type="search"
                placeholder="Search your repos…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="repo-search"
                autoFocus
              />
              <div className="repo-list" role="listbox" aria-label="Your GitHub repositories">
                {loading ? (
                  <div className="repo-empty">Loading your repos from GitHub…</div>
                ) : filtered.length === 0 ? (
                  <div className="repo-empty">
                    {search.trim()
                      ? `No repos match "${search}".`
                      : 'No public repos found on your GitHub account.'}
                  </div>
                ) : (
                  filtered.map((r) => (
                    <button
                      type="button"
                      key={r.fullName}
                      role="option"
                      aria-selected={r.fullName === selectedFullName}
                      className={`repo-row${
                        r.fullName === selectedFullName ? ' repo-row-selected' : ''
                      }`}
                      onClick={() => {
                        setSelectedFullName(r.fullName);
                        if (!name.trim()) {
                          // Pre-fill display name from the repo (the part
                          // after the slash) so the user doesn't have to
                          // type it.
                          setName(r.fullName.split('/')[1] ?? '');
                        }
                      }}
                    >
                      <div className="repo-row-main">
                        <span className="repo-name">
                          {r.isPrivate ? <IconLock size={12} /> : null}
                          <span>{r.fullName}</span>
                        </span>
                        {r.description ? (
                          <span className="repo-desc">{r.description}</span>
                        ) : null}
                      </div>
                      <div className="repo-row-meta">
                        {r.language ? <span className="repo-lang">{r.language}</span> : null}
                        <span className="repo-pushed" title={r.pushedAt}>
                          <IconHistory size={11} /> {formatRelativeTime(r.pushedAt)}
                        </span>
                        <IconArrowRight size={12} />
                      </div>
                    </button>
                  ))
                )}
              </div>
              {selected && (
                <div className="repo-selected-banner">
                  Selected: <strong>{selected.fullName}</strong> · default branch{' '}
                  <code>{selected.defaultBranch}</code>
                  {selected.isPrivate ? (
                    <span className="badge" style={{ marginLeft: 8 }}>
                      private
                    </span>
                  ) : null}
                </div>
              )}
            </>
          )}
          <span className="help">
            {manualMode
              ? 'Format: owner/repo. Public repos deploy fastest; private repos need your GitHub OAuth scope to include repo.'
              : 'Pick a repo from your GitHub account. Recently pushed repos show first.'}
          </span>
        </fieldset>

        <label>
          <span className="label-text">
            Display name <span className="faint">(optional)</span>
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="My App"
          />
        </label>
        <label>
          <span className="label-text">
            Custom domain <span className="faint">(optional)</span>
          </span>
          <span className="help">Pro feature; recorded now for future provisioning.</span>
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
          <button type="button" onClick={() => navigate(-1)} className="ghost">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * "3 days ago" / "2 hours ago" / "just now" — coarse, locale-free.
 * GitHub's `pushed_at` is an ISO string; we compare to now.
 */
function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month}mo ago`;
  const year = Math.floor(month / 12);
  return `${year}y ago`;
}
