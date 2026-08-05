# Stream 4: draft runtime

`@draft-table/draft` is a dependency-free, platform-independent state machine. It owns draft sequencing only. It does not collate packs, interpret card strength, generate randomness, perform I/O, or import `@draft-table/engine` or `@draft-table/set-omens`.

## Abstract inputs

The package deliberately uses local product-neutral types:

- `DraftCard`: `instanceId`, `cardId`, and optional display `label`. `instanceId` identifies one exact physical draft choice; `cardId` may be shared by multiple instances.
- `DraftPack`: stable pack `id` and an ordered non-empty card array.
- `DraftSeat`: stable seat `id` and a `human` or `bot` controller.
- `DraftSetup`: 2–8 seats and exactly three rounds, each containing one pack per seat. Packs in one round must have equal non-zero sizes.

Seat IDs, pack IDs, and card instance IDs are unique in a setup. At least one seat is human-controlled. Setup copies only the abstract card fields, so later caller changes cannot alter a draft.

## State-transition API

```ts
const initial = createDraft(setup);
const next = pickCard(initial, {
  round: initial.round,
  pick: initial.pick,
  seatId,
  packId,
  cardInstanceId,
});

const afterBots = runPendingBots(next, firstCardBotPolicy);
```

`DraftState` exposes:

- `status`: `picking` or `complete`;
- current `round`, one-based `pick`, and `passDirection`;
- stable ordered `seats`;
- `packsInFlight`, including each pack's original and current seat;
- future `unopenedRounds` needed by the pure transition;
- canonical `pendingSeatIds` for the current barrier;
- per-seat chronological `pickedPools`;
- `legalChoices`, containing the exact pack and immutable cards each pending seat can choose;
- `totalPicks`.

All created states and nested values are frozen. A successful transition returns a new state and leaves its input available as an independent historical branch. A rejection throws `DraftRuleError` and cannot partially mutate the input.

Actions bind the caller's intent to an exact round, pick, seat, pack, and card instance. Error codes distinguish malformed, terminal, stale, unknown-seat, duplicate-seat, wrong-pack, and absent-card actions. A delayed action cannot become valid merely because the same seat receives another pack later.

## Pure simultaneous-barrier sequencing

The runtime models simultaneous table picks as explicitly sequenced pure actions:

1. At the start of each pick, every seat is in `pendingSeatIds` in canonical setup order.
2. Any pending seat may submit its one action; server arrival order does not constrain other seats.
3. That card is removed and appended to that seat's pool immediately. The seat leaves the barrier, but no pack moves and `pick` does not advance.
4. Only the action that empties `pendingSeatIds` closes the barrier.
5. If cards remain, every pack passes atomically, `pick` increments, and all seats become pending again.
6. If packs are empty, the next round opens immediately. There is no empty-pack choice state.
7. Exhausting round three creates the terminal state.

“Left” maps the pack at seat index `i` to `(i + 1) mod seatCount`; “right” maps it to `(i - 1 + seatCount) mod seatCount`. Directions are left in round one, right in round two, and left in round three. The definition works identically for odd and even table sizes.

## Invariants

- Every picking state has exactly one in-flight pack at each seat.
- A pending seat has exactly one matching legal choice; a seat that already acted has none.
- One action removes exactly one matching card instance and appends that same instance exactly once.
- Packs cannot pass and round/pick counters cannot advance before the full-table barrier closes.
- Each seat's picked pool is chronological across picks and rounds, independent of action arrival order at a barrier.
- Every unopened round remains immutable and opens with pack index aligned to seat index.
- Completion is exact: round 3 remains current, direction is left, `pick` remains the final round's last pick number, all cards are in picked pools, and in-flight packs, unopened rounds, pending seats, and legal choices are empty. Further picks are rejected.

## Bots and single-player use

`BotPolicy` is an explicit replaceable function that receives only the bot's current round/pick metadata and locally available abstract cards. The built-in `firstCardBotPolicy` always chooses the first offered card and has no card-strength rules or randomness. `runPendingBots` resolves pending bot seats in canonical order and stops when only human input remains or the draft completes. A one-human setup with one or more bot seats therefore uses the same transition and validation path as a multiplayer table.

A policy returns a card instance ID. The runtime validates that output against the bot's exact active pack; illegal policy output is a `BOT_INVALID_CHOICE` rejection.

## Integration requirements

Later integration must:

1. construct unique card-instance and pack IDs while adapting product cards and three collated pack rounds into these local types;
2. keep the authoritative full state server-side because `unopenedRounds` contains future packs, and project only seat-appropriate views over shared contracts;
3. add authenticated room/action identity checks outside this package, then call `pickCard` with the authoritative seat, round, pick, pack, and card instance;
4. serialize actions and state through later shared contracts without weakening stale-action fields;
5. choose bot policies explicitly; product intelligence, entropy, and timing stay outside this runtime;
6. preserve the 2–8 drafting-seat boundary independently from spectator room limits.

No integration registration outside the package is currently required: the existing root `packages/*` workspace glob discovers it.

## Validation

Package-only commands:

```sh
npm --workspace @draft-table/draft run build
npm --workspace @draft-table/draft run typecheck
npm --workspace @draft-table/draft run lint
npm --workspace @draft-table/draft test
```

Repository commands:

```sh
npm run build
npm run typecheck
npm run lint
npm test
npm run size
```

The package tests cover setup, all supported seat counts, the simultaneous barrier, all three passing directions, odd/even wrapping, exhaustion and round opening, chronological pools, exact terminal state, stale/duplicate/foreign/malformed rejections, immutable branch independence, deterministic and replaceable bots, single-player completion, and the dependency/import boundary.
