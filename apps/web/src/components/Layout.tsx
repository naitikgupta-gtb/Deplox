import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { User } from '@deplox/shared-types';
import { IconGithub, IconLogOut } from './Icon';

function Logo(): JSX.Element {
  return (
    <span className="brand">
      <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="6" fill="#0a0a0a" />
        <text
          x="50%" y="56%"
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily="ui-monospace, Menlo, Consolas, monospace"
          fontSize="14" fontWeight="700" fill="#ffffff"
        >D</text>
      </svg>
      deplox
    </span>
  );
}

export function Layout({
  user,
  children,
}: {
  user: User | null;
  children: ReactNode;
}): JSX.Element {
  const navigate = useNavigate();

  async function logout(): Promise<void> {
    await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
    navigate('/');
    window.location.reload();
  }

  return (
    <div className="layout">
      <header className="topbar">
        <Link to="/"><Logo /></Link>
        <nav className="nav">
          {user ? (
            <>
              <Link to="/dashboard">Dashboard</Link>
              <Link to="/new">New project</Link>
              <span className="user" title={user.username}>
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" />
                ) : null}
                {user.displayName ?? user.username}
              </span>
              <button className="link-button" onClick={logout}>
                <IconLogOut size={14} />&nbsp;Log out
              </button>
            </>
          ) : (
            <a className="login" href="/auth/github?return_to=/dashboard">
              <IconGithub size={14} />
              Log in with GitHub
            </a>
          )}
        </nav>
      </header>
      <main className="main">{children}</main>
      <footer className="footer">
        <span>DEPLOX — honest deployment for developers.</span>
        <span className="faint">stage 1+2 · mock docker</span>
      </footer>
    </div>
  );
}