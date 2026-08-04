# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Walking-skeleton implementation has begun; the authoritative setup, commands, and current scope are in `README.md` and root `package.json`. Accepted product contracts, external unknowns, and launch risks live under `docs/`.
- The captain approved the checksum-pinned community Omens 3.8 recipe and recorded policy decisions in `docs/risks-and-decisions.md`; its Phase 2 import must be test-first and separately reviewed. Do not commit the source recipe or generate a snapshot before that review.
- The v8.2.0 public English card input and schema are separately checksum-pinned build-time inputs; follow the evidence workflow in `README.md`, never commit upstream bytes, and never add runtime fetches.
- The approved boundary is a platform-independent TypeScript engine plus browser, Cloudflare Worker/Durable Object adapter, shared contracts, and a reviewed versioned set snapshot; see `docs/architecture.md`.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.

- Contracts named for a specific guard must semantically bypass that guard while preserving surrounding/source checks and prove the contract fails; deletion-only mutations are insufficient because another layer may mask the guard.
