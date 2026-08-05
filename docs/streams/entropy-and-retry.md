# Entropy and retry stream

## Algorithm and version

`pcg-xsh-rr-64-32-v1` is the complete replay identifier. It is PCG XSH RR with a 64-bit state and 32-bit output, implemented with exact `bigint` state arithmetic and JavaScript's specified uint32 shifts.

For an old state `s` and uint32 domain `d`:

- `increment = (d << 1) | 1`
- `next = (s * 6364136223846793005 + increment) mod 2^64`
- `xorshifted = (((s >> 18) xor s) >> 27) mod 2^32`
- `rotation = s >> 59`
- `sample = rotateRight32(xorshifted, rotation)`

Initialization follows canonical PCG seeding exactly: begin at state zero, perform one state transition with the domain-derived increment, add the seed modulo `2^64`, then perform a second state transition. Output is taken from the old state before its transition. The published PCG seed/domain vector `(42, 54)` is pinned in tests, beginning `a15c02b7, 7b47f409, ba1d3330, 83d2f293, bfa4784b, cbed606e`.

This is a deterministic replay generator, not a cryptographic random source. Changing any constant, initialization step, bit operation, serialization rule, or output timing requires a new algorithm version rather than silently changing v1.

## Seed, domain, state, and replay contract

- Seed and domain are each exact integers in `[0, 2^32)`. Zero is valid. Fractions, non-finite numbers, coercible values, omissions, and extra arguments fail with `DeterministicUint32SourceError`.
- Domain selects PCG's odd stream increment. Callers must assign stable domain numbers by purpose; domain values are replay metadata and separation labels, not secrets or security boundaries.
- State is an immutable primitive string with exact lowercase form `pcg-xsh-rr-64-32-v1:<16 lowercase state hex>:<8 lowercase domain hex>`. No seed is hidden outside that string. A canonical restored string completely determines all following samples.
- `generateDeterministicUint32Sample` returns a fresh frozen `{ sample, sourceState }` transition and never mutates its input.
- Samples are exact integers in `[0, 2^32)`. Tests pin both `0` and `4294967295`, including unsigned high-bit behavior.
- The same algorithm version, seed, domain, initial state, and ordered calls produce identical samples and following states. The same ordered bounds additionally produce byte-identical sampled transcripts, retry counts, tickets, and final source state.
- Different state branches are independent values: advancing one returned branch cannot mutate its parent or sibling.

## Caller-side unbiased retry

`drawDeterministicBoundedTicket` accepts a canonical source state and an exact integer bound in `[1, 2^32]`. For every attempt it generates exactly one sample, passes `[sample]` to the existing `mapUnsigned32SampleBatchToBoundedTicket`, and advances only to the explicit returned source state. A `needs-sample` result repeats without a retry cap; the first `accepted` result returns immediately. It never computes a ticket itself, invokes an alternate mapper, falls back, or changes the mapper.

The frozen accepted result records the bound, every consumed sample in source order, exact consumed count, `retryCount = consumedSamples - 1`, accepted ticket, and state after the accepted sample. Transcript storage is intentionally proportional to actual retries so replay evidence includes rejected samples; there is no silent truncation.

Invalid state, bound, or arity fails with the same stable value-free source error. The existing mapper implementations and tests remain unchanged.

## API wiring still owed

The new module is intentionally not re-exported from `packages/engine/src/index.ts` in this stream's file-disjoint implementation. Integration must add the additive package-root export for `deterministic-uint32-source.ts` and update package-boundary expectations before external consumers can import these APIs from `@draft-table/engine`.

## Validation

Focused deterministic vectors and retry contracts:

```sh
node --experimental-strip-types --test packages/engine/test/deterministic-uint32-source.test.mjs
```

Engine gates:

```sh
npm --workspace @draft-table/engine run build
npm --workspace @draft-table/engine run typecheck
npm --workspace @draft-table/engine run lint
npm --workspace @draft-table/engine test
```

Repository gates:

```sh
npm run build
npm run typecheck
npm run lint
npm test
npm run size
```

## Integration risks

- Replay data must retain the exact algorithm-version string, domain, and state; recording only a human seed label is insufficient.
- Domain allocation is caller-owned. Reusing a seed/domain pair intentionally reproduces one stream, while changing call or bound order intentionally changes all following state.
- PCG is deterministic rather than cryptographically secure. Do not use it where players can choose or learn authoritative seeds before hidden outcomes are fixed.
- Returning every retry sample makes diagnostics exact but uses memory proportional to an uncapped retry run.
- Browser/Worker targets must preserve `bigint` and standard uint32 shift semantics; replacing the arithmetic with floating-point math breaks replay.
- Package-root export and consumer boundary registration remain an integration step as noted above.
