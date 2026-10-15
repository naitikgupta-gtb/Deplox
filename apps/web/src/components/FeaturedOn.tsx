/**
 * FeaturedOn — "as featured on" social-proof row, sits between the hero
 * and the "Live on deplox" strip on the landing page.
 *
 * Each item links to the actual post/page. After each post goes live, swap
 * the `href` for the live post URL (Show HN thread, Reddit post, etc.).
 * Until then the brand-page links act as soft placeholders — the section
 * still renders and signals that we're actively posting.
 *
 * Icons are monochrome letter-in-tile badges, matching the FrameworkIcon
 * pattern in apps/web/src/components/Icon.tsx. Using a single letter
 * (Y / R / X) keeps us inside the "no fake logos" rule while still being
 * instantly recognizable.
 */

import type { ReactNode } from 'react';

interface FeaturedItem {
  /** Brand name, e.g. "Hacker News". */
  label: string;
  /** Sub-label / context, e.g. "Show HN" or "#buildinpublic". */
  handle: string;
  /** Where to link. Swap to the live post URL after it goes up. */
  href: string;
  /** 1-2 letter monogram rendered in a rounded square. */
  badge: string;
}

const FEATURED: FeaturedItem[] = [
  {
    label: 'Hacker News',
    handle: 'Show HN',
    href: 'https://news.ycombinator.com/from?site=deplox.site',
    badge: 'Y',
  },
  {
    label: 'Reddit · r/webdev',
    handle: 'Show & Tell',
    href: 'https://www.reddit.com/r/webdev/search/?q=deplox&restrict_sr=on',
    badge: 'R',
  },
  {
    label: 'Twitter / X',
    handle: '#buildinpublic',
    href: 'https://twitter.com/deploxhq',
    badge: 'X',
  },
];

export function FeaturedOn(): JSX.Element {
  return (
    <section className="featured-on" aria-label="Featured on">
      <div className="featured-on-label">As featured on</div>
      <ul className="featured-on-list">
        {FEATURED.map((item) => (
          <li key={item.label}>
            <a
              className="featured-on-item"
              href={item.href}
              target="_blank"
              rel="noreferrer"
              title={`${item.label} — ${item.handle}`}
            >
              <span className="featured-on-badge" aria-hidden="true">
                {item.badge}
              </span>
              <span className="featured-on-text">
                <span className="featured-on-name">{item.label}</span>
                <span className="featured-on-handle">{item.handle}</span>
              </span>
              <svg
                className="featured-on-arrow"
                viewBox="0 0 24 24"
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M7 17 17 7" />
                <path d="M7 7h10v10" />
              </svg>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
