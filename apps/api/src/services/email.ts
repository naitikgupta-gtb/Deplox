/**
 * Transactional email sender.
 *
 * Uses Resend (https://resend.com) as the primary transport because:
 *   - Free tier covers our use case (100 emails/day, 3000/month).
 *   - Single API call, no SMTP connection setup.
 *   - Typical delivery <500ms (faster than SES/SendGrid SMTP handshakes).
 *   - HTML + plain text in the same request, no template engine.
 *   - Built-in bounce / complaint / open / click webhooks (we register for
 *     them later if/when we add a UI for delivery status).
 *
 * Graceful fallback: if `RESEND_API_KEY` is not set, this module is a
 * no-op that logs the email we'd have sent. The OAuth signup flow NEVER
 * blocks on email — if Resend is down or unconfigured, the user still
 * gets logged in, they just don't get a welcome email. We surface a
 * "not configured" or "send failed" log so the operator can diagnose.
 *
 * Add to .env (one line, no restart needed for pickup on next email):
 *   RESEND_API_KEY=re_xxxxx
 *   RESEND_FROM=noreply@deplox.site
 *
 * The `RESEND_FROM` domain MUST be a verified sending domain in your
 * Resend dashboard. For deplox that's deplox.site; for staging you can
 * use `onresend.dev` (Resend provides that subdomain for free).
 */

import { childLogger } from '@deplox/shared-logger';

const log = childLogger({ component: 'email' });

const RESEND_API = 'https://api.resend.com/emails';

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  /** Optional Reply-To address. Defaults to the From address. */
  readonly replyTo?: string;
}

interface ResendResponse {
  readonly id?: string;
}

function readConfig(): { apiKey: string | null; from: string } {
  const apiKey = process.env.RESEND_API_KEY?.trim() || null;
  const from = process.env.RESEND_FROM?.trim() || 'noreply@deplox.site';
  return { apiKey, from };
}

/**
 * Send an email via Resend. Returns `true` on confirmed acceptance
 * (Resend returns 200 with an id), `false` on any failure or
 * unconfigured state. Never throws.
 *
 * Why we don't await upstream callers: this is fire-and-forget. The
 * caller has already finished its primary work (e.g. user creation).
 * Any error here is logged and dropped.
 */
export async function sendEmail(msg: EmailMessage): Promise<boolean> {
  const { apiKey, from } = readConfig();
  if (!apiKey) {
    log.info(
      {
        to: msg.to,
        subject: msg.subject,
        reason: 'RESEND_API_KEY not set; email not sent (set it in .env to enable)',
      },
      'welcome email skipped (no api key)',
    );
    return false;
  }
  const body = {
    from,
    to: [msg.to],
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
    ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
  };
  const started = Date.now();
  try {
    const res = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    const elapsed = Date.now() - started;
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      log.warn(
        { to: msg.to, status: res.status, body: text.slice(0, 300), elapsed },
        'resend rejected email',
      );
      return false;
    }
    const data = (await res.json().catch(() => ({}))) as ResendResponse;
    log.info(
      { to: msg.to, subject: msg.subject, resendId: data.id ?? null, elapsed },
      'resend accepted email',
    );
    return true;
  } catch (err) {
    const elapsed = Date.now() - started;
    log.warn(
      { err: (err as Error).message, to: msg.to, elapsed },
      'resend network error',
    );
    return false;
  }
}

/**
 * Fire-and-forget welcome email sent right after a user signs in for the
 * first time. Deliberately does not block the OAuth callback -- the
 * caller can `void sendWelcomeEmail(user)` and continue immediately.
 *
 * Per design: this is purely informational, not a verification email.
 * The user already proved ownership by completing the GitHub OAuth
 * flow. We do not gate anything on this email.
 */
export function sendWelcomeEmail(user: {
  email: string | null;
  displayName: string | null;
  username: string;
}): void {
  // Skip silently if we don't have a destination. Many GitHub users
  // choose to hide their email; we'd rather not send "Hi null" to a
  // placeholder address.
  if (!user.email) {
    log.info({ username: user.username }, 'welcome email skipped (no email on file)');
    return;
  }
  const name = user.displayName || user.username;
  const subject = `Welcome to DEPLOX, ${name}`;
  const text = [
    `Hi ${name},`,
    '',
    `You've signed in to DEPLOX with your GitHub account @${user.username}.`,
    '',
    'This is just a heads-up that you now have an account. There is',
    'nothing to verify -- your GitHub login is the only thing we need.',
    '',
    'Get started: https://deplox.site/dashboard',
    '',
    'If you did not sign in to DEPLOX, you can ignore this email --',
    'no action is required and no account was created without your',
    'explicit consent on the GitHub authorization screen.',
    '',
    '-- The DEPLOX team',
    'deplox.site',
  ].join('\n');
  const html = `<!doctype html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0a0a0a; line-height: 1.5;">
    <h1 style="font-size: 22px; margin: 0 0 16px; letter-spacing: -0.02em;">Welcome to DEPLOX, ${escapeHtml(name)}</h1>
    <p>You've signed in to <a href="https://deplox.site" style="color: #0a0a0a;">DEPLOX</a> with your GitHub account <code>@${escapeHtml(user.username)}</code>.</p>
    <p>This is just a heads-up that you now have an account. There is nothing to verify &mdash; your GitHub login is the only thing we need.</p>
    <p style="margin: 24px 0;">
      <a href="https://deplox.site/dashboard" style="display: inline-block; padding: 10px 18px; background: #0a0a0a; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 500;">Open dashboard &rarr;</a>
    </p>
    <p style="color: #6b6b6b; font-size: 13px;">If you did not sign in to DEPLOX, you can ignore this email &mdash; no action is required and no account was created without your explicit consent on the GitHub authorization screen.</p>
    <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 32px 0 16px;">
    <p style="color: #9a9a9a; font-size: 12px; margin: 0;">DEPLOX &middot; deplox.site</p>
  </body>
</html>`;
  // No await -- OAuth callback returns immediately.
  void sendEmail({ to: user.email, subject, html, text });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return c;
    }
  });
}
