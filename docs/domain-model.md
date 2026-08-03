# Domain and data model

This is a planning-level logical model. Names may become TypeScript types later, but this document is not a production schema.

## Design rules

1. The draft engine is pure and platform-independent: no Cloudflare, browser, network, wall-clock, storage, or Web Crypto imports.
2. All non-determinism enters as explicit `Clock` values and a `RandomSource`.
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
- official membership endpoint/checksum and research date
- collation model version/evidence status
- generated timestamp/tool version (future import phase)

### `CardIdentity`

Stable gameplay/deckbuilding identity. Fields needed by MVP:

- internal stable ID and upstream stable ID;
- canonical name and pitch/color;
- type/class/talent and concise rules text needed for accessible fallback;
- Fabrary canonical card identifier plus accepted six-character printing identifiers;
- legal normal-slot categories.

The upstream source models unique identity as name + pitch [DATA-2]. Normal and Rainbow Foil instances point to the same identity; physical treatment never changes deckbuilding quantity.

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

### `PackRecipe`

Versioned data, not engine code branches:

- 16 ordered `PhysicalSlotDefinition`s;
- candidate treatment IDs and integer weights per slot outcome;
- optional correlation/run model plus evidence reference;
- rear-card count (`2`);
- post-removal invariant (`14`, with 11C + 1R + 1R/M + 1RF).

Unknown weights fail validation. They are not represented as implicit uniform arrays.

### `PhysicalCardInstance`

Created once during pack generation:

- unique instance ID;
- identity ID and treatment ID;
- pack ID, original physical position, and slot family;
- `removedRear` boolean/reason, kept only in canonical audit/testing data until room cleanup.

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
- terminal expiry time.

### `RoomConfig`

- room name;
- set snapshot ID;
- timers enabled;
- pool hiding enabled;
- spectators allowed;
- seat randomization pending.

Configuration is mutable only in lobby, except host pause/resume and spectator admission policy if the captain explicitly approves post-start changes. Recommended MVP freezes all listed configuration at start.

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

- immutable set/recipe/snapshot versions;
- production randomness metadata and current stream states (server-only);
- ordered `DraftSeat[]` ring;
- pre-generated pack pipelines, three per seat;
- pack number, current remaining-card count, and direction;
- phase/deadline/pause state;
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
- 16 generated physical instance IDs in original order;
- two removed rear IDs;
- ordered remaining visible IDs;
- current holder seat ID.

After rear removal, instances move exactly once from pack to one seat pool. Passing changes only holder.

### `QueuedPick`

- seat ID, phase ID, physical instance ID;
- queued-at server time and command ID;
- occupant participant ID that queued it.

It is provisional and replaceable. It is cleared atomically at commit. After a seat replacement, the queued identity remains canonical but is not disclosed to the incoming participant; the host may instead choose to clear it as a future captain decision. Recommended behavior is to clear on removal and let fallback resolve, avoiding inherited secret intent.

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

## Randomness contract

The engine accepts named random streams with unbiased `nextInt(upperExclusive)`:

- `seat-order`
- `pack-collation`
- `deadline-fallback`

Tests supply fixed seeds and can serialize stream state. Production obtains at least 256 bits from server-side Web Crypto at start, derives independent streams with a documented domain separator, stores state atomically with room transitions, and never accepts a client seed. Production seed/state is not exposed during a draft. Replays are a non-goal.

Uniform timeout fallback uses rejection sampling or an equivalent unbiased bounded-index algorithm. A random choice is recorded only as the resulting instance ID, not as user-visible RNG internals.

## Canonical invariants

- `2 <= draftSeats.length <= 8`; `participants not-left <= 16`.
- One participant occupies at most one lobby/draft seat.
- One draft seat has at most one occupant, but may be empty.
- Host participant ID never changes.
- Draft ring order and seat IDs never change after start.
- Exactly three physical packs originate per initial draft seat.
- Every visible physical instance is in exactly one of: current pack, unopened pack, or one seat pool.
- Removed rear instances are in none of those three and no projected view.
- A queued instance belongs to that seat's current pack and current phase.
- One committed card per draft seat per pick transition; absent queues resolve uniformly at random.
- No client supplies committed picks, pass operations, deadlines, time, random values, pool contents, or role.
- `stateVersion` increases once per committed room mutation; projections from one event use the same resulting version.
- Completed state is immutable except leave/disconnect, export projection, and expiry cleanup.
