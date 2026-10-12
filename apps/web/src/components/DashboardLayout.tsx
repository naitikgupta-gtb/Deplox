/**
 * DashboardLayout — top bar + left sidebar + main content, used for all
 * signed-in dashboard routes. Mirrors the Render.com dashboard structure:
 *
 *   ┌────────────────────────────────────────────────────────────────┐
 *   │  deplox  Projects          [search] [+ New]  ?   ◐ (avatar) │  topbar
 *   ├──────────┬─────────────────────────────────────────────────────┤
 *   │ PROJECTS │                                                     │
 *   │  Overv.. │              {children}                              │
 *   │  New     │                                                     │
 *   │          │                                                     │
 *   │ INTEGR.. │                                                     │
 *   │  Webh..  │                                                     │
 *   │  Observ. │                                                     │
 *   │  Notif.. │                                                     │
 *   │          │                                                     │
 *   │ WORKSP.. │                                                     │
 *   │  Bill..  │                                                     │
 *   │  Settings│                                                     │
 *   │  Docs    │                                                     │
 *   │  Status  │                                                     │
 *   └──────────┴─────────────────────────────────────────────────────┘
 *
 * Public pages (Landing, Pricing, Docs, About, Changelog, Status) keep
 * the simpler `Layout` component (centered top nav + main + footer).
 */

import type { ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import type { User } from '@deplox/shared-types';
import { IconLogOut, IconBook, IconCreditCard, IconPlus, IconArrowUpRight } from './Icon';
import { Logo } from './Logo';
import { ThemeSwitcher } from './ThemeSwitcher';
import { DeploxMarkGlow } from './DeploxMarkGlow';
import {
  IconLayoutDashboard,
  IconHome,
  IconSettings,
  IconActivity,
  IconWebhooks,
  IconBell,
  IconSearch,
  IconHelpCircle,
  IconGitBranch,
  IconCircleDashed,
} from './IconNav';

/**
 * Customer apps currently deployed and live on deplox — shown in the
 * dashboard sidebar's "Powering" row as social proof for the owner. Kept
 * in sync with the landing-page strip so the numbers don't lie.
 */
const DASHBOARD_LIVE_APPS: ReadonlyArray<{ short: string; host: string; url: string }> = [
  { short: 'event-checkin', host: 'event-checkin-ec.deplox.site', url: 'https://event-checkin-ec.deplox.site' },
  { short: 'GLBITM attendance', host: 'glbitm-attendance-system-gas.deplox.site', url: 'https://glbitm-attendance-system-gas.deplox.site' },
  { short: 'VelvetBrew', host: 'velvetbrew-coffee-vc.deplox.site', url: 'https://velvetbrew-coffee-vc.deplox.site' },
  { short: 'Ember Coffee', host: 'ember-coffee-ec.deplox.site', url: 'https://ember-coffee-ec.deplox.site' },
];

interface DashboardLayoutProps {
  user: User;
  children: ReactNode;
}

export function DashboardLayout({ user, children }: DashboardLayoutProps): JSX.Element {
  const navigate = useNavigate();

  async function logout(): Promise<void> {
    await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
    navigate('/');
    window.location.reload();
  }

  return (
    <div className="dash-shell">
      {/* Top bar */}
      <header className="dash-topbar">
        <div className="dash-topbar-left">
          <Link to="/dashboard" aria-label="deplox home" className="dash-brand">
            <Logo size={20} />
          </Link>
          <NavLink to="/dashboard" className="dash-topbar-link" end>
            Projects
          </NavLink>
        </div>
        <div className="dash-topbar-right">
          <button type="button" className="dash-search" aria-label="Search">
            <IconSearch size={14} />
            <span>Search</span>
            <kbd>⌘K</kbd>
          </button>
          <Link to="/new" className="dash-new-btn">
            <IconPlus size={13} /> New
          </Link>
          <a
            href="https://github.com/deploxhq/deplox"
            target="_blank"
            rel="noreferrer"
            className="dash-icon-btn"
            aria-label="Help"
            title="Help"
          >
            <IconHelpCircle size={16} />
          </a>
          <ThemeSwitcher />
          <button
            type="button"
            className="dash-avatar"
            onClick={logout}
            title={`${user.displayName ?? user.username} — click to log out`}
            aria-label="User menu"
          >
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span>{(user.displayName ?? user.username).slice(0, 1).toUpperCase()}</span>
            )}
          </button>
        </div>
      </header>

      {/* Body: sidebar + main */}
      <div className="dash-body">
        <aside className="dash-sidebar" aria-label="Dashboard navigation">
          <Link to="/dashboard" className="dash-sidebar-brand" aria-label="deplox home">
            <DeploxMarkGlow size={28} />
            <span className="dash-sidebar-brand-text">
              <span className="dash-sidebar-brand-name">deplox</span>
              <span className="dash-sidebar-brand-tag">deploy · build · scale</span>
            </span>
          </Link>

          <SidebarSection label="Projects">
            <SidebarLink to="/dashboard" icon={<IconLayoutDashboard size={15} />} end>
              Overview
            </SidebarLink>
            <SidebarLink to="/new" icon={<IconPlus size={15} />}>
              New project
            </SidebarLink>
            <SidebarLink to="/dashboard#activity" icon={<IconActivity size={15} />}>
              Activity
            </SidebarLink>
          </SidebarSection>

          <SidebarSection label="Integrations">
            <SidebarLink to="/dashboard#webhooks" icon={<IconWebhooks size={15} />}>
              Webhooks
            </SidebarLink>
            <SidebarLink to="/dashboard#observability" icon={<IconActivity size={15} />}>
              Observability
            </SidebarLink>
            <SidebarLink to="/dashboard#notifications" icon={<IconBell size={15} />}>
              Notifications
            </SidebarLink>
          </SidebarSection>

          <SidebarSection label="Workspace">
            <SidebarLink to="/billing" icon={<IconCreditCard size={15} />}>
              Billing
            </SidebarLink>
            <SidebarLink to="/dashboard#settings" icon={<IconSettings size={15} />}>
              Settings
            </SidebarLink>
            <SidebarLink to="/docs" icon={<IconBook size={15} />}>
              Docs
            </SidebarLink>
            <SidebarLink to="/status" icon={<IconCircleDashed size={15} />}>
              Status
            </SidebarLink>
            <SidebarLink to="/changelog" icon={<IconGitBranch size={15} />}>
              Changelog
            </SidebarLink>
          </SidebarSection>

          <div className="dash-sidebar-customers">
            <div className="dash-sidebar-customers-label">Powering</div>
            <ul className="dash-sidebar-customers-list">
              {DASHBOARD_LIVE_APPS.map((app) => (
                <li key={app.url}>
                  <a
                    href={app.url}
                    target="_blank"
                    rel="noreferrer"
                    className="dash-sidebar-customer"
                    title={app.host}
                  >
                    <span className="dash-sidebar-customer-status" aria-hidden="true" />
                    <span className="dash-sidebar-customer-name">{app.short}</span>
                    <IconArrowUpRight size={11} className="dash-sidebar-customer-arrow" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="dash-sidebar-footer">
            <SidebarLink to="/about" icon={<IconHome size={15} />}>
              About
            </SidebarLink>
            <button type="button" className="dash-sidebar-link dash-sidebar-link--button" onClick={logout}>
              <IconLogOut size={15} />
              <span>Log out</span>
            </button>
          </div>
        </aside>

        <main className="dash-main">{children}</main>
      </div>
    </div>
  );
}

function SidebarSection({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div className="dash-sidebar-section">
      <div className="dash-sidebar-section-label">{label}</div>
      <div className="dash-sidebar-section-items">{children}</div>
    </div>
  );
}

function SidebarLink({
  to,
  icon,
  children,
  end,
}: {
  to: string;
  icon: ReactNode;
  children: ReactNode;
  end?: boolean;
}): JSX.Element {
  const endProp = end === true;
  return (
    <NavLink
      to={to}
      end={endProp}
      className={({ isActive }) => {
        // Active only when the path matches. Hash-only links
        // (/dashboard#webhooks etc.) are highlighted by the DashboardPage
        // itself via the `dash-section-anchor` class on the heading.
        const isHashOnly = to.includes('#');
        if (isHashOnly) {
          return 'dash-sidebar-link';
        }
        return 'dash-sidebar-link' + (isActive ? ' dash-sidebar-link--active' : '');
      }}
    >
      <span className="dash-sidebar-link-icon">{icon}</span>
      <span>{children}</span>
    </NavLink>
  );
}