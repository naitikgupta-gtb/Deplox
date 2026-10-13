/**
 * UserMenu — top-right avatar + dropdown.
 *
 * Replaces the previous plain white circle (which had no identity). Shows
 * the GitHub avatar, then on click reveals a dropdown with the user's
 * name, email, and a "Log out" button. Settings link navigates to the
 * dashboard settings page.
 *
 * Per docs/DESIGN_RULES.md: monochromatic, no emoji icons (Lucide only),
 * no pill buttons. The menu panel uses a CSS keyframe fade-in.
 */

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { User } from '@deplox/shared-types';
import { IconLogOut, IconSettings, IconUser, IconMail } from './Icon';

export interface UserMenuProps {
  user: User;
  /** Where the "Settings" link in the dropdown goes. */
  settingsHref?: string | undefined;
  /** Where "View profile" goes. */
  profileHref?: string | undefined;
  onLogout: () => Promise<void> | void;
}

export function UserMenu({
  user,
  settingsHref = '/dashboard#settings',
  profileHref,
  onLogout,
}: UserMenuProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

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

  async function handleLogout(): Promise<void> {
    setOpen(false);
    await onLogout();
  }

  return (
    <div className="user-menu" ref={wrapRef}>
      <button
        type="button"
        className="user-menu-trigger"
        aria-label={`Account menu for ${displayName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title={displayName}
      >
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="user-menu-avatar"
          />
        ) : (
          <span className="user-menu-avatar user-menu-avatar--fallback">
            {displayName.slice(0, 1).toUpperCase()}
          </span>
        )}
      </button>

      {open && (
        <div className="user-menu-panel" role="menu">
          <div className="user-menu-header">
            <div className="user-menu-avatar-lg">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" />
              ) : (
                <span>{displayName.slice(0, 1).toUpperCase()}</span>
              )}
            </div>
            <div className="user-menu-info">
              <div className="user-menu-name">{displayName}</div>
              {handle && <div className="user-menu-handle">{handle}</div>}
              {user.email && (
                <div className="user-menu-email" title={user.email}>
                  <IconMail size={11} /> {user.email}
                </div>
              )}
            </div>
          </div>

          <div className="user-menu-divider" />

          {profileHref && (
            <Link
              to={profileHref}
              role="menuitem"
              className="user-menu-item"
              onClick={() => setOpen(false)}
            >
              <IconUser size={14} />
              <span>View profile</span>
            </Link>
          )}

          <Link
            to={settingsHref}
            role="menuitem"
            className="user-menu-item"
            onClick={() => setOpen(false)}
          >
            <IconSettings size={14} />
            <span>Settings</span>
          </Link>

          <div className="user-menu-divider" />

          <button
            type="button"
            role="menuitem"
            className="user-menu-item user-menu-item--danger"
            onClick={handleLogout}
          >
            <IconLogOut size={14} />
            <span>Log out</span>
          </button>
        </div>
      )}
    </div>
  );
}
