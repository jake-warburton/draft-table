# Card presentation stream

## Authoritative mapping

`card-presentation.ts` is build-time-only internal tooling. It accepts only the registered official/upstream identity reconciliation and registered Card Vault face projection, plus exact object references to one identity and one upstream printing and one face position. It copies, freezes, and attributes these fields without normalizing them:

- display name and pitch: pinned upstream `card.json` card fields;
- rarity and treatment: pinned upstream printing `rarity` and `foiling` text (treatment is not classified);
- image URL: the official Card Vault face's exact `normal` rendition;
- identity boundary: Card Vault `officialPrintId`/collector identity plus upstream card and printing IDs;
- face boundary: exact Card Vault `layout_position`.

Pitch colour and rear marker are `null`: the accepted inputs have no authoritative field for either. In particular, pitch is retained but never mapped to a colour, and `expansion_slot` is not re-labelled as a rear marker. Missing face facts, copied/foreign capabilities or selected references, and non-unique/missing selected face positions fail with the stable presentation error. The projection never selects a printing, face, collation identity, instance, or duplicate policy.

## Evidence and commands

- `npm run test:card-presentation-evidence` requires caller-held `FAB_CARD_SOURCE_EVIDENCE_PATH`, `FAB_CARD_SCHEMA_EVIDENCE_PATH`, and `FAB_CARD_VAULT_EVIDENCE_PATH`; the existing checksum/schema/membership capabilities run before this projection.
- The command prints `card presentation acceptance passed` only after its exact public-evidence contract executes. No source bytes, snapshots, or network fetches are committed or used at runtime.

## Integration risks

The module is intentionally not exported from the package root or client-facing API. Later integration must keep the source boundary and unresolved `null` fields rather than inferring colours, treatment semantics, rear identity, image accessibility, printing choice, or physical/card-instance behavior. Private four-source acceptance is not run by this stream.
