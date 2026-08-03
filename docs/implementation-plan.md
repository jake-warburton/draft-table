# Phased implementation plan and acceptance gates

Gate 0 is complete and the walking-skeleton slice of Phase 1 has begun. The repository now contains the minimal npm-workspaces TypeScript scaffold, an unofficial neutral browser shell, and its smoke contract; generated card data, product behavior, and deployment configuration have not begun.

Every phase uses strict red–green–refactor and the full no-mistakes delivery workflow. A phase is not complete merely because code exists; its acceptance gate, docs, and measured budgets must pass.

## Gate 0 — separate implementation authorization and evidence freeze (complete)

The captain separately authorized the walking-skeleton implementation after verifying that:

- the captain-held community recipe is available under the accepted filename/recipe ID and exact SHA-256 `97a964c8c5b6a962404398ca2b57c9ceeeb2dfb714512e61ff22e07ea1ec2328`;
- its community—not official—provenance and 14-card scope remain explicit;
- published source/LSS terms have not materially changed, attribution boundaries remain satisfied, and the repository's standard MIT `LICENSE` is present;
- the accepted cleanup, randomization, readiness, and vacated-seat queue contracts remain unchanged;
- external Card Vault, Cloudflare, and Fabrary behavior is rechecked.

**Acceptance:** explicit implementation authorization, immutable evidence/checksum record, no guessed factual rule or rear-card identity, and any drift handled as a new reviewed recipe/version.

## Phase 1 — workspace and quality spine

Complete the minimal npm-workspaces TypeScript layout approved in [architecture.md](architecture.md#monorepo-boundary). The initial scaffold provides build, typecheck, lint, smoke-test, and bundle-size commands plus empty non-web public boundaries; add further integration, browser, documentation, and CI commands only when their implementation slices require them.

Avoid shared “utils”, plugin systems, generic event buses, multiple-set inheritance, deployment environments, and runtime dependencies without an immediate MVP use.

**Acceptance:** clean install is reproducible; baseline commands documented; CI/no-mistakes green; no product behavior yet; bundle tooling enforces the emitted-client budget and reports the zero-byte, not-yet-emitted server boundary.

## Phase 2 — Omens and community-recipe import

A test-first build-time importer reads pinned v8.2.0 inputs, the official Card Vault membership fixture, and the checksum-verified community 3.8 recipe. It reconciles 251 OMN + 9 IAR product entries, classifies all treatments/slots/exclusions, maps all 209 recipe card names/collector IDs to snapshot identities/treatments, and emits compact independently versioned set and visible-recipe snapshots. Card images remain URLs; embedded recipe URLs are not runtime authority.

The strict recipe parser must validate the exact format, 228 layouts/460,800 total weight, 38×6 structure, six coefficients, all 11 pool counts/totals, `withReplacement=false`, and exact derived probabilities from [rules-and-collation.md](rules-and-collation.md#captain-approved-community-mvp-recipe). Keep all import work build-time. Commit generated output or the full evidence file only after a separate provenance/license and human-diff review; do not add a generic source marketplace.

**Acceptance:** every official product entry/treatment classified; every recipe reference mapped exactly once; no missing image/accessibility identity; excluded cards explicit; checksum/schema/integer-fixture tests; snapshot size budget; reviewer can trace every field to official, upstream, or clearly labelled community evidence.

## Phase 3 — pure engine

Implement seeded random streams, weighted visible-layout/card-pool generation, conceptual 16-position pack wrapping and opaque rear-marker removal, seats/passing, provisional picks, timer/deadline transitions, fallback, pause, accepted cleanup/readiness/replacement rules, intermissions, vacancies, and visibility projection as pure functions. Every non-host drafter seat vacancy, whether explicit voluntary leave or host removal, must atomically clear its provisional queue before replacement inheritance or fallback. Start each behavior with tests from [testing.md](testing.md#unit-and-property-matrix).

**Acceptance:** unit/property matrix green for N=2..8; deterministic replay by seed/command trace; exact recipe integer fixtures; conservation/exclusion/visibility invariants; no platform imports; no fabricated rear identity or claim of official community probabilities.

## Phase 4 — contracts and Durable Object adapter

Define strict runtime protocol validators from the planning envelope, then implement thin Worker routing and one SQLite Durable Object per room with hibernating WebSockets, one alarm, storage-first commit, command dedupe, and role projections.

**Acceptance:** full integration matrix green; hibernation/restart/alarm duplicate tests; 16 sockets; no secret projection; worst transition meets CPU/state/frame budgets; no additional Cloudflare product.

## Phase 5 — accessible room/lobby client

Build create/join/reconnect, fragment password flow, status feed, host configuration, eight-seat/spectator board, pointer drag, and full keyboard move/swap alternative. Use original minimal styling with no FAB trade dress.

**Acceptance:** create/join/lobby multi-client tests; fragment absent from requests; keyboard-only seat management; screen-reader names/announcements; responsive desktop/tablet/phone core; axe/manual checks.

## Phase 6 — draft/review/spectator client

Build current pack, provisional queue, timer/progress/pause, pool visibility, reviews, connection recovery, spectator mid-join and POV projection, RF treatment, and image failure fallback.

**Acceptance:** two-player and 8+8 browser scenarios green in Chromium/Firefox/WebKit; no selected-card leak in frames/DOM; Tab+Enter complete; reduced motion/non-colour cues; load and Lighthouse targets.

## Phase 7 — completion and Fabrary

Implement identity-collapsed pool export, public deep-link contract test, copyable native text fallback, explicit external navigation, completion view, and one-hour expiry UX.

**Acceptance:** test pool pre-populates current Fabrary import flow or automatically uses fallback; sign-in/hero-selection limitations stated; URL contains no room secrets; expiry and cleanup pass end-to-end.

## Phase 8 — hardening and public-beta gate

Run adversarial protocol/auth/visibility tests, reconnect/deploy simulation, quota/load model with measured counters, dependency/license review, CSP/header review, actual Safari/VoiceOver and Windows screen-reader smoke checks, copy review, and full no-mistakes PR/CI.

**Acceptance:**

- current external sources revalidated;
- accepted planning contracts unchanged or explicitly re-reviewed;
- no critical/high security or accessibility findings;
- measured per-room/quota model has captain-approved safety margin;
- static/runtime bundles within ratcheted budgets;
- docs and unofficial notice accurate;
- all tests/lint/typecheck/docs/license checks and no-mistakes CI green.

## Post-MVP work deliberately not designed now

A future set may use the same import boundary only after evidence exists. Do not build accounts, bots, chat, matchmaking, rankings, replay/event sourcing, internal deck construction, paid tiers, native apps, or generalized tournament systems as “foundations.” Add a new abstraction only when the second real use requires it.
