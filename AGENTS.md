# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Walking-skeleton implementation has begun; the authoritative setup, commands, and current scope are in `README.md` and root `package.json`. Accepted product contracts, external unknowns, and launch risks live under `docs/`.
- The captain approved the checksum-pinned community Omens 3.8 recipe and recorded policy decisions in `docs/risks-and-decisions.md`; its Phase 2 import must be test-first and separately reviewed. Do not commit the source recipe or generate a snapshot before that review.
- The v8.2.0 public English card input/schema and the observed 2026-08-04 official Card Vault Omens product response are build-time evidence inputs; follow the evidence workflow in `README.md`, never commit upstream bytes, and never add runtime fetches. The Card Vault raw checksum is dated evidence only; canonical official membership is the durable authority.
- Pinned public evidence must be obtained and checksum-verified when absent, never waived because a worker is isolated; only captain-held private recipe evidence is genuinely unavailable to workers.
- The approved boundary is a platform-independent TypeScript engine plus browser, Cloudflare Worker/Durable Object adapter, shared contracts, and a reviewed versioned set snapshot; see `docs/architecture.md`.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.

- Contracts named for a specific guard must semantically bypass that guard while preserving surrounding/source checks and prove the contract fails; deletion-only mutations are insufficient because another layer may mask the guard.
- Command and mutation evidence must assert that the intended command and named contract actually executed and produced its exact expected success/failure marker; usage errors, wrong environment variables, or arbitrary nonzero exits are invalid evidence even if reported as green.
- By default, new mutation proofs for focused guard contracts should use a named `node:test` contract that owns the fictional fixture, emits a unique exact execution marker, parameterizes only the production module URL/path through a dedicated test-only environment variable with dynamic import and the normal production import as its unset default, and has the probe write the semantically modified module to a temporary path and run that exact test via `--test-name-pattern` with that one variable, without duplicating the fixture; the outer proof must assert the exact exit status, exactly one execution marker, exactly one `not ok` carrying the contract name, and exactly one specific failure/assertion line so nonexecution, usage errors, wrong tests, and unrelated failures cannot pass, using direct named-test execution with parameterized module source rather than a custom loader, interception framework, shared duplicated fixture, or generalized harness machinery, while existing weaker inline-duplicate proofs remain follow-up candidates rather than being silently blessed.
