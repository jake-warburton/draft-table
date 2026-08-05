# Card presentation stream

This is the build-time implementation description; [shared collation documentation](../rules-and-collation.md#card-presentation-boundary) owns the accepted mapping, evidence attribution, and limitations.

## Mapping

`card-presentation.ts` is build-time-only internal tooling. It accepts only the registered official/upstream identity reconciliation and registered Card Vault face projection, plus exact capability-owned object references to one identity and one upstream printing, and one exact face-position number. It copies, freezes, and attributes these fields without normalizing them:

- display name and pitch: pinned upstream `card.json` card fields;
- rarity and treatment: pinned upstream printing `rarity` and `foiling` text (treatment is not classified);
- image URL: the official Card Vault face's exact `normal` rendition;
- identity boundary: Card Vault `officialPrintId`/collector identity plus upstream card and printing IDs;
- face boundary: exact Card Vault `layout_position`.

Pitch colour and rear marker are `null`: the accepted inputs have no authoritative field for either. In particular, pitch is retained but never mapped to a colour, and `expansion_slot` is not re-labelled as a rear marker. Missing face facts, copied/foreign capabilities or selected references, and non-unique/missing selected face positions fail with the stable presentation error. The projection never selects a printing, face, collation identity, instance, or duplicate policy.

## Evidence and commands

The [walking-skeleton setup](../../README.md#walking-skeleton-setup) owns the public evidence command and input instructions. That command runs the existing checksum, schema, and membership guards before the projection and prints its success marker only after the exact public-evidence contract executes. No source bytes, snapshots, or network fetches are committed or used at runtime. Private four-source acceptance passed on PR 63 for exact head `4dbef5dd63c7e655f2cf9b4674d4238b0f1cac4b` (19/19, five stored exploits defeated, both named `defineProperty` live-global-substitution contracts failed, and green CI; squash `34e81f3cf54e853ce8c07b9b4606416481a86ffa`).

## Integration risks

The module is intentionally not exported from the package root or client-facing API. Later integration must keep the source boundary and unresolved `null` fields rather than inferring colours, treatment semantics, rear identity, image accessibility, printing choice, or physical/card-instance behavior. Private evidence remains outside this stream and cannot be inferred from the public acceptance.
