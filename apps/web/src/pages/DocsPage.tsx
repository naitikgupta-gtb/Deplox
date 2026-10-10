import { useState } from 'react';
import { Link } from 'react-router-dom';
import { IconArrowRight, IconBook, IconCheck, IconGithub } from '../components/Icon';
import { useMeta } from '../lib/use-meta';

export function DocsPage(): JSX.Element {
  useMeta({
    title: 'Docs — Get started with DEPLOX',
    description:
      'How to deploy your first GitHub repo on DEPLOX. Step-by-step guide covering GitHub login, framework detection, env vars, custom domains, and the deploy API.',
    path: '/docs',
  });
  return (

interface DocSection {
  readonly id: string;
  readonly title: string;
  readonly content: ReadonlyArray<DocBlock>;
}

type DocBlock =
  | { readonly type: 'p'; readonly text: string }
  | { readonly type: 'h'; readonly text: string }
  | { readonly type: 'code'; readonly text: string; readonly lang?: string }
  | { readonly type: 'list'; readonly items: ReadonlyArray<string> }
  | { readonly type: 'callout'; readonly tone: 'info' | 'warn'; readonly text: string };

const SECTIONS: ReadonlyArray<DocSection> = [
  {
    id: 'getting-started',
    title: 'Getting started',
    content: [
      { type: 'p', text: 'DEPLOX deploys your GitHub repositories on every push. Three steps to your first live URL.' },
      { type: 'h', text: '1. Connect your GitHub account' },
      { type: 'p', text: 'Click Log in with GitHub on the home page. We ask for read access to your repos and write access to deploy keys (you can revoke anytime).' },
      { type: 'h', text: '2. Pick a repo and framework' },
      { type: 'p', text: 'From the New project page, select any repo you own or have admin access to. DEPLOX auto-detects React, Next.js, Node, Python, Go, and static HTML. You can override the framework manually.' },
      { type: 'h', text: '3. Click Deploy' },
      { type: 'p', text: 'Within ~2 minutes you have a public HTTPS URL with deterministic format: https://<project-name>.<your-domain>' },
    ],
  },
  {
    id: 'frameworks',
    title: 'Frameworks',
    content: [
      { type: 'p', text: 'DEPLOX detects these frameworks automatically from your repo files. You can override the detection in project settings.' },
      { type: 'list', items: [
        'React (Vite, CRA) — npm run build → dist/',
        'Next.js — npm run build → .next/',
        'Node.js (Express, Fastify, Koa) — npm start → runtime port',
        'Python (Flask, FastAPI, Django) — pip install + gunicorn',
        'Go — go build → ./bin/server',
        'Static HTML — index.html + assets → file_server',
      ] },
      { type: 'callout', tone: 'info', text: 'Bring-your-own-Dockerfile support is in Phase 5. For now, framework must be one of the six above.' },
    ],
  },
  {
    id: 'env-vars',
    title: 'Environment variables',
    content: [
      { type: 'p', text: 'Encrypted with AES-256-GCM at rest. Decrypted only inside the runtime container. Never logged, never exposed to build phase.' },
      { type: 'h', text: 'Setting variables' },
      { type: 'p', text: 'On the project page, scroll to Environment variables. Add keys (UPPER_SNAKE_CASE) and values. Mark sensitive variables as "secret" — values get masked in the UI.' },
      { type: 'callout', tone: 'warn', text: 'Variable changes only apply on next deploy. Click Deploy to apply.' },
      { type: 'h', text: 'How decryption works' },
      { type: 'list', items: [
        'Master encryption key from DEPLOX_ENCRYPTION_KEY env var',
        'Each variable encrypted with random IV',
        'Decrypted on container start, injected as process env',
        'Build phase never sees decrypted values',
        'Rotate key = re-encrypt all values (admin task)',
      ] },
    ],
  },
  {
    id: 'webhooks',
    title: 'GitHub webhooks',
    content: [
      { type: 'p', text: 'Auto-deploy when you push. Each project has a unique payload URL and HMAC secret.' },
      { type: 'h', text: 'Configuring on GitHub' },
      { type: 'list', items: [
        'Repo → Settings → Webhooks → Add webhook',
        'Payload URL: copy from DEPLOX project page',
        'Content type: application/json',
        'Secret: copy from DEPLOX project page (or click Rotate)',
        'Events: just the push event (or pull_request if you want PR previews)',
      ] },
      { type: 'h', text: 'Verification' },
      { type: 'p', text: 'Every webhook includes X-Hub-Signature-256 header with HMAC-SHA256 of the body. DEPLOX verifies it before triggering deploy — invalid signatures are rejected with 401.' },
      { type: 'code', lang: 'bash', text: '# Test locally with curl:\ncurl -X POST https://deplox.net/webhooks/github/<project-id> \\\n  -H "Content-Type: application/json" \\\n  -H "X-Hub-Signature-256: sha256=..." \\\n  -d \'{"ref":"refs/heads/main","head_commit":{"id":"abc123","message":"test"}}\'' },
    ],
  },
  {
    id: 'custom-domains',
    title: 'Custom domains',
    content: [
      { type: 'p', text: 'Bring your own domain. Available on Pro plan and above.' },
      { type: 'h', text: 'Setup' },
      { type: 'list', items: [
        'Project page → Custom domain → enter hostname (e.g. myapp.example.com)',
        'Point your DNS A record at the DEPLOX server IP, or CNAME at <tunnel>.trycloudflare.com',
        'DEPLOX issues a Let\'s Encrypt certificate on first request via Caddy\'s on-demand TLS',
        'Live in under 5 minutes typically',
      ] },
      { type: 'callout', tone: 'info', text: 'Caddy integration requires DEPLOX_CADDY_ADMIN_URL to point at a running Caddy admin API (default: http://localhost:2019). Without it, custom domains are recorded but not routed.' },
    ],
  },
  {
    id: 'security',
    title: 'Security',
    content: [
      { type: 'p', text: 'DEPLOX runs untrusted user code. The architecture is split into 3 isolated planes.' },
      { type: 'h', text: '1. Control plane' },
      { type: 'p', text: 'Your dashboard, project state, secrets database, orchestration API. User code NEVER runs here.' },
      { type: 'h', text: '2. Build plane' },
      { type: 'list', items: [
        'Strictly network-limited: package registries only',
        'CPU/RAM capped per build',
        'No runtime secrets injected',
        'Container escape affects only build host, not other users',
      ] },
      { type: 'h', text: '3. Runtime plane' },
      { type: 'list', items: [
        'Completely isolated per-user Docker network',
        'Unprivileged non-root user inside container',
        'Project-only env vars injected',
        'Resource limits enforced (memory, CPU)',
      ] },
      { type: 'p', text: 'Full architecture in DEPLOX_SECURITY_ARCHITECTURE.md (GitHub repo).' },
    ],
  },
  {
    id: 'pricing',
    title: 'Plans & limits',
    content: [
      { type: 'p', text: 'Three plans. Free is generous; Pro is ₹199/mo; Team is ₹999/mo.' },
      { type: 'list', items: [
        'Free — 7 projects, 50 GB egress/month, no custom domain',
        'Pro — 25 projects, 500 GB egress/month, free custom domain, priority builds',
        'Team — unlimited projects, 5 TB egress/month, unlimited collaborators, audit logs',
      ] },
      { type: 'p', text: 'No hidden overage fees. Email alerts at 80% of cap.' },
    ],
  },
];

export function DocsPage(): JSX.Element {
  const [active, setActive] = useState(SECTIONS[0]?.id ?? '');
  const section = SECTIONS.find((s) => s.id === active) ?? SECTIONS[0];

  return (
    <div className="docs">
      <aside className="docs-sidebar">
        <div className="docs-sidebar-header">
          <IconBook size={14} />
          <span>Documentation</span>
        </div>
        <nav className="docs-nav">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              className={`docs-nav-item${s.id === active ? ' docs-nav-active' : ''}`}
              onClick={() => setActive(s.id)}
            >
              {s.title}
            </button>
          ))}
        </nav>
        <div className="docs-sidebar-footer">
          <a
            href="https://github.com/deplox/deplox"
            target="_blank"
            rel="noreferrer"
            className="docs-side-link"
          >
            <IconGithub size={12} /> Source on GitHub
          </a>
          <Link to="/changelog" className="docs-side-link">
            <IconArrowRight size={12} /> Changelog
          </Link>
        </div>
      </aside>

      <article className="docs-content">
        {section && (
          <>
            <h1>{section.title}</h1>
            {section.content.map((block, idx) => renderBlock(block, idx))}
          </>
        )}
      </article>
    </div>
  );
}

function renderBlock(block: DocBlock, idx: number): JSX.Element {
  switch (block.type) {
    case 'p':
      return <p key={idx} className="doc-p">{block.text}</p>;
    case 'h':
      return <h3 key={idx} className="doc-h">{block.text}</h3>;
    case 'code':
      return (
        <pre key={idx} className="doc-code">
          <code>{block.text}</code>
        </pre>
      );
    case 'list':
      return (
        <ul key={idx} className="doc-list">
          {block.items.map((item, i) => (
            <li key={i}><IconCheck size={12} /> <span>{item}</span></li>
          ))}
        </ul>
      );
    case 'callout':
      return (
        <div key={idx} className={`banner ${block.tone === 'warn' ? 'mock' : 'info'} doc-callout`}>
          <span>{block.text}</span>
        </div>
      );
  }
}