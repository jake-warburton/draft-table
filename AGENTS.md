# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Implementation has not begun. The authoritative planning index is `README.md`; accepted product contracts, external unknowns, and launch risks live under `docs/`.
- The captain approved the checksum-pinned community Omens 3.8 recipe and recorded policy decisions in `docs/risks-and-decisions.md`; implementation still requires separate approval and a test-first importer. Do not commit the source recipe or generate a snapshot during planning.
- The approved future boundary is a platform-independent TypeScript engine plus browser, Cloudflare Worker/Durable Object adapter, shared contracts, and a reviewed versioned set snapshot; see `docs/architecture.md`.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
