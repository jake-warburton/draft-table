# Draft Table

Draft Table is a planned public, free-to-host multiplayer draft simulator for Flesh and Blood. The MVP is scoped to **Omens of the Third Age**, with 2–8 human drafters and up to 16 total room participants including spectators.

> **Status: walking skeleton implementation begun.** Phase 2 checksum verification plus strict Settings-envelope, CustomCards-schema, indentation-sensitive Layouts-schema parsing, pinned Layouts aggregate fixtures, and strict immutable pool-section schema parsing with pinned pool aggregates are implemented, including exact Layout-to-pool and pool-to-CustomCards reference resolution. The public v8.2.0 English `card.json` input and card schema are checksum-pinned and receive strict build-time JSON encoding/envelope, duplicate-key, root-shape, and full pinned Draft-04 schema conformance validation; the build-time-only schema-validation entry point now projects exact source-order `set_id === "OMN"` card identities and printings (251 records, 482 rows, 251 distinct collector IDs). The dated 2026-08-04 official Card Vault response remains checksum-pinned as historical build-time evidence; a separate strict build-time entry point derives and canonically pins its official membership (260 IDs: 251 `OMN`, 9 `IAR`) without retaining response bytes or IDs in the repository. Official identity/base reconciliation, strict retention of exact upstream `art_variations` source arrays with pinned sequence/suffix aggregates, the observed suffix-to-upstream-foiling correspondence, strict Card Vault face-position/image-rendition retention with pinned aggregates, and MV-only face-to-upstream-printing-row multiplicity reconciliation are complete. Exact derived pitch-name recipe-to-official identity reconciliation is complete behind an opaque build-time capability, establishing the 209-mapped/51-`unmapped` identity partition. Mapped-only recipe-label/upstream-row rarity correspondence is implemented as observed cross-source metadata, with its real four-source result still captain-acceptance-pending; [card snapshot reconciliation](docs/rules-and-collation.md#card-snapshot-reconciliation) owns the detailed contract. A build-time-only Omens product-policy classification now produces canonical-order facts: the 209 mapped identities are draftable by captain contract, the nine unmapped IAR identities are excluded by that contract, and the other 42 unmapped identities remain unclassified; its real four-source acceptance remains captain-acceptance-pending. Every already-validated recipe pool reference now resolves through its exact same-source CustomCards owner and collector-first identity capability to an exact draftable official identity, preserving source pool/entry order, weights, and established pool rarity/category facts without selecting a printing or treatment; the real four-source pool resolution remains captain-acceptance-pending. Every one of the 228 validated weighted layout templates now retains its stable ID, weight, exact 14 positions, repeated source references, and explicit recipe-structural 11 common-rarity + 1 fixed-rare + 1 rare-or-majestic + 1 rainbow-foil roles while pointing each position through an opaque capability-owned resolved pool to draftable official identities; its real four-source acceptance remains captain-acceptance-pending. A build-time compiler now consumes only those exact layout and pool capabilities to produce deeply immutable, copy-independent, source-order integer cumulative-weight tables for all 228 layouts (460,800 total weight) and all 11 pools; its real four-source acceptance also remains captain-acceptance-pending. Exact bounded-ticket lookup now deterministically selects only the registered capability-owned layout or named-pool identity reference; its real four-source acceptance also remains captain-acceptance-pending. One-sample composition now uses the platform-independent engine's unbiased uint32 mapping with each exact capability-owned layout or pool bound and returns only explicit retry or the selected immutable reference; its real four-source acceptance remains captain-acceptance-pending. A fresh deeply immutable pack-local projection of all 11 registered identity-pool tables now removes one exact selected identity only from one exact pool and recompiles that pool's cumulative weights, implementing the recipe's repeated same-pool `withReplacement=false` transition; its real four-source acceptance remains captain-acceptance-pending. These recipe-structural roles are not physical slots, and cross-pool duplicate policy remains unclassified. Random-source ownership, retry policy/loops, seed/state, sampling and selection sequencing, card draws, layout-to-pack sequencing, card instances, pack construction, face identity/position semantics, URL authority or selection, image accessibility identity, rear markers, art-variation and full suffix/treatment semantics, physical-slot classification, snapshot emission, runtime card pools, runtime collation, runtime/server room authority, simulation, and other runtime behavior remain unimplemented. This MV-only equality must not be generalized to RF or unsuffixed records, which legitimately have other upstream-row multiplicities; it establishes neither front/back semantics nor URL-to-printing correspondence. The shipped targeted explicit-port behavior remains unchanged; href canonicality remains a separate queued decision outside this slice. Normal-pool partition, Rainbow Foil subset coverage, all-pinned-pools-used validation, recipe pool-label constraints, the six exact outcome coefficients, 11C + 1R + 1R/M + 1RF slot structure, and exact derived rational fixtures are enforced. Random generation, rear-slot wrapping, and runtime recipe-driven card collation remain unimplemented. The repository otherwise contains only a neutral browser shell and workspace boundaries. Draft behavior, rooms, networking, deployment, Fabrary integration, and product UI have not begun.

## Walking skeleton setup

Requires Node.js 22.6+ and npm 10+.

```sh
npm install
npm run build
npm run typecheck
npm run lint
npm test
npm run size
```

Before shipping any `set-omens` slice that depends on the captain-held recipe, run the private acceptance pass locally (the path is never part of repository configuration):

```sh
OMENS_RECIPE_EVIDENCE_PATH=<path-to-private-recipe> npm --silent --workspace @draft-table/set-omens run test:evidence
```

To verify caller-provided copies of all three pinned public evidence inputs without a network fetch, run:

```sh
FAB_CARD_SOURCE_EVIDENCE_PATH=<path-to-card.json> \
FAB_CARD_SCHEMA_EVIDENCE_PATH=<path-to-card-schema.json> \
FAB_CARD_VAULT_EVIDENCE_PATH=<path-to-observed-card-vault-response.json> \
npm --silent --workspace @draft-table/set-omens run test:public-source-evidence
```

For the separate recipe-to-official identity acceptance, the captain must provide the private recipe together with independently checksum-verified copies of all three public inputs:

```sh
OMENS_RECIPE_EVIDENCE_PATH=<path-to-private-recipe> \
FAB_CARD_SOURCE_EVIDENCE_PATH=<path-to-card.json> \
FAB_CARD_SCHEMA_EVIDENCE_PATH=<path-to-card-schema.json> \
FAB_CARD_VAULT_EVIDENCE_PATH=<path-to-observed-card-vault-response.json> \
npm --silent --workspace @draft-table/set-omens run test:recipe-identity-evidence
```

Success prints only `recipe identity reconciliation acceptance passed`. This command is intentionally separate and does not broaden either existing acceptance command.

For the separately reviewed recipe-rarity correspondence, run the same four checksum-pinned inputs through its own command:

```sh
OMENS_RECIPE_EVIDENCE_PATH=<path-to-private-recipe> \
FAB_CARD_SOURCE_EVIDENCE_PATH=<path-to-card.json> \
FAB_CARD_SCHEMA_EVIDENCE_PATH=<path-to-card-schema.json> \
FAB_CARD_VAULT_EVIDENCE_PATH=<path-to-observed-card-vault-response.json> \
npm --silent --workspace @draft-table/set-omens run test:recipe-rarity-evidence
```

Success prints only `recipe rarity correspondence acceptance passed`; only the captain can perform and accept this real four-source run.

For the captain-approved partial draft-eligibility classification, run the same four checksum-pinned inputs through its separate command:

```sh
OMENS_RECIPE_EVIDENCE_PATH=<path-to-private-recipe> \
FAB_CARD_SOURCE_EVIDENCE_PATH=<path-to-card.json> \
FAB_CARD_SCHEMA_EVIDENCE_PATH=<path-to-card-schema.json> \
FAB_CARD_VAULT_EVIDENCE_PATH=<path-to-observed-card-vault-response.json> \
npm --silent --workspace @draft-table/set-omens run test:draft-eligibility-evidence
```

Success prints only `draft eligibility classification acceptance passed`; its real 209/9/42 result is captain-acceptance-pending. This establishes build-time facts only, not a runtime pool, treatment semantics, or collation behavior.

For the separate recipe-pool identity resolution, run the same four checksum-pinned inputs through its own command:

```sh
OMENS_RECIPE_EVIDENCE_PATH=<path-to-private-recipe> \
FAB_CARD_SOURCE_EVIDENCE_PATH=<path-to-card.json> \
FAB_CARD_SCHEMA_EVIDENCE_PATH=<path-to-card-schema.json> \
FAB_CARD_VAULT_EVIDENCE_PATH=<path-to-observed-card-vault-response.json> \
npm --silent --workspace @draft-table/set-omens run test:recipe-pool-identity-evidence
```

Success prints only `recipe pool identity resolution acceptance passed`; the real result remains captain-acceptance-pending. It establishes ordered weighted references to official identities only and selects no printing, treatment, foiling, image, physical slot, or runtime collation rule.

For the following recipe-layout pool resolution, use the same four checksum-pinned inputs:

```sh
OMENS_RECIPE_EVIDENCE_PATH=<path-to-private-recipe> \
FAB_CARD_SOURCE_EVIDENCE_PATH=<path-to-card.json> \
FAB_CARD_SCHEMA_EVIDENCE_PATH=<path-to-card-schema.json> \
FAB_CARD_VAULT_EVIDENCE_PATH=<path-to-observed-card-vault-response.json> \
npm --silent --workspace @draft-table/set-omens run test:recipe-layout-pool-resolution-evidence
```

Success prints only `recipe layout pool resolution acceptance passed`; the real layout result remains captain-acceptance-pending. This resolves immutable weighted templates to identity pools only: it does not draw cards, enforce no-replacement at runtime, or select a printing, treatment, foiling, image, or physical slot.

For the following build-time collation-weight table compilation, use the same four checksum-pinned inputs:

```sh
OMENS_RECIPE_EVIDENCE_PATH=<path-to-private-recipe> \
FAB_CARD_SOURCE_EVIDENCE_PATH=<path-to-card.json> \
FAB_CARD_SCHEMA_EVIDENCE_PATH=<path-to-card-schema.json> \
FAB_CARD_VAULT_EVIDENCE_PATH=<path-to-observed-card-vault-response.json> \
npm --silent --workspace @draft-table/set-omens run test:collation-weight-tables-evidence
```

Success prints only `collation weight tables acceptance passed`; the real result remains captain-acceptance-pending. This compiles source-order integer cumulative weights only: it performs no selection, randomness, or card draw.

For the following exact bounded-ticket collation lookup, use the same four checksum-pinned inputs:

```sh
OMENS_RECIPE_EVIDENCE_PATH=<path-to-private-recipe> \
FAB_CARD_SOURCE_EVIDENCE_PATH=<path-to-card.json> \
FAB_CARD_SCHEMA_EVIDENCE_PATH=<path-to-card-schema.json> \
FAB_CARD_VAULT_EVIDENCE_PATH=<path-to-observed-card-vault-response.json> \
npm --silent --workspace @draft-table/set-omens run test:collation-weighted-selection-evidence
```

Success prints only `collation weighted selection acceptance passed`; only the captain can perform and accept this exhaustive real four-source pass. It checks all 460,800 layout tickets and every ticket of every named pool table, but does not generate randomness, draw cards, enforce no replacement, or construct packs.

For one-sample unbiased uint32 composition with every exact layout and pool scope, use the same four checksum-pinned inputs:

```sh
OMENS_RECIPE_EVIDENCE_PATH=<path-to-private-recipe> \
FAB_CARD_SOURCE_EVIDENCE_PATH=<path-to-card.json> \
FAB_CARD_SCHEMA_EVIDENCE_PATH=<path-to-card-schema.json> \
FAB_CARD_VAULT_EVIDENCE_PATH=<path-to-observed-card-vault-response.json> \
npm --silent --workspace @draft-table/set-omens run test:collation-sample-selection-evidence
```

Success prints only `collation sample selection acceptance passed`; only the captain can perform and accept this real four-source analytical and boundary pass. It owns no random source, replacement-sample request, retry loop, card draw, or pack construction.

For the pack-local same-pool no-replacement state transition, use the same four checksum-pinned inputs:

```sh
OMENS_RECIPE_EVIDENCE_PATH=<path-to-private-recipe> \
FAB_CARD_SOURCE_EVIDENCE_PATH=<path-to-card.json> \
FAB_CARD_SCHEMA_EVIDENCE_PATH=<path-to-card-schema.json> \
FAB_CARD_VAULT_EVIDENCE_PATH=<path-to-observed-card-vault-response.json> \
npm --silent --workspace @draft-table/set-omens run test:pack-local-pool-draw-state-evidence
```

Success prints only `pack local pool draw state acceptance passed`; only the captain can perform and accept this real four-source pass. It removes each pool entry from an isolated fresh state and proves exact same-pool recompilation without defining cross-pool duplicate removal, selection, or pack construction.

None of the evidence commands commits or configures its input files. Keep the evidence bytes outside Git pending later provenance and human review. The unversioned Card Vault endpoint is never fetched at runtime. Its immutable 2026-08-04 raw-response checksum descriptor is dated historical evidence, not a retrievable API version pin: it must not reject a future cosmetically changed response when strict canonical official membership remains identical. The build-time `validateCardVaultOmensOfficialMembership` entry point derives that membership from caller-provided bytes and pins canonical sorted print-ID membership facts rather than raw serialization. The validated official membership now also has a build-time syntax/marker-form classifier; all 260 validated exact bases are joined to pinned upstream identities and all matching `OMN` and `IAR` printing rows. Its Card Vault face records retain only exact ordered `layout_position` values and exact HTTPS image rendition URL text after capability-bound membership revalidation, without product-semantic interpretation. The build-time-only reconciled source `art_variations` arrays are retained exactly and aggregate-pinned without interpretation; the observed suffix/foiling correspondence is defined in [card snapshot reconciliation](docs/rules-and-collation.md#card-snapshot-reconciliation). The exact private-recipe identity join first selects the exact collector and then requires exact equality with a name derived from the pinned official bare name plus its exact card-level pitch (`1` → `(red)`, `2` → `(yellow)`, `3` → `(blue)`, empty pitch → bare name). It never rewrites or normalizes the recipe string. The corrected exact-name derivation establishes the real 209/51 identity partition. `unmapped` means only absent from this community recipe and is not `excluded` or evidence of non-draftability. The mapped-only rarity machinery retains observed cross-source metadata without assigning slot, treatment, or draftability semantics; its exact scope and aggregates are defined in [card snapshot reconciliation](docs/rules-and-collation.md#card-snapshot-reconciliation), and the real result remains captain-acceptance-pending. Recipe pool references now resolve only through verified same-source ownership to accepted draftable official identities; Rainbow Foil pool membership remains uninterpreted recipe membership. Completed weighted layouts preserve exact source order and multiplicity plus recipe-structural common-rarity, fixed-rare, rare-or-majestic, and rainbow-foil roles while referencing those exact opaque pool facts; these recipe-structural roles do not choose cards, represent physical slots, or reinterpret Rainbow Foil membership as an official RF form. The completed build-time collation-weight compiler consumes only those exact opaque layout and pool capabilities and retains their references, source order, positive safe-integer weights, cumulative exclusive ends, and scoped totals. Exact bounded-ticket lookup consumes only that registered capability and returns its immutable layout or exact named-pool identity reference; it remains captain-acceptance-pending. One-sample composition now binds the engine's unbiased uint32 mapper to the exact selected layout or pool total, propagates retry without lookup or fallback, and otherwise returns only the immutable capability-owned reference; its real four-source result remains captain-acceptance-pending. A registered immutable pack-local draw-state transition now starts fresh from all 11 registered pool tables and removes an exact capability-owned identity from only its selected pool, preserving source order and weights while recompiling cumulative ends and the scoped total; its real four-source result remains captain-acceptance-pending. This implements repeated same-pool no-replacement only; cross-pool duplicate policy remains unclassified. Suffix/treatment/art/face/URL semantics, physical slot classification, printing/treatment selection, generated/versioned snapshots, image accessibility identity, rear markers, random-source ownership, caller retry policy/loops, deterministic seed/state, sampling/selection sequencing, card draws, layout-to-pack sequencing, card instances, pack construction, runtime card pools and collation, simulation, and runtime room behavior remain undone. The partial product-policy eligibility fact does not resolve treatment or slot semantics. Draft-04 validation, OMN source projection, official/upstream identity reconciliation, recipe rarity correspondence, suffix correspondence, official face projection, MV-only face/row multiplicity reconciliation, and bounded-ticket selection are explicit build-time tooling: import `validateFabEnglishCardDataAgainstSchema`, `projectSchemaValidatedFabEnglishCardDataForOmn`, `reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData`, `reconcileOmensRecipeCustomCardsWithOfficialUpstreamIdentities`, `reconcileOmensRecipeRaritiesWithOfficialUpstreamPrintings`, `classifyOmensOfficialDraftEligibility`, `resolveOmensRecipePoolsToDraftableOfficialIdentities`, `resolveOmensRecipeLayoutsToOfficialIdentityPools`, `compileOmensCollationWeightTables`, `selectOmensCollationLayoutByTicket`, `selectOmensCollationPoolOfficialIdentityByTicket`, `selectOmensCollationLayoutFromOneUnsigned32Sample`, `selectOmensCollationPoolOfficialIdentityFromOneUnsigned32Sample`, `initializeOmensPackLocalPoolDrawState`, `removeOmensPackLocalPoolOfficialIdentity`, `classifyOfficialCardVaultSuffixFoiling`, `projectOfficialCardVaultFaceMetadata`, and `reconcileOfficialCardVaultFacePrintingMultiplicity` from `@draft-table/set-omens/schema-validation`. That subpath requires the package-local Ajv development dependencies and may fail when they are unavailable; the normal `@draft-table/set-omens` root does not load them.

Pull requests and pushes to `main` install with `npm ci` and run every quality command listed above. `npm run size` enforces a 2,048-byte total emitted-client ceiling; the unchanged client remains 873 bytes, and the server boundary is not emitted yet and reports as zero bytes.

Open `apps/web/dist/index.html` in a browser after `npm run build`. The page is an accessible, plain-HTML Draft Table scaffold; no playable draft behavior exists yet.

## Planning documents

- [Product and MVP specification](docs/product.md)
- [Verified draft rules and booster collation](docs/rules-and-collation.md)
- [Source, card-data, Fabrary, and platform research](docs/research.md)
- [UX flows and accessibility](docs/ux-and-accessibility.md)
- [Domain and data model](docs/domain-model.md)
- [Room state machine and realtime protocol](docs/room-state-and-protocol.md)
- [Cloudflare architecture and free-tier budget](docs/architecture.md)
- [Security and privacy boundaries](docs/security-and-privacy.md)
- [TDD strategy and test matrix](docs/testing.md)
- [Phased implementation plan](docs/implementation-plan.md)
- [Accepted decisions, external unknowns, and risks](docs/risks-and-decisions.md)

## Unofficial product notice

Draft Table is in no way affiliated with Legend Story Studios. Legend Story Studios®, Flesh and Blood™, and set names are trademarks of Legend Story Studios. Flesh and Blood characters, cards, logos, and art are property of Legend Story Studios. Card images are © Legend Story Studios.

The product must not use Flesh and Blood or Legend Story Studios logos, set logos, or imitated trade dress. The official asset terms are summarized and cited in [the research](docs/research.md#legend-story-studios-image-and-app-terms).

## License

Draft Table's own software is licensed under the [MIT License](LICENSE). Third-party card data, images, names, trademarks, and other Legend Story Studios property are not relicensed by that file and remain subject to their respective terms.
