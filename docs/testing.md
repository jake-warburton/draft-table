# Strict TDD strategy and test matrix

## Policy

All implementation follows red–green–refactor:

1. Add the smallest failing test for one reviewed contract.
2. Observe the intended failure for the intended reason.
3. Add the smallest production change to pass.
4. Refactor only with green tests.
5. Commit the test with its implementation and run the full no-mistakes pipeline before delivery.

No generated snapshot, parser, engine transition, protocol handler, client behavior, deployment adapter, or bug fix lands without a prior failing test. Keep pure tests fast and numerous; keep platform/browser tests focused on boundaries.

Additional future test layers (tool choice finalized when each layer is introduced):

- pure TypeScript unit/property tests; a property-testing library is dev-only;
- Cloudflare's supported Workers/Durable Objects integration test pool with isolated SQLite/alarm state;
- Playwright Chromium/Firefox/WebKit multi-context scenarios plus axe and Lighthouse CI;
- manual actual Safari/VoiceOver and one Windows screen-reader smoke gate before public launch.

## Determinism and fixtures

- Fixed set snapshot and `rantaways-omn-draft-3.8-fixed-layout-probabilities` recipe versions/checksums in every collation fixture; byte mismatch fails before parse.
- Test `RandomSource` seeded explicitly and serializable.
- Production random source adapter tested separately for server ownership/domain separation, never for predictable output.
- Fake monotonic/server clock; no test sleeps for engine timing.
- Golden snapshots are small reviewed outcomes, never opaque generated all-card dumps.
- Property failures print seed and minimal command trace for exact replay.
- Statistical tests do not rely on flaky wall randomness: validate integer weight boundaries exhaustively and use long fixed streams only as a secondary tolerance check.

## Unit and property matrix

| Area | Required tests |
|---|---|
| Set import | Exact source checksums; 260 official product entries reconciled; 251 OMN + 9 IAR scope fixture; exact card-level pitch-string domain and retained immutable copies; no duplicate stable IDs; collector-first derived pitch-name recipe identity join is capability-bound with a complete 209/51 partition; mapped-only rarity correspondence enforces the exact aggregates specified in [card snapshot reconciliation](rules-and-collation.md#card-snapshot-reconciliation) while its real four-source result remains captain-acceptance-pending; the bounded immutable eligibility partition pins 209 mapped draftable, nine unmapped IAR excluded, and 42 other unmapped unclassified identities while its real four-source result remains captain-acceptance-pending; validated pool references resolve through exact same-source ownership, collector-first official identity, and exact draftable eligibility while preserving source order/weights and selecting no treatment, with the real result captain-acceptance-pending; all 228 weighted layouts then preserve stable IDs, 460,800 total weight, exact 14-position source order/multiplicity, recipe-structural 11 common-rarity + 1 fixed-rare + 1 rare-or-majestic + 1 rainbow-foil roles with a 114/114 R/M outcome split, and capability-owned resolved pools without drawing, assigning physical slots, or selecting treatments, with the real layout result captain-acceptance-pending; exact registered layout/pool capabilities compile into deeply immutable source-order safe-integer cumulative-weight tables for all 228 layouts and 11 scoped pools, with ownership, recurrence, ordering, total, overflow, and copy-independence guards; deterministic exact bounded-ticket lookup over only that registered capability exhaustively covers every half-open interval, exclusive end, final choice, and exact named-pool ownership while returning only immutable capability-owned references; one-sample composition analytically proves exact weighted preimage counts and retry tails and checks every layout/pool choice boundary while owning no entropy or retry loop; immutable pack-local state exhaustively covers all 11 fresh and single-removal pools, exact same-pool recompilation, exhausted-pool rejection, dynamic bounded-ticket histograms/boundaries, and current-bound one-sample preimages, retry tails, removed-identity unreachability, and immutability without removal, fallback, retry loops, or sequencing; atomic one-sample draw transition tests cover retry without identity or state, exact selected-reference retention, exact same-pool removal, exhausted states, unrelated-pool reference retention, same-identity other-pool retention, exact selected-weight deltas, rebuilt cumulative ends, source order, determinism, immutability, and invalid ownership/input rejection; layout-selected fresh collation-plan tests cover retry without initialization, exact layout ownership, 14-position role/reference coherence, the exact 11-pool set, sufficient same-pool no-replacement capacity, fresh state, and zero cursor without drawing or sequencing; finite-batch plan initialization additionally covers complete engine-owned batch validation, exact consumed-sample propagation, need-more without registration, exact capability-owned layout lookup, independent fresh plans, hostile-result rejection, and composition cross-attacks without constructing a pack; finite-batch current-position transitions cover need-more without effects, exact consumed count, one caller-length and one per-element read into an immutable boundary snapshot, source-order position and pool ownership, unchanged-ticket identity selection, same-pool-only removal, immutable cursor-advanced historical plans through all 14 positions, independent per-invocation plan and successor-state freshness including package-internal `ForTest` plan reuse and state-only sibling reuse with a fresh plan, terminal rejection, independent branches, malformed or foreign capabilities, and composition cross-attacks; every registered plan additionally retains an independently owned immutable selection history whose length equals its cursor, whose source-order records preserve the exact accepted position and official-identity references, and whose old and sibling values never share newly minted containers or records, with all four real four-source results captain-acceptance-pending; every treatment classified; image host allowlist; unknown metadata fails closed. |
| Community recipe bytes | Exact filename, 120,617 bytes, UTF-8 BOM/CRLF format, and SHA-256 `97a964c8c5b6a962404398ca2b57c9ceeeb2dfb714512e61ff22e07ea1ec2328`; any byte/version drift fails before parsing and requires a new reviewed fixture. |
| Recipe parser | Deterministic Settings/CustomCards JSON plus indentation-sensitive Layout/pool parsing; required/unknown/duplicate section policy; 209 unique names/collector IDs; exact collector plus exact derived bare-name/pitch-color-suffix identity correspondence with no recipe-string rewriting; mapped rarity facts preserve exact recipe labels and the authoritative full source-order rarity-code sequence with duplicates; the captain-held gate pins `[C,C]`117/`[R,R]`59/`[M,M]`15/`[C]`15/`[C,V]`2/`[R]`1 and separately pins the lossy first-observed unique sets `{C}`132/`{R}`60/`{M}`15/`{C,V}`2, including `{C}`132 = `[C,C]`117 + `[C]`15; they reject deduplication, set substitution, all unpinned mixed sets and aggregate redistribution, and do not gate 51 non-candidates; wrong/missing color, pitched pitchless names, bare pitched names, and all text drift fail; embedded image URLs are ignored as authority; pool outputs publish no private reference names and Rainbow Foil membership selects no physical form; malformed syntax/unknown names/non-positive weights fail closed. |
| Recipe invariants | 228 unique 14-card layouts; 38 base layouts × six rarity outcomes; total weight 460,800; every layout 11C (one Equipment) + 1R + 1R/M + 1RF; `withReplacement=false`; exact pool entry counts/totals for all 11 pools; normal pools partition all custom cards exactly once; Rainbow Foil pools are valid subsets; every declared pool is used by a layout. |
| Recipe probabilities | Exact six coefficients `1411,255,34,581,105,14` per 2,400-scaled base; aggregate integer weights `326400/134400` for R/M and `382464/69120/9216` for RF C/R/M; exact fractions `17/24`, `7/24`, `83/100`, `15/100`, `2/100` plus required rounded displays; no statistical-only assertion. |
| Identity/treatment | Standard and Rainbow instances share identity; treatments remain distinct; deck/export quantities collapse by identity+pitch; remote URL never defines treatment. |
| Physical booster | Exactly 16 pre-removal positions: 14 recipe card instances plus two typed opaque rear markers; unique IDs; deterministic same seed; different domain stream isolation. |
| Rear exclusion | Exactly positions 15/16 removed atomically; no fabricated rear card identity; no rear marker can enter projection/pool/fallback/export; every known Basic/token/expansion/L/F/V/CF/other extra treatment remains classified with reason metadata. |
| Visible collation | Exactly 14 from one validated weighted layout; 11 standard C + 1 standard R + 1 standard R/M + 1 legal RF; normal-slot M/RF draftable; integer weighted selection reaches every eligible outcome and no ineligible one; repeated same-pool draws obey no-replacement. |
| Correlations | The checksum-pinned layout correlation/weight model is reproduced exactly; unknown/partial recipe refuses generation; no test or product copy calls it an official print-run model. |
| Random bounds | One exact uint32 sample maps to an immutable accepted ticket in `[0,n)` or explicit retry through rejection sampling; exhaustive analogous-domain preimage checks prove no modulo bias. A finite caller-supplied uint32 batch validates every sample first, then composes the public mapper in source order and returns the first accepted ticket with exact consumption or explicit exhaustion. Build-time one-sample collation composition uses the exact capability-owned layout or selected-pool bound, propagates retry without lookup, and otherwise returns only the selected reference. Build-time finite-batch plan initialization composes the batch mapper only with exact capability-bound layout lookup and fresh-plan registration, preserving exact consumption and returning need-more without registration. A following finite-batch position transition maps against only the current recipe position's exact dynamic-pool bound, preserves need-more without effects, or performs one exact same-pool identity removal, immutable cursor advance, and exact position/official-identity reference append to the private plan history. Caller entropy ownership, generation, reseeding, infinite retry policy, pack/card construction, cross-pool duplicate policy, card-presentation integration and selection, treatment semantics, snapshots, physical-slot semantics, and runtime behavior remain later layers. |
| Pack count | For N=2..8, pre-generate `3N` packs, `48N` physical positions (`42N` card instances + `6N` rear markers), and `42N` visible card instances. |
| Pass direction | N=2..8; pack 1 left, pack 2 right, pack 3 left; origin/current-holder mapping; no pack duplication/loss. |
| Pool conservation | At completion every seat has 42 instances; union equals all visible instances; intersections empty; rear set disjoint. |
| Queue | Valid queue, replacement, same-card idempotency, no unqueue, wrong pack/seat/phase rejection, queue cleared at commit. |
| Secrecy views | Owner receives own queued ID; all others only boolean; host gains no hidden view; spectator POV omits queue ID. |
| Official timers | Exact 14→2 schedule; 1 automatic; 60-second reviews; absolute deadline boundaries (`now == deadline` commits). |
| Acceleration | All connected occupied seats ready with >5s sets exactly 5s; <=5s unchanged; replace stays provisional; no extension/cancel; empty/disconnected seats do not block and random-fill. |
| Timers off | Start persists no phase deadline; no deadline before a non-empty connected readiness set is complete; readiness creates 5s; changes allowed; absent queue at commit random; zero connected seats creates no loop; pause before confirmation preserves no deadline; resume creates 5s only when non-empty readiness is complete. |
| Pause/resume | Optional remaining time freezes; time spent paused irrelevant; stale alarm no-op; resume reconstructs only an existing deadline; all-ready cap; queue while paused; review pause. |
| Deadline commit | One card/seat; queued preferred; random fallback for disconnected/empty; atomic pass; last card auto-assigned. |
| Alarm idempotency | Duplicate, early, late, old generation, retry after committed storage; no double award; current alarm restored. |
| Lobby seats | Eight positions; move to empty; swap occupied; spectator move; start rejects <2/>8; unused gaps compact preserving order. |
| Seat randomization | `Randomize at start` defaults pending; same seed deterministic; every permutation reachable property; first manual move/swap disables it; `Randomize now` atomically shuffles and clears pending so start does not reshuffle; explicit re-enable restores one start shuffle before packs. |
| Post-start seats | Reorder/swap and permanent-host removal rejected; every non-host seat-vacating transition (explicit voluntary leave or host removal) atomically leaves a stable empty seat and clears its queue before replacement inheritance or fallback; spectator fill inherits pool/pack with no queue; unused lobby slot rejected. |
| Participant cap | Up to 16; at most 8 drafters; spectator allow/deny; join phase rules. |
| Reconnect | Credential reclaims identity/seat; new credential becomes spectator; latest connection supersedes; old socket command rejected; disconnect does not vacate. |
| Host | Creator immutable; no transfer/recovery; controls fail while absent/forged; reconnect restores. |
| Status feed | Material events only; no per-pick/card IDs/chat; bounded to configured count; structured copy. |
| Lifecycle | Explicit all-left immediate delete; completion + exactly one hour; all-disconnected lobby +30 minutes; all-disconnected paused started draft or all-disconnected timer-off started draft waiting with no connected drafter +24 hours; successful reconnect resets generation/full grace; active timed draft unaffected; boundary/late-alarm idempotency. |
| Protocol validation | Unknown version/type/field policy, oversized payload, invalid Unicode/control names, non-finite/bounds, role/phase errors, stable safe codes. |
| Command dedupe | Duplicate ID same ack/no mutation; bounded eviction; ID scoped participant; stale version returns resync-safe response. |
| Export | Deep link URL-encodes name/IDs, collapses treatments, includes `Draft`; below URL cap fixture; text parser form exact; no room/password/identity leakage. |

## Durable Object / Worker integration matrix

Run against the platform-compatible runtime, not mocked method calls only.

1. Room creation maps code to one object and collision retry is atomic.
2. Static paths do not invoke Worker-first dynamic code; API paths do.
3. WebSocket upgrade validates Origin/method/size and reaches the correct object.
4. No snapshot before `hello` + password success.
5. New/returning identity and newest-socket-wins behavior.
6. Sixteen concurrent sockets receive one ordered public state version.
7. Role-specific snapshots/deltas contain only allowed private fields; inspect raw frames.
8. Eight simultaneous queue commands serialize and produce one five-second deadline.
9. Storage write completes before acknowledgement/broadcast; injected storage failure produces no committed client state.
10. Hibernation reconstruction loads state and WebSocket attachments; in-memory reset changes no semantics.
11. Alarm fires deadline/review/expiry; duplicate/retry is idempotent; one next alarm only [CF-7].
12. Pause invalidates old alarm and resume schedules the reconstructed deadline.
13. Deploy/restart-style socket loss reconnects to persisted version without seat loss.
14. Remove/replacement revokes the old socket before private projection to the new occupant.
15. Completion expiry calls full storage deletion and closes sockets.
16. Malformed-message/rate-limit paths do not mutate state or leak secrets in logs.
17. Measured state/attachment/frame sizes stay within app budgets.
18. CPU/wall-time instrumentation on worst transition and 16 projections; fail budget gate if Free limits are exceeded.

## Browser-level multi-client scenarios

Each scenario uses isolated browser contexts/local storage; network frames are captured for secrecy assertions.

| Scenario | Assertions |
|---|---|
| Two-player smoke | Create/join/arrange/start; 3 packs; L/R/L; timers; reviews; 42-card pools; complete/export. |
| Eight drafters + eight spectators | Participant cap, 24 generated packs, simultaneous queues, projected updates, spectator POV switches, no cross-player queue IDs, completion. |
| Mid-draft spectator | Join while picking, select every POV, see complete selected pool/current pack, no selected-card highlight, leave without pass impact. |
| Pool hiding | Drafter pool absent during picks, visible review, absent again; spectator always sees; network payload obeys, not CSS-only. |
| Provisional pick | click/Enter card A then B until deadline; only B commits; public status stays boolean; post-deadline click rejected. |
| Acceleration | all queue with >5s, UI moves to five seconds, choices remain changeable, commit once. |
| Timers disabled | no countdown until at least one connected occupied seat exists and all such seats queue; five-second confirmation; disconnected/empty random fallback; zero-connected state never loops. |
| Pause | timer/progress freezes across clients, queue replacement works, stale alarm no visible advance, resume synchronized. |
| Disconnect/reconnect | same context reclaims; new context spectator; deadlines/random fallback continue; host controls disappear/return. |
| Seat vacancy/replacement | explicit voluntary non-host drafter leave and host removal each atomically clear the queued choice before either fallback or spectator fill; fill inherits the correct pack/pool but no queue; old identity cannot pick. |
| Password fragment | no fragment/password in HTTP request, WS URL, Referer, logs, Fabrary link; wrong password sees no room state; address scrubbed. |
| Keyboard | Tab reaches every card/control; Enter queues/replaces; no pointer; seat Move/swap alternative; visible focus. |
| Screen reader semantics | accessibility tree names cards/treatments/timer/role/status; live announcements bounded; no colour-only state. |
| Reduced motion/contrast | emulated reduced motion disables transitions; grayscale/high-contrast cues remain; timer/RF/queue recognizable. |
| Responsive | desktop, tablet portrait/landscape, representative phone, 200% zoom; no blocked action/horizontal page overflow. |
| External failure | image 404 preserves selectable card; clipboard denied reveals text; invalid Fabrary contract uses fallback. |
| Lifecycle | completed room works before +1h and closes at boundary; all-disconnected lobby closes at +30m; all-disconnected paused started room or all-disconnected timer-off started room waiting with no connected drafter closes at +24h; reconnect resets grace; stale cleanup alarm cannot close/resurrect incorrectly. |

Use Chromium for Edge-equivalent engine coverage, Firefox, and WebKit for Safari-like coverage. WebKit is not a substitute for the manual current Safari/VoiceOver launch check.

## Non-functional gates

- Type checking and lint are clean; zero ignored warnings without recorded rationale.
- Unit/property suite has deterministic repeatability and no wall-clock sleeps.
- Critical engine branches and protocol validators have high coverage; coverage is a diagnostic, not a replacement for matrix behavior.
- The scaffold follows the [web build and size-reporting contract](streams/web-playable-shell.md#build-ownership-and-evidence); the server remains under the 3 MB Free limit [CF-1].
- Lighthouse CI agreed thresholds: recommend Performance ≥90 and Accessibility/Best Practices/SEO ≥95 on representative desktop and tablet, with any exception captain-reviewed.
- axe has zero serious/critical findings; manual keyboard and screen-reader gates pass.
- Load: one object with 16 sockets, burst queue/replacement/POV traffic, alarms, reconnect storm, and sustained room churn.
- Free-tier model: measured requests, row reads/writes, duration, CPU, state bytes populate [architecture.md](architecture.md#per-room-budget); launch blocks if projected safe capacity is below approved target.
- Dependency/license/security audit, standard MIT `LICENSE` verification, docs link check, snapshot/community-recipe provenance and checksums, and no-mistakes all green.

## Bug protocol

A reported bug first becomes a minimal failing regression at the lowest faithful layer. For concurrency/visibility/platform bugs, preserve a reduced command/frame trace and seed. Only then fix and run upward layers. Never bless an unexplained changed golden file.
