import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { User } from '@deplox/shared-types';
import { IconBook, IconCreditCard, IconGithub, IconLogOut, IconLogo } from './Icon';

function Logo(): JSX.Element {
  return (
    <span className="brand">
      <IconLogo size={22} />
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
        <Link to="/" aria-label="Home"><Logo /></Link>
        <nav className="nav">
          {user ? (
            <>
              <Link to="/dashboard">Dashboard</Link>
              <Link to="/new">New project</Link>
              <Link to="/pricing">Pricing</Link>
              <Link to="/founding" className="founding-nav-link">
                <span className="founding-nav-dot" /> Founding
              </Link>
              <Link to="/billing" title="Billing">
                <IconCreditCard size={16} />
              </Link>
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
            <>
              <Link to="/pricing">Pricing</Link>
              <Link to="/founding" className="founding-nav-link">
                <span className="founding-nav-dot" /> Founding
              </Link>
              <a
                href="https://github.com/settings/applications/3901631"
                target="_blank"
                rel="noreferrer"
                className="muted"
                title="Docs"
              >
                <IconBook size={16} />
              </a>
              <a className="login" href="/auth/github?return_to=/dashboard">
                <IconGithub size={14} />
                Log in with GitHub
              </a>
            </>
          )}
        </nav>
      </header>
      <main className="main">{children}</main>
      <footer className="footer">
        <span>DEPLOX — honest deployment for developers, made in India.</span>
        <span className="faint">
          <Link to="/docs" className="link">Docs</Link>
          {' · '}
          <Link to="/status" className="link">Status</Link>
          {' · '}
          <Link to="/changelog" className="link">Changelog</Link>
          {' · '}
          <Link to="/about" className="link">About</Link>
          {' · '}
          <Link to="/pricing" className="link">Pricing</Link>
        </span>
      </footer>
    </div>
  );
}