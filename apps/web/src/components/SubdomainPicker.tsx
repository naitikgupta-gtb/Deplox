/**
 * SubdomainPicker — live availability + claim for `<name>.deplox.site`.
 *
 * Used in two places:
 *   1. NewProjectPage — before creating a project, lets the user pick a
 *      desired subdomain (or skip and let the system auto-generate one).
 *   2. ProjectPage — after a project exists, lets the user change the
 *      subdomain. Existing auto-generated projects can claim a shorter
 *      name; user-picked projects can release back to auto-generation.
 *
 * Behavior:
 *   - Debounced availability check (300ms) on every input change.
 *   - Inline state badge: Available / Taken / Reserved / Invalid.
 *   - On "Claim", posts /subdomain/claim and surfaces the response.
 *   - Never loses the user's typed value during the debounce window.
 *
 * No third-party dependencies. Per docs/DESIGN_RULES.md: no emoji, Lucide
 * icons only, monochromatic.
 */

import { useEffect, useRef, useState } from 'react';
import { api, type SubdomainAvailabilityResponse, type SubdomainClaimResponse } from '../lib/api';
import { IconCheck, IconX } from './Icon';
import { IconCircleDashed } from './IconNav';

type CheckState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available'; data: SubdomainAvailabilityResponse }
  | { kind: 'unavailable'; data: SubdomainAvailabilityResponse; errorMessage: string }
  | { kind: 'error'; message: string };

const REASON_LABELS: Record<string, string> = {
  taken: 'already taken by another project',
  reserved: 'reserved by deplox (try a different name)',
  invalid: 'invalid — see rules below',
  too_short: 'must be at least 3 characters',
  too_long: 'must be at most 32 characters',
  invalid_chars: 'use lowercase a-z, 0-9 and hyphens only',
  starts_or_ends_with_hyphen: "can't start or end with a hyphen",
  numeric_only: 'cannot be a number only',
};

const DEBOUNCE_MS = 300;

export interface SubdomainPickerProps {
  projectId: string;
  /** Current value (if the project already has a subdomain). */
  current: string | null;
  /** After a successful claim or release, parent re-fetches the project. */
  onChange: () => Promise<void> | void;
  /** Optional — fired when an unrecoverable error happens (so the parent can toast). */
  onError?: (msg: string) => void;
}

export function SubdomainPicker({
  projectId,
  current,
  onChange,
  onError,
}: SubdomainPickerProps): JSX.Element {
  const [draft, setDraft] = useState<string>(current ?? '');
  const [state, setState] = useState<CheckState>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCheckedRef = useRef<string>('');

  // Debounced availability check.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const value = draft.trim().toLowerCase();
    if (value === '') {
      setState({ kind: 'idle' });
      return undefined;
    }
    if (value === current) {
      // Same as the current value — no point checking.
      setState({ kind: 'idle' });
      return undefined;
    }
    setState({ kind: 'checking' });
    debounceRef.current = setTimeout(async () => {
      lastCheckedRef.current = value;
      try {
        const res = await api.checkSubdomain(projectId, value);
        // Ignore stale results if the user has typed something else since.
        if (lastCheckedRef.current !== value) return;
        if (res.available) {
          setState({ kind: 'available', data: res });
        } else {
          setState({
            kind: 'unavailable',
            data: res,
            errorMessage: REASON_LABELS[res.reason] ?? res.reason,
          });
        }
      } catch (err) {
        if (lastCheckedRef.current !== value) return;
        setState({ kind: 'error', message: String(err) });
      }
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [draft, projectId, current]);

  async function claim(): Promise<void> {
    const value = draft.trim().toLowerCase();
    if (!value) return;
    if (state.kind === 'checking') return;
    setBusy(true);
    setClaimMessage(null);
    try {
      const res: SubdomainClaimResponse = await api.claimSubdomain(projectId, value);
      setClaimMessage(
        res.caddyRouteActive
          ? `Claimed ${res.fullHostname} — Caddy route live now.`
          : `Claimed ${res.fullHostname}. Route will go live on next deploy.`,
      );
      await onChange();
    } catch (err) {
      const msg = String((err as Error).message ?? err);
      setClaimMessage(`Failed: ${msg}`);
      onError?.(msg);
    } finally {
      setBusy(false);
    }
  }

  async function release(): Promise<void> {
    if (!window.confirm('Release the picked subdomain? Next deploy will fall back to the auto-generated one.')) return;
    setBusy(true);
    setClaimMessage(null);
    try {
      const res = await api.releaseSubdomain(projectId);
      setClaimMessage(
        res.hadSubdomain
          ? `Released ${res.previousSubdomain}. The next deploy will pick an auto-generated name.`
          : 'No subdomain to release.',
      );
      setDraft('');
      await onChange();
    } catch (err) {
      const msg = String((err as Error).message ?? err);
      setClaimMessage(`Failed: ${msg}`);
      onError?.(msg);
    } finally {
      setBusy(false);
    }
  }

  const canClaim =
    state.kind === 'available' && !busy && draft.trim().toLowerCase() !== (current ?? '');

  return (
    <div className="subdomain-picker">
      <div className="subdomain-picker-row">
        <div className="subdomain-picker-input">
          <input
            type="text"
            value={draft}
            placeholder="myapp"
            onChange={(e) => {
              setDraft(e.target.value.toLowerCase());
              setClaimMessage(null);
            }}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            disabled={busy}
            maxLength={32}
          />
          <span className="subdomain-picker-suffix">.deplox.site</span>
        </div>

        <div className="subdomain-picker-state">
          <StateBadge state={state} />
        </div>

        <div className="subdomain-picker-actions">
          <button
            type="button"
            className="primary"
            onClick={claim}
            disabled={!canClaim}
          >
            {busy ? 'Claiming…' : draft.trim().toLowerCase() === (current ?? '') ? 'Re-claim' : 'Claim'}
          </button>
        </div>
      </div>

      {state.kind === 'unavailable' && state.data.suggestion && (
        <p className="subdomain-picker-hint">
          Try <code>{state.data.suggestion}</code>{' '}
          <button
            type="button"
            className="link-btn"
            onClick={() => setDraft(state.data.suggestion ?? '')}
          >
            use
          </button>
        </p>
      )}

      <details className="subdomain-picker-rules">
        <summary>Rules</summary>
        <ul>
          <li>3-32 characters</li>
          <li>Lowercase a-z, 0-9, and hyphens</li>
          <li>Can't start or end with a hyphen</li>
          <li>Can't be a reserved name (e.g. <code>www</code>, <code>api</code>, <code>dashboard</code>)</li>
          <li>First-come-first-served — no two projects can share a name</li>
        </ul>
      </details>

      {claimMessage && <p className="subdomain-picker-message">{claimMessage}</p>}

      {current && (
        <div className="subdomain-picker-release">
          <button
            type="button"
            className="ghost"
            onClick={release}
            disabled={busy}
          >
            Release <code>{current}</code> and go back to auto-generated
          </button>
        </div>
      )}
    </div>
  );
}

function StateBadge({ state }: { state: CheckState }): JSX.Element | null {
  if (state.kind === 'idle') return null;
  if (state.kind === 'checking') {
    return (
      <span className="subdomain-badge subdomain-badge--muted">
        <IconCircleDashed size={12} /> checking…
      </span>
    );
  }
  if (state.kind === 'available') {
    return (
      <span className="subdomain-badge subdomain-badge--ok">
        <IconCheck size={12} /> available
      </span>
    );
  }
  if (state.kind === 'unavailable') {
    return (
      <span className="subdomain-badge subdomain-badge--err">
        <IconX size={12} /> {state.errorMessage}
      </span>
    );
  }
  return (
    <span className="subdomain-badge subdomain-badge--err">
      <IconX size={12} /> error
    </span>
  );
}
