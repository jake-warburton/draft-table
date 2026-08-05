# Stream 2: complete Omens pack construction

## API

`packages/set-omens/src/pack-construction.ts` composes only the existing opaque plan history and finite-batch position-transition APIs.

- `constructOmensPackFromInitializedPlanAndUnsigned32SampleBatches(plan, batches)` accepts a cursor-zero initialized plan and a finite outer list of finite uint32 batches.
- `continueOmensPackConstructionFromUnsigned32SampleBatches(continuation, batches)` resumes an exact opaque incomplete construction.
- `state: "needs-samples"` returns no pack. It returns a fresh immutable continuation, the explicit selected-position count, per-invocation consumed batch/sample counts, and cumulative counts.
- `state: "complete"` is emitted only after all 14 recipe-structural positions. Its immutable identity-only projection preserves the exact selected layout reference, exact source-order position references, exact capability-owned official-identity references, and terminal opaque plan.

One outer batch is one attempt at the current position. A child `needs-sample` result consumes its finite batch but leaves the current plan and position history unchanged; a later caller batch retries that same position. Construction stops after the fourteenth accepted transition and does not inspect trailing batches for selection. The caller owns all entropy and all policy for supplying another batch.

Both caller boundaries snapshot the outer length/elements and every nested batch length/element exactly once before composition. They pass only immutable snapshots inward. Malformed, copied, foreign, partial, and terminal plan/continuation inputs fail through `OmensPackConstructionError`.

These modules remain package-internal pending integration through an existing supported package subpath; this stream does not modify shared export modules.

## Resolved exact-printing rule

The captain resolved the earlier integration choice. There is one behavior and no policy parameter:

- Construction allows the same official identity to be selected from different source pools.
- It performs no identity-wide suppression, deduplication, redraw, or uniqueness tracking.
- Exact-printing uniqueness is official identity plus treatment. The same identity once in a normal position and once in the rainbow-foil position is legal and both selections are preserved.
- Different pitch colours are distinct official identities and require no construction-specific logic.
- Existing exact same-pool no-replacement plus recipe structure owns exact-printing safety.

Construction retains the recipe-structural role but does not materialize or decide a treatment, printing, physical slot, or card instance.

## Build-time pool-overlap evidence

`packages/set-omens/src/pack-construction-pool-overlap-evidence.ts` accepts only an exact registered recipe-pool resolution capability. Before private pack acceptance, it pins:

- 8 normal pools are pairwise disjoint by official identity;
- normal union unique identities = 209 = the sum of each normal pool's unique count;
- 3 rainbow-foil pools are pairwise disjoint;
- rainbow-foil union unique identities = 171; and
- all 171 rainbow-foil identities are a strict subset of the 209-identity normal union.

The private acceptance contract invokes this guard before compiling or constructing any pack. It also finds a real layout-local overlap witness and proves one complete pack preserves that identity in a normal position and the rainbow-foil position. The command reports no source bytes or identities.

## Commands

Focused public tests and the named semantic mutation:

```sh
node --experimental-strip-types --test \
  packages/set-omens/test/pack-construction.test.mjs \
  packages/set-omens/test/pack-construction-pool-overlap-evidence.test.mjs \
  packages/set-omens/test/pack-construction-pool-overlap-evidence-mutations.test.mjs \
  packages/set-omens/test/pack-construction-evidence-command-contract.test.mjs
```

Captain-held four-source acceptance:

```sh
OMENS_RECIPE_EVIDENCE_PATH=<path-to-private-recipe> \
FAB_CARD_SOURCE_EVIDENCE_PATH=<path-to-card.json> \
FAB_CARD_SCHEMA_EVIDENCE_PATH=<path-to-card-schema.json> \
FAB_CARD_VAULT_EVIDENCE_PATH=<path-to-observed-card-vault-response.json> \
npm --silent --workspace @draft-table/set-omens run test:pack-construction-evidence
```

Exact success output:

```text
complete Omens pack construction acceptance passed
```

Private four-source acceptance is **NOT RUN** for this stream head and awaits captain measurement against the exact published remote head.

## Limitations

This slice owns no entropy source, replacement-sample synthesis, infinite retry loop, seed, treatment/printing selection, card instance, rear marker, image, physical-slot interpretation, snapshot, runtime pool, cross-pack policy, or room behavior. A recipe-structural position is not a physical slot. The pack is an immutable official-identity reference projection only.
