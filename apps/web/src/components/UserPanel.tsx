/**
 * UserPanel — Vercel-style bottom-left account panel pinned to the
 * dashboard sidebar.
 *
 * Shows the user's GitHub avatar, name, and email, plus a "log out"
 * button. The whole panel is a button: clicking it opens a small menu
 * (popover above the panel) with the full account options so the
 * sidebar stays visually compact.
 *
 * Mobile: hidden -- the sidebar collapses to a top nav at <900px.
 */

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { User } from '@deplox/shared-types';
import { IconLogOut, IconSettings, IconChevronUp, IconUser, IconBook } from './Icon';

export interface UserPanelProps {
  user: User;
  onLogout: () => Promise<void> | void;
  settingsHref?: string | undefined;
}

export function UserPanel({
  user,
  onLogout,
  settingsHref = '/dashboard#settings',
}: UserPanelProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent): void => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const displayName = user.displayName || user.username;
  const handle = user.username ? `@${user.username}` : '';

  return (
    <div className="dash-user-panel" ref={wrapRef}>
      <button
        type="button"
        className="dash-user-panel-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open account menu"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" className="dash-user-panel-avatar" />
        ) : (
          <span className="dash-user-panel-avatar dash-user-panel-avatar--fallback">
            {displayName.slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="dash-user-panel-text">
          <span className="dash-user-panel-name">{displayName}</span>
          <span className="dash-user-panel-email" title={user.email ?? handle}>
            {user.email ?? handle}
          </span>
        </span>
        <IconChevronUp size={14} className="dash-user-panel-chev" />
      </button>

      {open && (
        <div className="dash-user-panel-menu" role="menu">
          <Link
            to={settingsHref}
            role="menuitem"
            className="dash-user-panel-item"
            onClick={() => setOpen(false)}
          >
            <IconSettings size={14} />
            <span>Settings</span>
          </Link>
          <a
            href="https://deplox.site/docs"
            target="_blank"
            rel="noreferrer"
            role="menuitem"
            className="dash-user-panel-item"
          >
            <IconBook size={14} />
            <span>Docs</span>
          </a>
          <a
            href={user.username ? `https://github.com/${user.username}` : '#'}
            target="_blank"
            rel="noreferrer"
            role="menuitem"
            className="dash-user-panel-item"
          >
            <IconUser size={14} />
            <span>GitHub profile</span>
          </a>
          <div className="dash-user-panel-divider" />
          <button
            type="button"
            role="menuitem"
            className="dash-user-panel-item dash-user-panel-item--danger"
            onClick={async () => {
              setOpen(false);
              await onLogout();
            }}
          >
            <IconLogOut size={14} />
            <span>Log out</span>
          </button>
        </div>
      )}
    </div>
  );
}
