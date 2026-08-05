# Accepted decisions, external unknowns, and risks

External citation IDs resolve in the [research source register](research.md#source-register). The captain accepted the contracts below on 2026-08-03 and subsequently authorized Gate 0 and the walking-skeleton implementation slice. That authorization permits the isolated build-time public-card OMN source projection, dated raw-checksum verification of one caller-held observed Card Vault response, strict derivation of its canonical official membership fact, narrowly scoped identity/base reconciliation with the pinned public card source, retention of uninterpreted upstream `art_variations` metadata, observed official-suffix-to-upstream-foiling correspondence, and completed capability-bound exact recipe-to-official identity reconciliation. Authorization also extends to narrow observed recipe/upstream rarity correspondence machinery over only the 209 mapped identities; its real four-source result remains pending separate captain acceptance. The captain-approved bounded Omens product-policy eligibility fact classifies the 209 mapped identities as draftable, the nine unmapped IAR identities as excluded, and the other 42 unmapped identities as unclassified; its real four-source result also remains pending separate captain acceptance. Authorization does not extend to rarity semantics, full suffix/treatment, art-variation/face/URL semantics, image accessibility identity, rear markers, physical slot or treatment classification, private pool-to-identity replacement, generated snapshots, collation generation, or runtime behavior.

## Accepted planning contracts

### DT-1 — community Omens MVP recipe accepted

- Official sources establish the visible 11C + 1R + 1R/M + 1RF shape and rear-two removal but do not publish the slot/card weights or print-run correlations [FAB-2][FAB-3][FAB-4].
- The captain downloaded `OMN_Draft_3.8 - Fixed New Layout Probabilities.txt` from the Rantaways server, which the captain records as widely used for draft practice, and approved it as the MVP recipe [COMMUNITY-1].
- The accepted recipe ID is `rantaways-omn-draft-3.8-fixed-layout-probabilities`; its SHA-256 is `97a964c8c5b6a962404398ca2b57c9ceeeb2dfb714512e61ff22e07ea1ec2328`.
- It is community evidence, not an official LSS publication or proof of factory print runs. Product copy must not call its probabilities official.
- Parser stages may consume it only behind strict checksum pinning and deterministic validation. Generation additionally requires the exact layout/pool/derived-probability fixtures and drift review described in [rules-and-collation.md](rules-and-collation.md#captain-approved-community-mvp-recipe).
- Its 228 layouts model the visible 14 cards. The physical boundary remains a conceptual 16-position pack followed by removal of two opaque rear markers; no named rear-card weights are invented.

### DT-2 — published terms and MIT accepted

- Proceed under the currently published upstream-source and LSS terms without requiring separate written confirmation [DATA-1][DATA-2][FAB-6].
- Draft Table's own software is MIT-licensed under the repository `LICENSE` file. That license does not relicense third-party card data, images, names, trademarks, or LSS property.
- Preserve source provenance, remote-image use, attribution/unofficial notice, no-logo/no-trade-dress boundary, free/non-commercial scope, and the documented revocability/terms-drift risk.

### DT-3 — all-disconnected cleanup accepted

- Close an all-disconnected lobby after 30 minutes.
- Close an all-disconnected paused started draft, or an all-disconnected timer-off started draft waiting with no connected drafter, after 24 hours.
- A successful reconnect invalidates the current cleanup generation; a later transition back to all-disconnected starts a fresh full grace period.
- Explicit all-left closure remains immediate; completion remains available for one hour. Active timed drafts keep their authoritative deadlines.

### DT-4 — manual seating and randomization accepted

- Pending `Randomize at start` is on by default.
- The first manual seat move/swap disables it and announces the change.
- `Randomize now` atomically applies an immediate server-owned shuffle and disables the pending start-time shuffle; `Randomize at start` explicitly re-enables it.

### DT-5 — timer-off readiness accepted

- Only connected occupied drafting seats gate the five-second confirmation.
- Empty/disconnected seats do not block and receive uniform random fallback at commit.
- A timer-off pick phase has no deadline until a complete, non-empty connected readiness set starts its five-second confirmation, including after resume. If no drafting seat is connected, do not start an autonomous confirmation loop. Existing timer-on deadlines continue; an all-disconnected timer-off started draft uses the accepted 24-hour started-draft cleanup period.

### DT-6 — vacated-seat queue accepted

- Every transition that vacates a non-host drafter seat, including explicit voluntary leave and host removal, atomically clears that seat's provisional pick before replacement inheritance or fallback resolution.
- The replacement inherits pool/current pack/future packs, may queue a new card, and receives uniform fallback if it does not.
- The permanent host remains non-removable.

### DT-7 — Fabrary progressive enhancement accepted

- Prefer the current public `tab=import&cards=...&format=Draft&name=...` behavior [FABR-1][FABR-2].
- Always provide the accepted text-list copy/open fallback. Do not use private authenticated GraphQL mutations and do not promise saved-deck creation without sign-in/confirmation.

## Risk register

| Risk | Evidence/impact | Mitigation/gate |
|---|---|---|
| Community recipe provenance | Rantaways recipe is captain-approved practice-server evidence, not official LSS collation [COMMUNITY-1]. | Label it community everywhere; pin checksum/version; exact integer fixtures; require explicit review for drift. |
| Recipe/card-source mismatch | Recipe embeds 209 custom cards while official membership contains 260 entries and richer treatments. | Use the completed exact capability-bound identity join described in [card snapshot reconciliation](rules-and-collation.md#card-snapshot-reconciliation); require separate four-source captain acceptance before treating the real rarity correspondence or draft-eligibility classification as established; embedded URLs never become runtime authority. |
| Rear-card identities unavailable | Community layouts start at 14 and official sources do not publish exact rear weights. | Use two typed opaque removed markers; retain excluded-entry metadata; never fabricate or expose rear outcomes. |
| Card scope mismatch | Product page says 251; official Card Vault returns 260 entries including nine IAR Marvels [FAB-3][FAB-7]. | Reconciliation fixture; classify all official entries; fail on drift. |
| Upstream drift/error | Data changes after tagged release and past tags are not back-patched [DATA-2][DATA-4]. | Pin tag/checksums; import validation report; update through reviewed PR only. |
| Upstream license ambiguity | Preferred data repository has no formal detected license despite broad README language [DATA-1][DATA-2]. | Accepted use is limited to current published terms; minimize redistribution, preserve provenance, and reopen review on terms change. |
| LSS permission revocation | Current permissions are conditional and expressly revocable [FAB-6]. | Compliant minimal use, contact/disable path, required attribution, no logos/trade dress/direct monetization. |
| Remote image outage/change | S3 URLs have no reviewed SLA; browser sends ordinary request metadata. | Text fallback, no server dependency, no-referrer, host allowlist, launch smoke. |
| Free quota exhaustion | Durable Object writes are estimated tighter than requests; over-limit operations fail [CF-4]. | Measured counters, thrash limits, accepted cleanup, stop new rooms before existing, quota alerts. |
| 10 ms CPU ceiling | Parsing, serialization, password verification, collation, and 16 projections can exceed Free Worker CPU [CF-1]. | Build-time recipe import, pre-generated packs, compact state, cached public fragments, worst-case benchmarks, no SSR/heavy KDF. |
| WebSocket deploy disconnect | Cloudflare disconnects sockets on code updates [CF-6][CF-8]. | Persist every authority mutation; version compatibility; reconnect tests; careful deploy windows. |
| At-least-once alarm | Deadline/cleanup alarm may retry [CF-7]. | Deadline generation + phase ID + storage transaction; idempotency tests. |
| Spectator privacy/collusion | Spectators intentionally see any POV's complete pack/pool. | Explicit role banner, server authorization, no queued card identity; acknowledge anti-collusion non-goal. |
| Browser token theft | Identity is a local bearer secret. | Strict CSP/no third-party scripts, newest-socket-wins, short room lifecycle, clear limits. |
| Password overconfidence | Fragment and fast verifier do not provide high-assurance secrecy. | Threat copy, WSS, rate limits, no logs, optional password labelled casual access. |
| Accessibility regression under card density | 14 card buttons, seat board, timers, and live updates are dense. | Semantic controls, bounded announcements, keyboard drag alternative, 8+8 browser/accessibility matrix. |
| Phone complexity | Eight seats and cards are dense. | Desktop/tablet primary, phone one-column/list alternatives; preserve all core actions. |
| Status feed data growth | Reconnect churn can grow state/writes. | Enumerated bounded events, cap 100, no per-pick events. |
| Multiple tabs | Same identity could race picks/host actions. | Newest authenticated connection wins; old socket closed/rejected. |
| All-disconnected timer-off behavior | Vacuous readiness could auto-draft repeatedly. | Require at least one connected occupied seat; use accepted paused/lobby cleanup. |
| No host recovery | Lost browser token permanently removes controls by design. | Explain before creation; host cannot be removed; no hidden transfer/recovery mechanism. |

## Verified external unknowns

As of the research date, no reviewed authoritative source was found for:

- official Omens Rare/Majestic, Rainbow Foil card/rarity, or card-sheet weights;
- full Omens factory print-sheet/run correlations or exact named rear-card weights;
- a stable public Fabrary deck-creation API or no-confirmation saved-deck deep link;
- an uptime/hotlink SLA for official image URLs;
- a formal license for `the-fab-cube/flesh-and-blood-cards`;
- a Cloudflare Free SLA or guarantee that cited allowances remain permanent.

The accepted community recipe supplies the MVP simulator model for the first item without converting it into official evidence. These unknowns remain visible provenance/operational risks rather than silent assumptions.

## Reopen conditions

Reopen the relevant review if the recipe checksum/format changes, card mapping no longer reconciles, upstream or LSS terms materially change, official collation supersedes community evidence, Fabrary's import contract changes without a working fallback, or measured Cloudflare usage misses the approved free-tier margin.
