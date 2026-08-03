# Server-authoritative room state and protocol

External platform citations resolve in the [research source register](research.md#source-register). This is a planning contract, not a production schema.

## Authority boundary

The room Durable Object serializes all commands, injects server time/randomness, applies the pure engine transition, persists the result, and only then broadcasts role-specific deltas. A client may propose a command; it may not set role, seat, pack, pool, phase, deadline, pass direction, committed selection, or randomness.

One room code maps deterministically to one Durable Object. One object is sufficient for 16 clients and ensures total command order; a single object has a documented soft limit of 1,000 requests/s and can connect thousands of WebSocket clients [CF-5][CF-6].

## State machine

```text
create → LOBBY
LOBBY --start(valid 2..8 seats)--> PICKING(pack 1, 14 cards)
PICKING --deadline/confirmation--> PICKING(next smaller pack)
PICKING --2-card commit + automatic last card--> REVIEW (after packs 1, 2)
REVIEW --60-second deadline--> PICKING(next pack, alternate direction)
PICKING --pack 3 automatic last card--> COMPLETED
COMPLETED --1 hour alarm--> CLOSED/DELETED
any non-closed phase --all participants explicitly leave--> CLOSED/DELETED
```

`PAUSED` freezes a `PICKING` or `REVIEW` deadline as an overlay. Closed is terminal.

### Start transaction

Validate host, lobby/config version, 2–8 occupied slots, participant cap, known snapshot, and resolved collation evidence. If pending randomization is enabled, shuffle occupied participant IDs with the server `seat-order` stream while preserving count. Compact occupied lobby positions into a clockwise ring, generate all three physical packs per seat, remove every pack's rear two cards, persist state/random streams/first deadline, then publish the first projected snapshot. Any failure leaves the room in lobby.

### Pick transaction

`queue_pick` validates occupant, current phase ID, and current pack membership. It replaces that seat's previous queue, increments `stateVersion`, persists, acknowledges the sender, then broadcasts only `hasQueued` status publicly.

When all readiness-eligible humans have queued:

- timers on and remaining time >5 seconds: replace the deadline once with `now + 5s`;
- timers on and <=5 seconds: leave it unchanged;
- timers off and no confirmation exists: set `now + 5s`;
- an existing five-second confirmation is never extended/cancelled by replacing a queued card.

The recommended readiness set is connected occupants of draft seats; empty/disconnected seats random-fill at commit. This avoids timer-off deadlock but requires captain confirmation (DT-5).

### Deadline transaction

An alarm contains no trusted phase data; canonical storage does. On wake:

1. Load state and compare `deadlineAt`, phase ID, and alarm generation.
2. If early/stale/duplicate, do nothing or schedule the current next deadline.
3. If paused, do nothing.
4. For every draft seat in ring order, commit its valid queue or choose uniformly from its current pack.
5. Move chosen instances to pools, clear queues, and pass remaining packs left/right.
6. If one card remains after the pass, assign that sole card automatically in the same atomic transition.
7. Enter next pick, one-minute review, or completion; schedule exactly the next alarm.
8. Persist state and random stream before broadcasting.

Cloudflare alarms are at-least-once and retry, so phase/deadline generations make this idempotent [CF-7]. No transition may award a card twice.

### Pause/resume

Pause records `max(0, deadlineAt - now)` and increments alarm generation. Queue changes remain legal; no deadline/confirmation starts while paused. Resume sets `deadlineAt = now + frozenRemaining`, then applies the all-queued five-second cap. A timer-off all-queued condition reached while paused starts five seconds on resume. Only the connected permanent host may pause/resume.

### Seat removal/fill after start

- `remove_participant` rejects the permanent host as a target. For another participant, it clears the occupant from that stable draft seat, revokes old seat authority, and logs one material event. Packs/pool remain.
- Whether removal clears or retains that seat's queued pick is unresolved DT-6. Post-start removal/fill must not be implemented until the captain selects one branch; retaining keeps the card identity hidden from a replacement, who may replace it.
- That identity becomes a spectator when spectator access is allowed; otherwise it leaves the active room projection but may reconnect only to an access-denied/removed response.
- `move_participant` after start is accepted only for host moving a spectator to a vacated existing draft seat. No swap/reorder is allowed.
- A newly filled occupant receives the inherited pool/current pack. Queued-pick inheritance follows the DT-6 decision and never discloses another participant's queued card identity.

## Timer schedule

Server schedule for Omens visible pack sizes is exactly [FAB-2]:

```text
14/13/12=50s; 11/10=40s; 9/8=30s; 7/6=20s;
5/4=10s; 3/2=5s; 1=automatic
```

Reviews are always 60 seconds. Client animation has no authority. Handshake/snapshot includes `serverNow`, and clients estimate offset using round-trip timing; every deadline delta refreshes it.

## Connection, reconnect, and leave

1. WebSocket upgrade reaches the room but receives no private state before successful `hello`.
2. First message carries optional identity credential, display name for a new identity, and optional fragment-derived password over WSS.
3. A returning valid credential reclaims participant/seat. A new identity joins according to phase/cap/spectator policy.
4. The server issues/rotates a high-entropy credential on first join and returns it only to that client.
5. Newest authenticated connection generation wins; an older socket for the same identity is closed.
6. A socket close marks disconnected and logs a bounded material event; it does not remove/vacate a draft seat. Deadlines continue.
7. Client reconnect uses bounded exponential backoff, sends last applied `stateVersion`, and receives deltas when safely retained or a fresh projected snapshot.
8. Explicit `leave` removes a spectator; before start it vacates a lobby slot; after start a drafter seat becomes empty while retaining draft state.
9. If every participant explicitly leaves, close/delete immediately. A safe idle policy for never-started/paused rooms with only disconnected identities remains DT-3; disconnection cannot simply equal leave without breaking reclaim semantics.

Cloudflare deployments/runtime shutdowns can disconnect WebSockets, so the client must reconnect and the object must reconstruct from SQLite even though infrastructure-restart durability is not a product promise [CF-6][CF-8].

## Protocol envelope

Every JSON message is size-limited (recommended app cap 16 KiB for commands), strictly validated, and uses protocol version 1.

Client command conceptual envelope:

```text
protocolVersion, commandId, knownStateVersion?, type, payload
```

Server message conceptual envelope:

```text
protocolVersion, stateVersion, type, commandId?, serverNow, payload
```

- `commandId` is a client-generated opaque ID. The server keeps a bounded per-participant dedupe record; duplicate commands return the original acknowledgement and have no second effect.
- `knownStateVersion` supports useful stale-command errors but is not trusted as canonical.
- `stateVersion` is monotonic. A gap triggers `resync` rather than speculative local patching.
- Unknown fields/types, oversized messages, non-finite numbers, wrong phase/role, or invalid instance IDs return structured errors and do not mutate state.

## Client commands

| Type | Principal | Payload/effect |
|---|---|---|
| `hello` | unauthenticated socket | credential?, password?, display name?, last state version |
| `update_profile` | participant | display name |
| `update_config` | host, lobby | complete validated room config patch |
| `move_participant` | host | participant ID + lobby destination, or post-start vacated seat |
| `set_seat_randomization` | host, lobby | enabled, or randomize-now action |
| `start_draft` | host, lobby | expected config/seat version |
| `queue_pick` | current seat occupant | phase ID + physical instance ID |
| `pause` / `resume` | host | expected phase ID |
| `select_pov` | spectator | draft seat ID |
| `remove_participant` | host | non-host participant ID + reason code |
| `leave` | participant | no arbitrary text |
| `resync` | authenticated socket | last state version |

There is no client command for commit, pass, random choice, deadline, feed text, role assignment, room expiry, or changing a queued pick after its phase closes.

## Server messages and deltas

| Type | Visibility | Contents |
|---|---|---|
| `hello_ack` | one connection | identity credential when new, self/role, state version, server time |
| `snapshot` | projected | full role-safe room view |
| `ack` | command sender | command ID and resulting version/no-op status |
| `error` | command sender | stable code, safe message, current version; never secrets |
| `participants_changed` | public | names, host/seat/spectator, connection status |
| `seat_layout_changed` | public | lobby positions or stable started seats; no private cards |
| `config_changed` | public | safe room options, never password verifier |
| `phase_changed` | public | pack/pick/review/completion, direction, remaining count |
| `deadline_changed` | public | kind/start/deadline/duration/paused/urgency data |
| `queue_status_changed` | public | seat ID + boolean only |
| `private_pack_pool` | drafter or spectator POV | authorized pack/pool; queued instance only for the owning drafter |
| `feed_appended` | public | one structured material event |
| `room_closed` | public | terminal reason |

Deltas may be batched in one WebSocket frame to reduce overhead [CF-6]. Outgoing views for different roles can share public serialized fragments but must not share a canonical private object.

## Visibility matrix

| Data | Owning drafter | Other drafter | Host-only capability | Spectator on POV |
|---|---:|---:|---:|---:|
| Public phase/deadline/feed | Yes | Yes | Yes | Yes |
| Seat queued boolean | Yes | Yes | Yes | Yes |
| Queued card identity | Yes | No | No (unless own seat) | No |
| Current pack | Own | No | No (unless own seat) | Selected POV |
| Complete pool | Own when option allows/review | No | No (unless own seat) | Selected POV always |
| Lobby seat/config controls | No | No | Connected host | No |
| Password verifier/identity secrets/RNG | No | No | No | No |

A host who is a spectator uses ordinary spectator POV visibility; host status never grants hidden-card inspection.

## Lifecycle cleanup

- Completion schedules one alarm for exactly one hour later. The alarm closes sockets, clears attachments, and calls storage deletion. It is idempotent.
- Explicit all-left closure does the same immediately.
- Store only one current canonical snapshot plus bounded feed/dedupe metadata; no replay/event-sourcing system.
- Deleting storage also cancels/invalidates logical deadlines; alarm generation prevents late retries from recreating a room.
