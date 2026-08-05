# Domain and data model

This is a planning-level logical model. Names may become TypeScript types later, but this document is not a production schema. `packages/draft` already implements a dependency-free pure immutable/serializable product-neutral transition machine; this document remains the product integration model. Evidence IDs resolve in the [research source register](research.md#source-register).

## Design rules

1. The draft engine is pure and platform-independent: no Cloudflare, browser, network, wall-clock, storage, or Web Crypto imports.
2. All non-determinism enters as explicit `Clock` values and caller-owned random input; the existing draft runtime creates, seeds, stores, and imports no generator.
3. Card identity, physical printing/treatment, and physical instance are different concepts.
4. The room owns authority; clients receive role-projected views, never the canonical room object.
5. Build only the Omens boundary now. A future set is data, recipe, and evidence—not a new engine hierarchy.

## Set data

### `SetSnapshotManifest`

- `schemaVersion`
- `snapshotVersion`
- `setId` (`OMN`)
- display name/release date
- upstream source tag, commit, file URLs, and checksums
- official membership endpoint, canonical membership digest, dated raw-response checksum, and research date
- visible-recipe ID/version/SHA-256 and evidence status;
- generated timestamp/tool version (future import phase).

### `CardIdentity`

Stable gameplay/deckbuilding identity. Fields needed by MVP:

- internal stable ID and upstream stable ID;
- canonical name and pitch/color;
- type/class/talent and concise rules text needed for accessible fallback;
- Fabrary canonical card identifier plus accepted six-character printing identifiers;
- legal normal-slot categories.

The upstream source models unique identity as name + pitch [DATA-2]. The build-time recipe join's exact parenthetical red/yellow/blue name derivation is only a source-to-source identity correspondence; Comprehensive Rules explicitly keep printed pitch and color independent [FAB-8]. Normal and Rainbow Foil instances point to the same identity; physical treatment never changes deckbuilding quantity.

### `PhysicalTreatment`

A printing/treatment that can occur in product:

- treatment ID and `cardIdentityId`;
- collector/printing ID;
- set/product membership;
- rarity and foiling (`standard`, `rainbow`, `cold`);
- art treatment/rotation and remote image URL;
- expansion-slot marker plus its source reliability;
- eligible physical slot families;
- `draftable` and one or more exclusion reasons;
- verification state (`official`, `upstream`, `reconciled`, `unknown`).

### `VisiblePackRecipe`

Versioned community recipe data, not engine code branches:

- recipe ID `rantaways-omn-draft-3.8-fixed-layout-probabilities`;
- source filename, byte length, SHA-256, and provenance/evidence status (`captain-approved-community`, never `official`);
- strict format/version flags, including `withReplacement=false`;
- 228 weighted 14-card layout definitions and total layout weight 460,800;
- named candidate pools with resolved card identities, positive integer internal weights, and later-reviewed treatment mappings;
- exact pool counts/totals, six layout-outcome coefficients, and derived-probability fixtures in [rules-and-collation.md](rules-and-collation.md#captain-approved-community-mvp-recipe);
- post-removal invariant (`14`, with 11C + 1R + 1R/M + 1RF).

The imported representation refers only to reconciled snapshot IDs; raw community card objects/URLs are not runtime authority. Unknown fields, weights, or unresolved names fail validation. They are not silently normalized or represented as implicit uniform arrays.

### `PhysicalPackRecipe`

A composition boundary preserving official pack shape without fabricating missing rear probabilities:

- immutable visible-recipe ID/version/checksum;
- physical position count (`16`);
- 14 generated visible `PhysicalCardInstance`s;
- rear-card count (`2`) represented by typed opaque markers at positions 15 and 16;
- the `removeRear(2)` operation required before draft projection.

The community evidence covers only the visible 14-card layout [COMMUNITY-1]. A future evidence-backed rear recipe may replace opaque markers, but the MVP does not sample named rear cards.

### `PhysicalCardInstance`

Created for one visible recipe draw:

- unique instance ID;
- identity ID and treatment ID;
- pack ID, original physical position (1–14), and slot/pool family.

### `RemovedRearSlotInstance`

Created solely to model and exclude each unseen physical rear position:

- unique instance ID, pack ID, and original position (15 or 16);
- physical slot family (`rear-basic` or `rear-premium`);
- `draftable: false`, exclusion reasons, and official evidence reference;
- no fabricated card identity/treatment.

The set snapshot still classifies every known excluded product entry and treatment, but opaque rear markers do not pretend to select one.

## Room and people

### `Room`

- room code and lifecycle timestamps;
- permanent host participant ID;
- password verifier metadata (never plaintext);
- configuration;
- participants and connections;
- eight lobby slots and spectator order;
- optional active `Draft`;
- bounded status feed;
- monotonically increasing `stateVersion`;
- protocol version;
- next deadline/alarm generation;
- terminal expiry time and applicable all-disconnected grace generation.

### `RoomConfig`

- room name;
- set snapshot ID;
- timers enabled;
- pool hiding enabled;
- spectators allowed;
- seat randomization pending.

All listed room configuration is mutable only in the lobby and freezes at draft start. Host pause/resume is a draft command, not configuration.

### `Participant`

- participant ID;
- display name;
- role capabilities (`host`, current `drafter seat`, or `spectator`—host is orthogonal);
- identity credential verifier;
- joined/left timestamps;
- connection status and latest connection generation;
- selected spectator POV;
- bounded command-id deduplication records.

A `Connection` is ephemeral and may change; participant identity persists until leave/removal/room expiry. The newest successful connection for one participant supersedes an older tab/socket.

### `LobbySlot`

Exactly eight numbered positions, each empty or containing one participant ID. These are presentation/ordering positions; only occupied positions become draft seats at start.

## Draft

### `Draft`

- immutable set snapshot and visible/physical recipe IDs, versions, and checksums;
- production randomness metadata and current stream states (server-only);
- ordered `DraftSeat[]` ring;
- pre-generated pack pipelines, three per seat;
- pack number, current remaining-card count, and direction;
- phase state, optional phase deadline, and optional paused remaining duration;
- completed timestamp.

### `DraftSeat`

Stable after start:

- seat ID and original lobby position;
- optional current occupant participant ID;
- pool of physical instance IDs;
- current pack ID;
- unopened pack IDs for packs 2/3;
- optional `QueuedPick` for current phase;
- connection-independent seat status.

Removing/replacing a participant never moves this data. Empty seats remain in the pass ring.

### `Pack`

- pack ID, origin seat, pack number;
- 16 ordered element IDs: 14 physical card instances followed by two rear markers;
- two removed rear-marker IDs;
- ordered remaining visible card-instance IDs;
- current holder seat ID.

After rear removal, instances move exactly once from pack to one seat pool. Passing changes only holder.

### `QueuedPick`

- seat ID, phase ID, physical instance ID;
- queued-at server time and command ID;
- occupant participant ID that queued it.

It is provisional and replaceable, and it is cleared atomically at commit. Any transition that vacates a non-host drafter seat—including explicit voluntary leave or host removal—also clears that seat's queued pick in the same authoritative mutation, before any replacement inherits the seat or fallback resolves. The replacement may queue from the inherited pack.

### `Deadline`

- unique phase/deadline generation;
- kind (`official-pick`, `confirmation`, `review`, `room-expiry`, `abandonment`);
- start/deadline server timestamps and duration;
- optional official remaining-card schedule key;
- `accelerated` boolean;
- paused remaining milliseconds when frozen.

Client countdowns are derived views. Only the server transitions on deadline.

### `Phase`

Discriminated conceptual states:

- `lobby`
- `picking` (pack 1–3, remaining 14–2; one card is automatic)
- `review` (after packs 1 and 2)
- `completed`
- `closed`

Pause is an overlay on `picking` or `review`, not a separate phase that loses the underlying context.

### `FeedEvent`

- event ID/version/time/type;
- actor and affected participant/seat where appropriate;
- small structured payload used to render fixed product copy.

No arbitrary text, chat, pick event, or queued card identity. Retain a bounded count (recommended 100) and delete with the room.

## Implemented pure draft runtime

`@draft-table/draft` is the dependency-free, platform-independent sequencing authority; it performs no collation, card evaluation, I/O, entropy generation, or engine/set import. Its product-neutral setup accepts 2–8 stable human/bot seats, including at least one human-controlled seat, and exactly three rounds. Every round supplies exactly one stable-ID, ordered, non-empty pack per seat, with equal pack sizes within that round. Cards have unique physical `instanceId` values, reusable `cardId` values, and optional non-empty labels. A seat's omitted `occupantId` defaults to its seat ID and omitted `connected` defaults to true. Seat, occupant, pack, and instance IDs are validated for uniqueness, and caller setup is copied and frozen.

`createDraft` returns an immutable, serializable `DraftState` containing stable seat/presence records, current round/pick/L-R-L direction, in-flight and unopened packs, provisional picks, canonical pending seats, chronological pools, connected occupants' legal choices, and committed-pick count. Every action binds the current round and pick; picks additionally bind occupant, seat, pack, and card instance, while timeout fallback intents bind their current packs. `DraftRuleError` rejection leaves the input unchanged.

`pickCard` queues or replaces a provisional choice without removing or revealing a card; replaying the same choice returns the same state. `revealBarrier` requires one valid choice per seat, then atomically clears the barrier, moves one card per seat, passes the packs, and advances. When one card remains after that commit, the same transition passes and automatically awards the final card without another pick interval. Round exhaustion opens the next round, and round three exhaustion yields a terminal state with no packs, choices, pending seats, or unopened rounds. Left passes index `i` to `i + 1`, right to `i - 1`, modulo seat count.

Disconnect/reconnect preserves occupancy and queued choice. Vacancy atomically clears both occupant and provisional choice; replacement inherits the stable seat, pack, pool, and future packs but never the old choice. Vacant and disconnected seats remain in the pass ring and receive timeout fallback. `resolveTimeout` first validates exact fallback coverage for every and only unqueued seat, consuming zero entropy on any invalid batch, then preserves queued choices and uses unbiased rejection sampling over the caller's local `nextUint32()` source for missing choices. Malformed uint32 samples reject the transition. The package never creates, seeds, stores, or imports that source. Bots receive only current phase metadata and their abstract local pack; the deterministic first-card policy and replaceable policies queue through ordinary pick validation, reject invalid policy output, and never commit the barrier. Public lifecycle and bot entry points are `disconnectSeat`, `reconnectSeat`, `vacateSeat`, `fillSeat`, `runPendingBots`, and `firstCardBotPolicy`. Adapter authentication, clocks/deadlines, unopened-pack secrecy, role projection, persistence, and entropy custody remain integration responsibilities.

Three delegated reviewer decisions remain revisitable implementation choices: requeueing the same card for the same seat is an idempotent same-state replacement; each sole final card commits through the ordinary commit transition so history order, passing, and vacancy semantics are preserved; and the complete timeout-fallback batch is validated before entropy so rejected input consumes no sample and identical seeds cannot diverge by invalid-input arrival order. These are distinct from the captain-authored vacancy clearing, disconnect preservation, provisional-queue, and unbiased-fallback contracts.

## Randomness contract

The product integration must accept named random streams with unbiased `nextInt(upperExclusive)`:

- `seat-order`
- `pack-collation`
- `deadline-fallback`

### Replay PCG contract

`pcg-xsh-rr-64-32-v1` identifies PCG XSH RR with 64-bit state, 32-bit output, exact `bigint` arithmetic, multiplier `6364136223846793005`, and modulo-`2^64` transitions. For old state `s` and uint32 domain `d`, the odd increment is `(d << 1) | 1`; output rotates `((((s >> 18) xor s) >> 27) mod 2^32)` right by `s >> 59` before advancing state. Canonical seeding starts at zero, advances once with the domain increment, adds the seed modulo `2^64`, then advances again. Output always comes from the old state. The `(42, 54)` known-answer sequence begins `a15c02b7, 7b47f409, ba1d3330, 83d2f293, bfa4784b, cbed606e`; changing constants, seeding, shifts, serialization, or output timing requires a new algorithm version.

Seed and domain are exact uint32 integers (including zero); domain is replay metadata and a separation label, not a secret. Canonical state is the complete lowercase string `pcg-xsh-rr-64-32-v1:<16 state hex>:<8 domain hex>`. `generateDeterministicUint32Sample` returns a fresh frozen `{ sample, sourceState }`, never mutates its input, and preserves independent parent/sibling branches. Equal version/state and ordered calls reproduce equal uint32 samples; equal ordered bounds also reproduce byte-identical tickets, retry transcripts, and final state.

`drawDeterministicBoundedTicket` accepts a canonical state and integer bound in `[1, 2^32]`. It generates one sample per attempt, delegates unchanged to `mapUnsigned32SampleBatchToBoundedTicket`, advances only to the returned state, retries an explicit `needs-sample` without a cap, and returns at the first acceptance. Its frozen result records bound, every consumed sample in order, exact consumed and retry counts, ticket, and final state; transcript memory is therefore proportional to retries. Invalid arity, state, seed/domain, sample, or bound fails with the stable value-free `DeterministicUint32SourceError`. The helper is internal rather than exported from `@draft-table/engine`'s package root.

This PCG is replay-only, non-cryptographic, and may be state-reconstructable from observed output; it is not a multiplayer unpredictability guarantee. JavaScript/Worker/browser implementations must preserve `bigint` and uint32 shift semantics. Production source selection, cryptographic requirements, seed custody, and stable stream/domain allocation remain a later architecture decision; client seeds are never accepted.

Uniform timeout fallback uses rejection sampling or an equivalent unbiased bounded-index algorithm. A random choice is recorded only as the resulting instance ID, not as user-visible RNG internals.

## Canonical invariants

- `2 <= draftSeats.length <= 8`; `participants not-left <= 16`.
- One participant occupies at most one lobby/draft seat.
- One draft seat has at most one occupant, but may be empty.
- Host participant ID never changes.
- Draft ring order and seat IDs never change after start.
- Exactly three physical packs originate per initial draft seat.
- Every visible physical instance is in exactly one of: current pack, unopened pack, or one seat pool.
- Removed rear markers are in none of those three and no projected view.
- A queued instance belongs to that seat's current pack and current phase.
- Vacating a non-host drafter seat atomically clears its queued pick before replacement inheritance or fallback resolution.
- One committed card per draft seat per pick transition; absent queues resolve uniformly at random.
- No client supplies committed picks, pass operations, deadlines, time, random values, pool contents, or role.
- `stateVersion` increases once per committed room mutation; projections from one event use the same resulting version.
- Completed state is immutable except leave/disconnect, export projection, and expiry cleanup.
