/**
 * DashboardLayout — top bar + left sidebar + main content, used for all
 * signed-in dashboard routes.
 *
 * Layout (Vercel-inspired, monochromatic, no pill buttons):
 *
 *   ┌────────────────────────────────────────────────────────────────────┐
 *   │ ◆ Projects       Overview      [search ⌘K]   🔔 ✉  ◐  ⓘ ◐ ☾  ⓘ │  topbar
 *   ├──────────┬─────────────────────────────────────────────────────────┤
 *   │ deplox   │                                                         │
 *   │ deploy...│                                                         │
 *   │          │              {children}                                  │
 *   │ ──────   │                                                         │
 *   │ PROJECTS │                                                         │
 *   │ Overview │                                                         │
 *   │ New      │                                                         │
 *   │ Activity │                                                         │
 *   │ ──────   │                                                         │
 *   │ INTEG... │                                                         │
 *   │ ...      │                                                         │
 *   │ ──────   │                                                         │
 *   │ WORK...  │                                                         │
 *   │ ...      │                                                         │
 *   │          │                                                         │
 *   │          │                                                         │
 *   │ [ⓘ user] │  <- Vercel-style account panel pinned to the bottom    │
 *   └──────────┴─────────────────────────────────────────────────────────┘
 *
 * Public pages (Landing, Pricing, Docs, About, Changelog, Status) keep
 * the simpler `Layout` component (centered top nav + main + footer).
 */

import type { ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { User } from '@deplox/shared-types';
import {
  IconLogOut,
  IconBook,
  IconCreditCard,
  IconPlus,
  IconBell,
  IconMail,
  IconCommand,
} from './Icon';
import { Logo } from './Logo';
import { ThemeSwitcher } from './ThemeSwitcher';
import { DeploxMarkGlow } from './DeploxMarkGlow';
import { UserMenu } from './UserMenu';
import { UserPanel } from './UserPanel';
import {
  IconLayoutDashboard,
  IconHome,
  IconSettings,
  IconActivity,
  IconWebhooks,
  IconBell as IconBellNav,
  IconSearch,
  IconHelpCircle,
  IconGitBranch,
  IconCircleDashed,
} from './IconNav';

interface DashboardLayoutProps {
  user: User;
  children: ReactNode;
}

/**
 * Derive a friendly page title and breadcrumb from the current URL.
 * The title is shown centered in the topbar (Vercel style). The crumb
 * appears to the LEFT of the brand (e.g. "Projects" for sub-pages).
 *
 * Sub-page-specific titles (the project name on /projects/:id) are set
 * via the `data-page-title` attribute that the page itself writes to
 * <html>, so this function is the fallback for everything else.
 */
function derivePageInfo(pathname: string, hash: string): { title: string; crumb: string | null } {
  const docTitle = (typeof document !== 'undefined' ? document.documentElement.getAttribute('data-page-title') : null) || '';
  if (pathname.startsWith('/projects/') && docTitle) {
    return { title: docTitle, crumb: 'Projects' };
  }
  if (pathname === '/dashboard') {
    if (hash === '#activity') return { title: 'Activity', crumb: null };
    if (hash === '#webhooks') return { title: 'Webhooks', crumb: 'Integrations' };
    if (hash === '#observability') return { title: 'Observability', crumb: 'Integrations' };
    if (hash === '#notifications') return { title: 'Notifications', crumb: 'Integrations' };
    if (hash === '#settings') return { title: 'Settings', crumb: 'Workspace' };
    return { title: 'Overview', crumb: null };
  }
  if (pathname === '/new') return { title: 'New project', crumb: null };
  if (pathname === '/billing') return { title: 'Billing', crumb: 'Workspace' };
  if (pathname === '/docs') return { title: 'Docs', crumb: null };
  if (pathname === '/status') return { title: 'Status', crumb: null };
  if (pathname === '/changelog') return { title: 'Changelog', crumb: null };
  if (pathname === '/about') return { title: 'About', crumb: null };
  if (pathname === '/founding') return { title: 'Founding', crumb: null };
  if (pathname === '/pricing') return { title: 'Pricing', crumb: null };
  return { title: 'Overview', crumb: null };
}

export function DashboardLayout({
  user,
  children,
}: DashboardLayoutProps): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get('q') ?? '';
  const { title: pageTitle, crumb: pageCrumb } = derivePageInfo(location.pathname, location.hash);

  function setSearch(value: string): void {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('q', value);
    else next.delete('q');
    setSearchParams(next, { replace: true });
  }

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
          {pageCrumb && (
            <span className="dash-topbar-crumb-sep" aria-hidden="true">
              /
            </span>
          )}
          {pageCrumb && <span className="dash-topbar-crumb">{pageCrumb}</span>}
        </div>

        <div className="dash-topbar-center">
          {pageTitle && <h1 className="dash-topbar-title">{pageTitle}</h1>}
          <div className="dash-search" role="search">
            <IconSearch size={14} />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects"
              aria-label="Search projects"
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
            />
            <kbd>
              <IconCommand size={10} /> K
            </kbd>
          </div>
        </div>

        <div className="dash-topbar-right">
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

          <button
            type="button"
            className="dash-icon-btn"
            aria-label="Notifications"
            title="Notifications"
          >
            <IconBell size={16} />
          </button>

          <a
            href="/docs"
            className="dash-icon-btn"
            aria-label="Docs"
            title="Mail & docs"
          >
            <IconMail size={16} />
          </a>

          <ThemeSwitcher />

          <UserMenu
            user={user}
            profileHref={user.username ? `https://github.com/${user.username}` : undefined}
            onLogout={logout}
          />
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
            <SidebarLink to="/dashboard#notifications" icon={<IconBellNav size={15} />}>
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
            <SidebarLink to="/about" icon={<IconHome size={15} />}>
              About
            </SidebarLink>
          </SidebarSection>

          {/* Spacer pushes the user panel to the bottom of the sidebar. */}
          <div className="dash-sidebar-spacer" />

          <UserPanel user={user} onLogout={logout} />
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


