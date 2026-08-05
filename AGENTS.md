# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Walking-skeleton implementation has begun; the authoritative setup, commands, and current scope are in `README.md` and root `package.json`. Accepted product contracts, external unknowns, and launch risks live under `docs/`.
- The captain approved the checksum-pinned community Omens 3.8 recipe and recorded policy decisions in `docs/risks-and-decisions.md`; its Phase 2 import must be test-first and separately reviewed. Do not commit the source recipe or generate a snapshot before that review.
- The v8.2.0 public English card input/schema and the observed 2026-08-04 official Card Vault Omens product response are build-time evidence inputs; follow the evidence workflow in `README.md`, never commit upstream bytes, and never add runtime fetches. The Card Vault raw checksum is dated evidence only; canonical official membership is the durable authority.
- Pinned public evidence must be obtained and checksum-verified when absent, never waived because a worker is isolated; only captain-held private recipe evidence is genuinely unavailable to workers.
- The approved boundary is a platform-independent TypeScript engine plus browser, Cloudflare Worker/Durable Object adapter, shared contracts, and a reviewed versioned set snapshot; see `docs/architecture.md`.
- Preserve recipe `common|rare|mythic` only at ingest and translate once to FaB-native common/rare/Majestic plus C/R/M; unknown labels remain generic parser failures. Rarity output must retain the authoritative per-row source-order code sequence including duplicates; its separately named first-observed unique set is only a lossy classification view. The pinned broad upstream domain is `C|R|M|P|V|T|L|S|B|F`; public guards pin 482 OMN official-base rows and 493 all-official retained rows differing by 11 IAR V rows. Scoped public-candidate and captain-held mapped sequence aggregates are authoritative in `docs/rules-and-collation.md`.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.

- Contracts named for a specific guard must semantically bypass that guard while preserving surrounding/source checks and prove the contract fails; deletion-only mutations are insufficient because another layer may mask the guard.
- Command and mutation evidence must assert that the intended command and named contract actually executed and produced its exact expected success/failure marker; usage errors, wrong environment variables, or arbitrary nonzero exits are invalid evidence even if reported as green.
- Mutation proofs for focused guard contracts must execute the **named** contract against a
  semantically modified copy of the production module, not a re-implemented fixture. Parameterize
  only the module path through a test-only environment variable that defaults to the production
  import, run the contract by exact name via `--test-name-pattern`, and assert the exact exit
  status, one execution marker, one `not ok` carrying the contract name, and one specific failure
  line. No loaders, interception, or shared harnesses. See
  `packages/set-omens/test/official-suffix-foiling-classification.test.mjs` for the reference
  implementation. The module path must target a file-local OS-temp isolated canonical-source
  snapshot that cleans setup and body failures and preserves dependency resolution. Never write
  mutation modules beside production source; loaders, interception, and shared mutation harnesses
  remain prohibited. Existing inline-duplicate proofs are follow-up candidates, not blessed.
