# DESIGN_RULES.md

Per [DEPLOX_IDEA.md §9](DEPLOX_IDEA.md#9-design-philosophy--copy-rules), the UI must be plain, honest, and quiet.

## Anti-patterns we avoid

| Avoid | Why |
|-------|-----|
| Purple gradient buttons | Looks like every other SaaS landing page; signals "marketing-led, not product-led". |
| Pill-shaped buttons | Same reason; pills have no functional advantage over rectangles. |
| Emoji icons in functional UI | Suggests a casual product. We use plain SVG (Lucide-style) only. |
| "Made with AI" badges / cursor tricks | We are an AI-accelerated project, not an AI-powered one. Confusing the two damages trust. |
| Fake social proof ("10k+ developers") | Dishonest. We will say real numbers or say nothing. |
| Marketing jargon ("Revolutionize", "Supercharge") | Tells the reader nothing. |
| Glassmorphism, neumorphism, parallax | Distracts from the actual product. |

## What we build

- **Plain, crisp whitespace.** A 980px content column with generous vertical rhythm.
- **Typography-driven contrast.** `ui-sans-serif` for body, `ui-monospace` for code. We don't ship custom fonts.
- **Standard icon set.** Lucide / Heroicons style; inline SVG only where strictly necessary.
- **Direct, honest micro-copy.** "Deploy your GitHub repository." not "Seamlessly unlock the future of modern deployment!"
- **Real UI screenshots & verifiable stats.** No fake dashboards in marketing materials.

## Status pill color rules

| Status | Color | Why |
|--------|-------|-----|
| `running` | green | safe — it's live. |
| `building` / `starting` / `cloning` / `detecting` | amber | transient — still in progress. |
| `failed` | red | something went wrong. |
| `stopped` / `rolled-back` | muted gray | no longer serving traffic. |
| `queued` | muted gray | waiting. |

Defined in `apps/web/src/styles/global.css`.

## Copy guidelines

| Good | Bad |
|------|-----|
| "Deploy your GitHub repository." | "Seamlessly unlock the future of modern deployment!" |
| "Your build failed. Check the logs." | "Oopsie! Something went sideways." |
| "Build complete in 4.2s." | "Supercharged your app at the speed of thought!" |
| "Free tier: 2 projects." | "Get started for free (and we mean really free forever)!" |

## Component rules

- **Tables** are the default for lists (projects, deployments, env vars). No card grids for tabular data.
- **Forms** are stacked, single-column, max 480px wide.
- **Buttons** are rectangular with `border-radius: 4px`. Primary buttons are solid black.
- **Inputs** have a 2px focus outline in `--primary` — no glow.
- **No modal dialogs** for confirmation. Inline confirm + undo is preferred.

## Page hierarchy

```
Top bar  →  brand (left) | nav (right)
Main     →  h1 page title  →  primary action (right-aligned)
Sections →  h2 + table/form/list
Footer   →  one-line product tagline
```

## Marketing site tone

When we ship the marketing site (Stage 3.5), every claim must be:
1. Verifiable inside the product (open dashboard, see the same number).
2. Time-stamped (no "always" or "never" without a contract).
3. Free of superlatives.

If a claim fails any of the three, the page doesn't ship.