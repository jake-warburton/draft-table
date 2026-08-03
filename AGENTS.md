# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Implementation has not begun. The authoritative planning index is `README.md`; rules/research decisions and unresolved launch gates live under `docs/`.
- Do not implement or generate the Omens snapshot until the captain resolves the blocking entries in `docs/risks-and-decisions.md`, especially missing collation evidence and asset/data licensing.
- The approved future boundary is a platform-independent TypeScript engine plus browser, Cloudflare Worker/Durable Object adapter, shared contracts, and a reviewed versioned set snapshot; see `docs/architecture.md`.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
