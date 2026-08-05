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
- Public inputs were obtained and checksum-verified for this worktree: card `243162c827dc9becc3dad46894b15e6ed4dfb7ceb63eee10efb3568f6730219e`, schema `4fd114d85ab416854e84d298f468d1bc390075997d9d8886378b699586b886c1`, and observed Card Vault response `59f26e3071ef50a0515c99ce568110934290aad698b3669b45e224e52fc1a83f`. Public projection acceptance is **NOT RUN** because the review worktree has no installed `ajv-draft-04` dependency; Node failed while importing `public-source-schema-validation.ts` with `ERR_MODULE_NOT_FOUND` before the contract could execute.
- Private four-source acceptance is **NOT RUN — awaiting captain measurement**; it is not waived by the public result.

## Integration risks

The module is intentionally not exported from the package root or client-facing API. Later integration must keep the source boundary and unresolved `null` fields rather than inferring colours, treatment semantics, rear identity, image accessibility, printing choice, or physical/card-instance behavior. Private evidence remains outside this stream and cannot be inferred from the public acceptance.
