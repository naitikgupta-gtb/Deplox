/**
 * ThemeSwitcher — 3-way theme selector for the DEPLOX dashboard / public site.
 *
 * Three modes:
 *   - white   — always light, regardless of OS preference
 *   - black   — always dark
 *   - system  — follow the OS prefers-color-scheme
 *
 * Selection persists in `localStorage` under the key `deplox-theme`. The
 * `<html data-theme="…">` attribute is the single source of truth that the
 * CSS variables in global.css key off.
 *
 * The script in apps/web/index.html applies the persisted value BEFORE
 * React mounts, so the first paint is already the right colour — no flash
 * when the user prefers black.
 *
 * Per docs/DESIGN_RULES.md: Lucide-style SVG icons (no emoji), no pill
 * buttons, monochromatic.
 */
import { useEffect, useRef, useState } from 'react';

export type Theme = 'white' | 'black' | 'system';

const STORAGE_KEY = 'deplox-theme';

function readCurrentTheme(): Theme {
  if (typeof document === 'undefined') return 'system';
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'white' || attr === 'black' || attr === 'system') return attr;
  return 'system';
}

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* private mode / storage disabled — best effort */
  }
}

function themeLabel(theme: Theme): string {
  return theme === 'white' ? 'Light' : theme === 'black' ? 'Dark' : 'System';
}

export function ThemeSwitcher(): JSX.Element {
  const [theme, setTheme] = useState<Theme>(() => readCurrentTheme());
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
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

  // Keep state in sync if anything else (e.g. another tab) flips the attribute.
  useEffect(() => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key !== STORAGE_KEY) return;
      const next = e.newValue;
      if (next === 'white' || next === 'black' || next === 'system') {
        setTheme(next);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  function select(next: Theme): void {
    setTheme(next);
    applyTheme(next);
    setOpen(false);
  }

  return (
    <div className="theme-switcher" ref={rootRef}>
      <button
        type="button"
        className="theme-switcher-trigger"
        aria-label={`Theme: ${themeLabel(theme)}. Click to change.`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title={`Theme: ${themeLabel(theme)}`}
      >
        <ThemeIcon theme={theme} />
      </button>
      {open && (
        <div className="theme-switcher-menu" role="menu" aria-label="Theme">
          <ThemeOption theme="white" current={theme} onSelect={select} />
          <ThemeOption theme="black" current={theme} onSelect={select} />
          <ThemeOption theme="system" current={theme} onSelect={select} />
        </div>
      )}
    </div>
  );
}

function ThemeOption({
  theme,
  current,
  onSelect,
}: {
  theme: Theme;
  current: Theme;
  onSelect: (t: Theme) => void;
}): JSX.Element {
  const isActive = current === theme;
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={isActive}
      className={'theme-switcher-option' + (isActive ? ' theme-switcher-option--active' : '')}
      onClick={() => onSelect(theme)}
    >
      <span className="theme-switcher-option-icon">
        <ThemeIcon theme={theme} />
      </span>
      <span className="theme-switcher-option-label">{themeLabel(theme)}</span>
      {isActive && (
        <span className="theme-switcher-option-check" aria-hidden="true">
          <CheckIcon />
        </span>
      )}
    </button>
  );
}

function ThemeIcon({ theme }: { theme: Theme }): JSX.Element {
  if (theme === 'white') {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    );
  }
  if (theme === 'black') {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    );
  }
  // system
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function CheckIcon(): JSX.Element {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
