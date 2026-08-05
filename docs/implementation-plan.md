# Phased implementation plan and acceptance gates

Gate 0 is complete, the repository contains the walking-skeleton slice of Phase 1, and Phase 2 is underway. The [README](../README.md) owns the current implementation scope.

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

A test-first build-time importer will read pinned v8.2.0 inputs, reviewed official Card Vault membership evidence, and the checksum-verified community 3.8 recipe. Implemented public-card slices project exact source-order `set_id === "OMN"` identities and printings through the build-time-only schema-validation entry point, with pinned 251-card/482-printing/251-distinct-collector-ID aggregates, and retain the raw checksum of one caller-held 2026-08-04 Card Vault response as dated evidence. A separate strict build-time canonicalization establishes its 260-entry official membership (251 OMN + 9 IAR) independently of response serialization. All 260 validated exact bases are now joined to pinned upstream identities and all matching OMN and IAR printing rows. Current reconciliation scope, including retained uninterpreted `art_variations` metadata and the observed suffix-to-upstream-foiling correspondence, is specified in [card snapshot reconciliation](rules-and-collation.md#card-snapshot-reconciliation). Exact collector-first, derived pitch-name recipe-to-official identity reconciliation is complete through an opaque build-time capability, establishing 209 mapped and 51 `unmapped` identities. `unmapped` is not an exclusion or non-draftability classification. The following capability-bound rarity machinery implements the mapped-only observed-metadata contract specified in [card snapshot reconciliation](rules-and-collation.md#card-snapshot-reconciliation), but the real four-source result remains captain-acceptance-pending. Rarity is not itself slot, treatment, exclusion, draftability, probability, or runtime semantics. A separate bounded product-policy classification now marks the 209 mapped identities draftable, excludes only the nine unmapped IAR identities, and leaves the other 42 unmapped identities unclassified; its real four-source result is also captain-acceptance-pending. Validated pool references now resolve by exact same-source recipe ownership, then collector-first reconciliation, then exact draftable eligibility to ordered official identity facts without selecting physical forms; the real four-source pool result is captain-acceptance-pending. All validated weighted layout positions now preserve source order, repeated-reference multiplicity, and explicit recipe-structural common-rarity, fixed-rare, rare-or-majestic, and rainbow-foil roles while pointing to those exact opaque pools; these roles do not represent physical slots, and the real four-source layout result is captain-acceptance-pending. Suffix/treatment/art/face/URL semantics, physical-slot and treatment classification, all exclusion/draftability work beyond that partial identity fact, printing/treatment selection, generated/versioned snapshots, image accessibility identity, rear markers, runtime card-pool and collation generation, simulation, and runtime behavior remain unimplemented. Card images remain URLs; embedded recipe URLs are not runtime authority.

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
