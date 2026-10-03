# DEPLOX specification documents

This folder is the source of truth for how DEPLOX is designed. Each document corresponds to a numbered item in [DEPLOX_IDEA.md §16](DEPLOX_IDEA.md#16-specification-documents-index).

| # | File | Scope |
|---|------|-------|
| 1 | [ARCHITECTURE.md](ARCHITECTURE.md) | Core 3-plane system model |
| 2 | [SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md) | Isolation rules per plane |
| 3 | [THREAT_MODEL.md](THREAT_MODEL.md) | Threats and mitigations |
| 4 | [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) | Monorepo layout rationale |
| 5 | [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) | Env var schemas and secrets |
| 6 | [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) | Stage 1 → 2 → 3 plan |
| 7 | [DESIGN_RULES.md](DESIGN_RULES.md) | UI & copy anti-patterns |
| 8 | [BUILD_SYSTEM.md](BUILD_SYSTEM.md) | Container build pipeline |
| 9 | [USER_FLOWS.md](USER_FLOWS.md) | Auth and deploy UX |
| 10 | [OPERATIONS.md](OPERATIONS.md) | Incidents, billing, ops |
| 11 | [DEPLOX_IDEA.md](DEPLOX_IDEA.md) | Complete vision spec (v1.0.0) |

If code drifts from a document, **the document wins** for product intent and **the code wins** for current truth — file a follow-up to reconcile.