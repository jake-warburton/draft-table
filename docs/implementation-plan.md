# Phased implementation plan and acceptance gates

This plan begins only after the captain approves implementation. The current repository intentionally contains no package scaffolding, application code, generated card data, deployment configuration, or tests.

Every phase uses strict red–green–refactor and the full no-mistakes delivery workflow. A phase is not complete merely because code exists; its acceptance gate, docs, and measured budgets must pass.

## Gate 0 — captain and evidence approval

Resolve or explicitly accept every blocking decision in [risks-and-decisions.md](risks-and-decisions.md), especially:

- DT-1 collation weights/correlations and evidence;
- DT-2 source-data/LSS rights and repository license;
- DT-3 disconnected idle cleanup;
- DT-4 seat randomization after manual arrangement;
- DT-5 timer-off/disconnected readiness.

Recheck all external sources/Cloudflare/Fabrary behavior. No implementation should claim authentic boosters until DT-1 is closed.

**Acceptance:** signed decision record, archived small evidence/checksums, no guessed factual rule.

## Phase 1 — workspace and quality spine

Create the minimal npm-workspaces TypeScript layout approved in [architecture.md](architecture.md#future-monorepo-boundary). Configure only necessary build/typecheck/lint/unit/integration/browser/doc commands and CI/no-mistakes. Add empty public boundaries through failing contract tests before implementation.

Avoid shared “utils”, plugin systems, generic event buses, multiple-set inheritance, deployment environments, and runtime dependencies without an immediate MVP use.

**Acceptance:** clean install is reproducible; baseline commands documented; CI/no-mistakes green; no product behavior yet; bundle tooling can report client/server sizes.

## Phase 2 — Omens import and reviewed snapshot

Test-first importer reads pinned v8.2.0 inputs plus the official Card Vault membership fixture, verifies checksums, reconciles 251 OMN + 9 IAR entries, classifies all treatments/slots/exclusions, and emits a compact versioned snapshot. Card images remain URLs.

Keep importer build-time only. Commit generated output only after human diff review and provenance report. Do not add a generic source marketplace.

**Acceptance:** every official product entry/treatment classified; no missing image/accessibility identity; excluded cards explicit; schema/checksum tests; snapshot size budget; reviewer can trace every field to source/evidence.

## Phase 3 — pure engine

Implement seeded random streams, physical pack generation/rear removal, seats/passing, provisional picks, timer/deadline transitions, fallback, pause, intermissions, vacancies, and visibility projection as pure functions. Start each behavior with tests from [testing.md](testing.md#unit-and-property-matrix).

**Acceptance:** unit/property matrix green for N=2..8; deterministic replay by seed/command trace; conservation/exclusion/visibility invariants; no platform imports; no unresolved collation unknown.

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
- DT decisions closed;
- no critical/high security or accessibility findings;
- measured per-room/quota model has captain-approved safety margin;
- static/runtime bundles within ratcheted budgets;
- docs and unofficial notice accurate;
- all tests/lint/typecheck/docs/license checks and no-mistakes CI green.

## Post-MVP work deliberately not designed now

A future set may use the same import boundary only after evidence exists. Do not build accounts, bots, chat, matchmaking, rankings, replay/event sourcing, internal deck construction, paid tiers, native apps, or generalized tournament systems as “foundations.” Add a new abstraction only when the second real use requires it.
