# Stream 4: draft runtime

`@draft-table/draft` is a dependency-free, platform-independent state machine. It owns draft sequencing only. It does not collate packs, interpret card strength, generate entropy, perform I/O, or import `@draft-table/engine` or `@draft-table/set-omens`.

## Abstract inputs

The package uses local product-neutral types:

- `DraftCard`: stable physical `instanceId`, reusable `cardId`, and optional `label`.
- `DraftPack`: stable `id` and an ordered non-empty card array.
- `DraftSeat`: stable seat `id`, `human` or `bot` controller, and optional initial occupant/presence fields. Omitted `occupantId` defaults to the seat ID and omitted `connected` defaults to true.
- `DraftSetup`: 2–8 seats and exactly three rounds, each with one equal-sized non-empty pack per seat.

Seat IDs, initial occupant IDs, pack IDs, and card instance IDs are unique. At least one initial seat is human-controlled. Setup is copied and frozen so later caller changes cannot alter the draft.

## State and transition API

```ts
let state = createDraft(setup);
state = pickCard(state, {
  round: state.round,
  pick: state.pick,
  seatId,
  occupantId,
  packId,
  cardInstanceId,
});
state = revealBarrier(state, {
  type: "reveal",
  round: state.round,
  pick: state.pick,
});
```

`DraftState` exposes stable seats and presence, current round/pick/direction, in-flight and unopened packs, provisional picks, canonical unqueued `pendingSeatIds`, picked pools, connected occupied seats' legal choices, and committed `totalPicks`. All states and nested values are immutable and serializable. A rejection throws `DraftRuleError`, leaves the input unchanged, and cannot partially commit.

Every pick and lifecycle intent binds to the exact current round and pick. Pick intents also bind the occupant, seat, pack, and physical card instance. This rejects malformed, stale, foreign-occupant, foreign-pack, and absent-card actions before transition.

## Provisional barrier and passing

`pickCard` queues a provisional card. It does not remove or reveal the card, change a pool, increment `totalPicks`, pass a pack, or advance a counter. The same occupant may replace that seat's provisional choice with a different card while the barrier remains open; replaying the identical queued choice is an idempotent same-state no-op and cannot create a duplicate commit. Other seats' choices remain independent of arrival order.

`revealBarrier` succeeds only when all seats have a valid provisional choice. It then clears all provisional choices and, in one immutable transition, removes each selected card exactly once, appends it to each seat's chronological pool, increments committed picks, and passes or opens the next round. If that pass leaves one card in each pack, the same transition passes and automatically appends each sole final card to its receiving seat before advancing; no provisional choice or pick interval is created for it. There is no partially revealed state.

“Left” sends the pack at seat index `i` to `(i + 1) mod seatCount`; “right” sends it to `(i - 1 + seatCount) mod seatCount`. Directions are left, right, left for rounds one through three and work identically for odd and even tables. Exhausting a round opens the next round without an empty-pack choice state. Exhausting round three creates the exact terminal state with no packs, provisional picks, pending seats, legal choices, or unopened rounds.

## Presence, vacancy, and replacement

`disconnectSeat` and `reconnectSeat` change connection state without changing occupancy, pack, pool, or a queued choice. `vacateSeat` atomically clears the departing occupant and that seat's provisional choice. `fillSeat` is valid only for a vacant seat; the replacement inherits the stable seat, current pack, existing picked pool, and future packs, but never inherits a queued choice. The replacement can then queue through `pickCard` using its own occupant ID.

Vacant and disconnected seats remain in the immutable pass ring. They do not expose interactive legal choices, but timeout fallback still commits one card for every such seat.

## Timeout and caller-owned randomness

Timeout resolution is explicit:

```ts
state = resolveTimeout(
  state,
  { type: "timeout", round: state.round, pick: state.pick },
  missingSeats.map(({ id, packId }) => ({
    type: "random-fallback",
    round: state.round,
    pick: state.pick,
    seatId: id,
    packId,
  })),
  randomSource,
);
```

The fallback intents must cover each and only each seat without a provisional choice, exactly once, and must bind its current pack. The complete batch is validated before the first entropy read, so malformed, duplicate, stale, or foreign fallback rejection consumes no samples. Existing provisional choices are committed unchanged. Missing choices are selected uniformly from their local packs using rejection sampling over caller-supplied uint32 samples. `DraftRandomSource` is only the local `nextUint32()` interface: the package creates, seeds, stores, and imports no random generator. Rejected uint32 samples consume another caller-owned sample; malformed samples reject the transition. Only resulting card identities enter state.

## Bots and single-player use

`BotPolicy` receives only current round/pick metadata and one local abstract pack. `firstCardBotPolicy` deterministically chooses its first card without card-strength knowledge or randomness. `runPendingBots` queues connected bot choices through the same `pickCard` validation path and does not reveal or commit the barrier. The caller invokes the same reveal or timeout transition used for human tables. Policies are replaceable and invalid output is rejected.

## Invariants

- Every picking state has exactly one pack at every stable seat.
- A provisional instance belongs to that seat's exact current pack and phase.
- Cards remain in packs and out of pools until an atomic reveal or timeout commit.
- Every interactive commit moves one selected instance per seat and preserves chronological pool order; when only one card then remains, the same transition passes and assigns it automatically.
- Passing, automatic final-card assignment, pick advancement, round opening, and completion occur only with a full atomic commit.
- Vacating clears provisional ownership before replacement or fallback can occur; disconnecting does not.
- Caller-owned timeout entropy is mapped without modulo bias.
- Historical states remain immutable and independently branchable.

## Integration requirements

Later integration must construct unique physical IDs, keep unopened packs and provisional identities server-side, authenticate occupant/seat authority before calling this package, serialize the exact stale-action fields, own timing and entropy, and project only seat-appropriate views. Empty/disconnected readiness policy and deadline scheduling remain integration concerns; timeout resolution itself is deterministic for the supplied intents and random sample sequence.

No external registration is needed because the root `packages/*` workspace glob already discovers this package.

## Validation

```sh
npm --workspace @draft-table/draft run build
npm --workspace @draft-table/draft run typecheck
npm --workspace @draft-table/draft run lint
npm --workspace @draft-table/draft test
```

Tests cover setup, provisional replacement and reveal ordering, vacancy versus disconnect, replacement inheritance, exact fallback coverage, rejection-sampling boundaries, three-round passing, odd/even rotations, exhaustion, chronological pools, stale/foreign/malformed rejection, immutability, replaceable bots, single-player completion, serialization, terminal state, and package boundaries.
