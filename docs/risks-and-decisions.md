# Risks, verified unknowns, and captain decisions

External citation IDs resolve in the [research source register](research.md#source-register). `Blocking` means implementation or launch must not silently choose an answer.

## Decision register

### DT-1 — missing Omens collation weights and print-run evidence

- **Status:** Blocking implementation of authentic pack generation.
- **Verified:** Official sources publish 11 Common, one Rare, one Rare-or-Majestic, one Rainbow Foil, and two rear Basic-family positions; Cold Foil is approximately 1/24 and replaces a Basic [FAB-3]. The rear two are removed [FAB-2][FAB-4].
- **Unknown:** Rare/Majestic split, Rainbow Foil rarity/card weights, card sheet weights, Cold Foil position/card weights, and print-run correlations.
- **Recommendation:** obtain official evidence or a captain-approved sealed-product observation fixture with sample size/confidence. Use independent published slot draws where correlation evidence remains absent. Never infer from card counts or call an estimate official.
- **Captain must choose:** block public implementation until evidence exists (recommended), or approve a clearly labelled non-authentic experimental recipe. The latter conflicts with the MVP authenticity requirement and should not ship as MVP.

### DT-2 — card data/image/app rights and repository license

- **Status:** Blocking public launch; data snapshot implementation should also wait for maintainer/legal comfort.
- **Verified:** Preferred data repo has no formal/detected license despite permissive README language [DATA-1][DATA-2]. Fabrary package metadata says MIT but it transforms that source [DATA-5]. LSS grants revocable, conditional card-image/third-party-app permission, requires attribution/disclaimer, restricts direct monetization and commercial entities, and forbids third-party app logo use [FAB-6].
- **Recommendation:** ask upstream for an explicit license and seek written LSS confirmation for a free public draft simulator; choose Draft Table's own open-source code license separately before code arrives. Keep official images remote and data provenance explicit.
- **Captain must choose:** whether written confirmations are launch requirements and which code license the public repository will use.

### DT-3 — idle cleanup for disconnected lobbies/paused drafts

- **Status:** Blocking lifecycle implementation/free-storage safety.
- **Verified requirements:** explicit all-left rooms close; completion expires after one hour; disconnect preserves identity/seat; host-disconnected controls remain unavailable.
- **Conflict:** a never-started room or host-paused draft with all sockets disconnected may never reach completion or explicit leave, leaking storage indefinitely.
- **Recommendation:** add an all-disconnected grace alarm: 30 minutes for lobby and 24 hours for paused started room, reset by successful reconnect. Warn before closure where connected. These durations are product policy, not external rules.
- **Captain must choose:** grace durations and whether a paused draft should ever auto-close.

### DT-4 — default randomization versus manual seat arrangement

- **Status:** Needed before lobby implementation.
- **Requirement tension:** seats randomize by default immediately before start, while the host can manually arrange seats before start.
- **Recommendation:** pending randomization defaults on; the first manual move/swap turns it off with a visible announcement; host may re-enable or `Randomize now`. This makes manual arrangement meaningful without losing the default.
- **Captain must choose:** approve this interaction or always randomize despite manual layout.

### DT-5 — timer-off readiness with disconnected/empty seats

- **Status:** Blocking engine semantics.
- **Conflict:** `all active players queued` can deadlock timer-off rooms when an occupied seat disconnects; empty seats cannot queue but must preserve pack flow.
- **Recommendation:** readiness includes connected occupied draft seats only. Empty/disconnected seats do not block the five-second confirmation and receive uniform random fallback. If no drafter is connected, do not spin repeated confirmations; use DT-3 cleanup, unless timers were already on and deadlines continue.
- **Captain must choose:** approve, or define disconnected occupants as blockers and accept possible host intervention/deadlock.

### DT-6 — queue state when a drafting occupant is removed

- **Status:** Needed before post-start seat replacement.
- **Recommendation:** clear the removed occupant's queued selection. The replacement sees the inherited pack/pool and may queue; fallback applies if it does not. Keeping an undisclosed inherited choice is surprising and lets a removed player control the replacement's pick.
- **Captain must choose:** clear (recommended) or retain.

### DT-7 — Fabrary deep link stability

- **Status:** Non-blocking with fallback.
- **Verified:** current public client supports `tab=import`, `cards`, `format`, and `name`, but this is deployed client behavior, not a versioned public API [FABR-1][FABR-2]. Sign-in and hero choice may remain.
- **Decision:** adopt the deep link as preferred progressive enhancement and always ship the accepted text-list copy/open fallback. No private GraphQL usage. Captain review only if product copy must promise one click; recommendation is `Create in Fabrary` with a short sign-in caveat.

## Risk register

| Risk | Evidence/impact | Mitigation/gate |
|---|---|---|
| Card scope mismatch | Product page says 251; official Card Vault returns 260 entries including nine IAR Marvels [FAB-3][FAB-7]. | Reconciliation fixture; classify all official entries; fail on drift. |
| Upstream drift/error | Data continues changing after tagged release and past tags are not back-patched [DATA-2][DATA-4]. | Pin tag/checksums; import validation report; update through reviewed PR only. |
| Remote image outage/change | S3 URLs have no reviewed SLA; browser leaks normal request metadata. | Text fallback, no server dependency, no-referrer, host allowlist, launch smoke. |
| LSS permission revocation | Current permissions expressly revocable [FAB-6]. | Minimal compliant use, contact path, ability to disable images, no logos/monetization. |
| Free quota exhaustion | DO writes estimated tighter than requests; over-limit operations fail [CF-4]. | Measured counters, thrash limits, cleanup, stop new rooms before existing, quota alerts. |
| 10 ms CPU ceiling | Serialization, password KDF, collation, and 16 projections can exceed Free Worker CPU [CF-1]. | Pre-generate packs, compact state, cache public fragment, benchmark worst transition, no SSR/heavy KDF. |
| WebSocket deploy disconnect | Cloudflare disconnects sockets on code updates [CF-6][CF-8]. | Persist every authority mutation; version compatibility; reconnect tests; careful deploy windows. |
| At-least-once alarm | Deadline may retry [CF-7]. | Deadline generation + phase ID + storage transaction; idempotency tests. |
| Spectator privacy/collusion | Spectators intentionally see any POV's complete pack/pool. | Explicit role banner, server authorization, no queued card identity; acknowledge anti-collusion non-goal. |
| Browser token theft | Identity is a local bearer secret. | Strict CSP/no third-party scripts, newest-socket-wins, short room lifecycle, clear limits. |
| Password overconfidence | Fragment and fast verifier do not provide high-assurance secrecy. | Threat copy, WSS, rate limits, no logs, optional password labelled casual room access. |
| Accessibility regression under card density | 14 card buttons, seat board, timers, live updates. | Semantic controls, bounded announcements, keyboard drag alternative, 8+8 browser/accessibility matrix. |
| Phone complexity | Eight seats and cards are dense. | Desktop/tablet primary, phone one-column/list alternatives; preserve all core actions. |
| Status feed data growth | Reconnect churn can grow state/writes. | Enumerated events, dedupe/coalesce reconnect flaps if approved, cap 100, no per-pick events. |
| Multiple tabs | Same identity could race picks/host actions. | Newest authenticated connection wins; old socket closed/rejected. |
| Timer-off all-disconnected behavior | Empty readiness could cause autonomous rapid random drafting or deadlock. | DT-5 explicitly avoids vacuous readiness; DT-3 cleanup. |
| No host recovery | Lost browser token permanently removes controls by design. | Explain before creation; no hidden transfer/recovery mechanism. |

## Verified unavailable data

As of the research date, no reviewed authoritative source was found for:

- full Omens print-sheet/run correlations;
- the missing normal-slot probabilities listed in DT-1;
- a stable public Fabrary deck-creation API or a no-confirmation saved-deck deep link;
- an uptime/hotlink SLA for official image URLs;
- a formal license for `the-fab-cube/flesh-and-blood-cards`;
- a Cloudflare Free SLA or guarantee that cited allowances remain permanent.

Absence is recorded rather than filled with assumptions.

## Review order

Captain review should resolve DT-1 and DT-2 first because they can stop the product, then DT-3/DT-5 because they alter authoritative lifecycle/timer behavior, then DT-4/DT-6 UI/state details. DT-7 already has a safe fallback.
