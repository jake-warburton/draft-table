# Draft Table

Draft Table is a planned public, free-to-host multiplayer draft simulator for Flesh and Blood. The MVP is scoped to **Omens of the Third Age**, with 2–8 human drafters and up to 16 total room participants including spectators.

> **Status: walking skeleton implementation begun.** The checksum-pinned Omens build-time evidence and capability pipeline are implemented through 14-position collation plans; detailed evidence scope and captain-pending four-source measurements live in [card snapshot reconciliation](docs/rules-and-collation.md#card-snapshot-reconciliation). Complete 14-position identity-only pack construction is also implemented with finite caller-provided batches, immutable continuation/history/pool state, and no entropy ownership. Same official identities may legally occur in normal and Rainbow Foil positions; treatment distinguishes printings, while pitch variants are distinct identities. The structural evidence guard proves the eight normal pools are pairwise disjoint (209 identities), the three Rainbow Foil pools are pairwise disjoint (171 identities), and the latter are a strict normal-pool subset. Private four-source pack acceptance was accepted by the captain on PR 66: comment-recorded 20/20 acceptance and green CI for exact head `aa825b18b5c455d253af9c0c45842b0b21a4d4bd`, merged 2026-08-05T17:06:39Z (squash `bfda2d97104312d4276523ff23f683b296747b22`). Same-account GitHub approval is mechanically unavailable; the captain comment and merge are the durable authority.
>
> `packages/engine` provides the deterministic replay-only `pcg-xsh-rr-64-32-v1` source and bounded retry transcript; it is non-cryptographic and observed output may allow state reconstruction. It is not a competitive-multiplayer unpredictability guarantee. Production source custody, stream separation, and any cryptographic source remain a later architecture decision. `packages/draft` now provides dependency-free, pure, immutable, serializable draft transitions (including provisional barriers, timeout fallback, bots, passing, presence, and idempotent requeue); integration authority remains outside it.
>
> `packages/set-omens` also has a build-time, source-attributed, capability-bound card-presentation projection. It makes no printing, face, treatment, rear, instance, or collation choice and has no runtime fetch or client API. The conceptual physical booster remains 16 positions: it wraps the complete 14-card recipe layout with two opaque rear markers and removes those markers before visibility. Visible packs always start at **14**, and timing counts down 14, 13, 12, …; the subtraction never makes a 12-card recipe layout.
>
> `apps/web` is a readable, dependency-free, fixture-only playable shell: synthetic fixtures support a deterministic two-seat walkthrough, native buttons, focus/live-status behavior, reduced motion, and phone layout. It still awaits engine/`set-omens` integration. `npm run size` reports completed `apps/web/dist` bytes and rejects missing output; there is no client byte ceiling, `clientCeiling`, size gate, or retained minifier cap. The removed cap had forced accessibility and responsive declarations out, so a budget cannot decide product quality accidentally. Real-card rooms, networking, deployment, Fabrary integration, and the product UI have not begun.

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

For dynamic bounded-ticket lookup from a current pack-local state, use the same four checksum-pinned inputs:

```sh
OMENS_RECIPE_EVIDENCE_PATH=<path-to-private-recipe> \
FAB_CARD_SOURCE_EVIDENCE_PATH=<path-to-card.json> \
FAB_CARD_SCHEMA_EVIDENCE_PATH=<path-to-card-schema.json> \
FAB_CARD_VAULT_EVIDENCE_PATH=<path-to-observed-card-vault-response.json> \
npm --silent --workspace @draft-table/set-omens run test:pack-local-pool-ticket-selection-evidence
```

Success prints only `pack local pool ticket selection acceptance passed`; only the captain can perform and accept this exhaustive fresh and single-removal real four-source pass. It owns no uint32 sample, retry, removal, or pack sequencing.

For one uint32 sample composed with a current pack-local pool state, use the same four checksum-pinned inputs:

```sh
OMENS_RECIPE_EVIDENCE_PATH=<path-to-private-recipe> \
FAB_CARD_SOURCE_EVIDENCE_PATH=<path-to-card.json> \
FAB_CARD_SCHEMA_EVIDENCE_PATH=<path-to-card-schema.json> \
FAB_CARD_VAULT_EVIDENCE_PATH=<path-to-observed-card-vault-response.json> \
npm --silent --workspace @draft-table/set-omens run test:pack-local-pool-sample-selection-evidence
```

Success prints only `pack local pool sample selection acceptance passed`; only the captain can perform and accept this fresh and every-isolated-removal real four-source pass. It checks current-bound preimages, retry tails, boundaries, removed-zero hits, and state immutability, but owns no removal, retry loop, entropy source, or pack sequencing.

For one uint32 sample atomically selecting and removing only from its exact current pack-local pool, use the same four checksum-pinned inputs:

```sh
OMENS_RECIPE_EVIDENCE_PATH=<path-to-private-recipe> \
FAB_CARD_SOURCE_EVIDENCE_PATH=<path-to-card.json> \
FAB_CARD_SCHEMA_EVIDENCE_PATH=<path-to-card-schema.json> \
FAB_CARD_VAULT_EVIDENCE_PATH=<path-to-observed-card-vault-response.json> \
npm --silent --workspace @draft-table/set-omens run test:pack-local-pool-sample-draw-transition-evidence
```

Success prints only `pack local sample draw transition acceptance passed`; only the captain can perform and accept this exhaustive fresh and isolated-single-removal real four-source pass. It owns no retry loop, entropy source, layout or slot sequencing, pack construction, or cross-pool duplicate policy.

For selected-layout fresh plan initialization, use the same four checksum-pinned inputs:

```sh
OMENS_RECIPE_EVIDENCE_PATH=<path-to-private-recipe> \
FAB_CARD_SOURCE_EVIDENCE_PATH=<path-to-card.json> \
FAB_CARD_SCHEMA_EVIDENCE_PATH=<path-to-card-schema.json> \
FAB_CARD_VAULT_EVIDENCE_PATH=<path-to-observed-card-vault-response.json> \
npm --silent --workspace @draft-table/set-omens run test:pack-collation-plan-evidence
```

Success prints only `pack collation plan initialization acceptance passed`; only the captain can perform and accept this every-layout-boundary real four-source pass. Private four-source acceptance is **NOT RUN** for this head and awaits captain remeasurement. A collation plan is not a pack and establishes no drawn cards, slot assignment, treatments, or runtime behavior.

For finite caller-supplied batch plan initialization, use the same four checksum-pinned inputs:

```sh
OMENS_RECIPE_EVIDENCE_PATH=<path-to-private-recipe> \
FAB_CARD_SOURCE_EVIDENCE_PATH=<path-to-card.json> \
FAB_CARD_SCHEMA_EVIDENCE_PATH=<path-to-card-schema.json> \
FAB_CARD_VAULT_EVIDENCE_PATH=<path-to-observed-card-vault-response.json> \
npm --silent --workspace @draft-table/set-omens run test:finite-batch-collation-plan-evidence
```

Success prints only `finite batch collation plan initialization acceptance passed`; private four-source acceptance is **NOT RUN** for this head and awaits captain remeasurement. This initializes a plan, not a pack: no card draw, position transition, cross-pool policy, entropy generation, treatments, or runtime behavior.

For one finite caller-supplied batch atomically transitioning exactly the current recipe-structural plan position and one identity draw, use the same four checksum-pinned inputs:

```sh
OMENS_RECIPE_EVIDENCE_PATH=<path-to-private-recipe> \
FAB_CARD_SOURCE_EVIDENCE_PATH=<path-to-card.json> \
FAB_CARD_SCHEMA_EVIDENCE_PATH=<path-to-card-schema.json> \
FAB_CARD_VAULT_EVIDENCE_PATH=<path-to-observed-card-vault-response.json> \
npm --silent --workspace @draft-table/set-omens run test:finite-batch-plan-position-transition-evidence
```

Success prints only `finite batch collation plan position transition acceptance passed`; private four-source acceptance is **NOT RUN** for this head and awaits captain remeasurement. This transitions one plan position and one identity draw. Recipe-structural positions are not physical slots, and it still does not construct a pack or own entropy, caller retry policy, cross-pool duplicate policy, treatments, snapshots, or runtime behavior.

For exact immutable source-order selection-history retention across every completed real plan, use the same four checksum-pinned inputs:

```sh
OMENS_RECIPE_EVIDENCE_PATH=<path-to-private-recipe> \
FAB_CARD_SOURCE_EVIDENCE_PATH=<path-to-card.json> \
FAB_CARD_SCHEMA_EVIDENCE_PATH=<path-to-card-schema.json> \
FAB_CARD_VAULT_EVIDENCE_PATH=<path-to-observed-card-vault-response.json> \
npm --silent --workspace @draft-table/set-omens run test:pack-collation-plan-selection-history-evidence
```

Success prints only `pack collation plan selection history acceptance passed`; private four-source acceptance is **NOT RUN** for this head and awaits captain remeasurement. This retains exact selected position and official-identity references in a plan. It does not construct a pack or card instance, assign presentation or treatments, own entropy or caller retry policy, or decide cross-pool duplicates.

For complete finite-batch Omens pack construction, run all four checksum-pinned inputs through its separate command:

```sh
OMENS_RECIPE_EVIDENCE_PATH=<path-to-private-recipe> \
FAB_CARD_SOURCE_EVIDENCE_PATH=<path-to-card.json> \
FAB_CARD_SCHEMA_EVIDENCE_PATH=<path-to-card-schema.json> \
FAB_CARD_VAULT_EVIDENCE_PATH=<path-to-observed-card-vault-response.json> \
npm --silent --workspace @draft-table/set-omens run test:pack-construction-evidence
```

Success prints only `complete Omens pack construction acceptance passed` and reports no source bytes or identities. The accepted behavior and durable private evidence authority are documented in [complete identity-only pack construction](docs/rules-and-collation.md#complete-identity-only-pack-construction).

For the separate build-time card presentation projection, run the three checksum-pinned public inputs through its command:

```sh
FAB_CARD_SOURCE_EVIDENCE_PATH=<path-to-card.json> \
FAB_CARD_SCHEMA_EVIDENCE_PATH=<path-to-card-schema.json> \
FAB_CARD_VAULT_EVIDENCE_PATH=<path-to-observed-card-vault-response.json> \
npm --silent --workspace @draft-table/set-omens run test:card-presentation-evidence
```

Success prints only `card presentation acceptance passed`. The command verifies the public sources before projecting one exact caller-selected identity, printing, and face; it does not perform those selections or provide runtime presentation. Private four-source acceptance passed on PR 63: captain comment records 19/19 acceptance commands, both named `defineProperty` live-global-substitution contracts failing, all five stored exploits defeated, and green CI for exact head `4dbef5dd63c7e655f2cf9b4674d4238b0f1cac4b`, merged 2026-08-05T16:46:59Z (squash `34e81f3cf54e853ce8c07b9b4606416481a86ffa`).

None of the evidence commands commits or configures its input files. Keep the evidence bytes outside Git pending later provenance and human review. The unversioned Card Vault endpoint is never fetched at runtime. Its immutable 2026-08-04 raw-response checksum descriptor is dated historical evidence, not a retrievable API version pin: it must not reject a future cosmetically changed response when strict canonical official membership remains identical. The build-time `validateCardVaultOmensOfficialMembership` entry point derives that membership from caller-provided bytes and pins canonical sorted print-ID membership facts rather than raw serialization. The validated official membership now also has a build-time syntax/marker-form classifier; all 260 validated exact bases are joined to pinned upstream identities and all matching `OMN` and `IAR` printing rows. Its Card Vault face records retain only exact ordered `layout_position` values and exact HTTPS image rendition URL text after capability-bound membership revalidation, without product-semantic interpretation. The build-time-only reconciled source `art_variations` arrays are retained exactly and aggregate-pinned without interpretation; the observed suffix/foiling correspondence is defined in [card snapshot reconciliation](docs/rules-and-collation.md#card-snapshot-reconciliation). The exact private-recipe identity join first selects the exact collector and then requires exact equality with a name derived from the pinned official bare name plus its exact card-level pitch (`1` → `(red)`, `2` → `(yellow)`, `3` → `(blue)`, empty pitch → bare name). It never rewrites or normalizes the recipe string. The corrected exact-name derivation establishes the real 209/51 identity partition. `unmapped` means only absent from this community recipe and is not `excluded` or evidence of non-draftability. The mapped-only rarity machinery retains observed cross-source metadata without assigning slot, treatment, or draftability semantics; its exact scope and aggregates are defined in [card snapshot reconciliation](docs/rules-and-collation.md#card-snapshot-reconciliation), and the real result remains captain-acceptance-pending. Recipe pool references now resolve only through verified same-source ownership to accepted draftable official identities; Rainbow Foil pool membership remains uninterpreted recipe membership. Completed weighted layouts preserve exact source order and multiplicity plus recipe-structural common-rarity, fixed-rare, rare-or-majestic, and rainbow-foil roles while referencing those exact opaque pool facts; these recipe-structural roles do not choose cards, represent physical slots, or reinterpret Rainbow Foil membership as an official RF form. The completed build-time collation-weight compiler consumes only those exact opaque layout and pool capabilities and retains their references, source order, positive safe-integer weights, cumulative exclusive ends, and scoped totals. Exact bounded-ticket lookup consumes only that registered capability and returns its immutable layout or exact named-pool identity reference; it remains captain-acceptance-pending. One-sample composition now binds the engine's unbiased uint32 mapper to the exact selected layout or pool total, propagates retry without lookup or fallback, and otherwise returns only the immutable capability-owned reference; its real four-source result remains captain-acceptance-pending. A registered immutable pack-local draw-state transition now starts fresh from all 11 registered pool tables and removes an exact capability-owned identity from only its selected pool, preserving source order and weights while recompiling cumulative ends and the scoped total; its real four-source result remains captain-acceptance-pending. Dynamic bounded-ticket lookup now selects one remaining capability-owned identity from that exact state and pool only; its real four-source result remains captain-acceptance-pending. One uint32 sample now composes with that exact current state and pool into immutable retry-or-atomic same-pool selection-and-removal; its real four-source result remains captain-acceptance-pending. One accepted layout sample now binds that exact layout to one fresh immutable all-11-pool plan with cursor zero; one finite caller-supplied uint32 batch now composes only the engine batch mapper, exact capability-bound layout ticket lookup, and that same registration into immutable need-more-or-plan output with the exact consumed count. One finite batch can then transition exactly the plan's current recipe-structural position and one identity draw, returning need-more with no effects or a new immutable plan after exact current-state ticket selection, exact same-pool removal, cursor +1, and an exact immutable appended record retaining those same position and official-identity references. Prior records retain source order and reference identity, fresh plans start with independently owned empty histories, and terminal plans retain exactly 14 records; its real four-source result remains captain-acceptance-pending. A collation plan is not a pack, recipe-structural positions are not physical slots, and it does not select presentation, treatment, instances, or runtime behavior. Separately, complete construction now consumes finite caller batches through all 14 positions and permits legal normal/Rainbow-Foil overlap without a policy switch or deduplication; PR 66 is its durable private acceptance authority. The deterministic source owns replay-only seed/state and bounded retry transcripts, never production entropy. Suffix/treatment/art/face/URL semantics, physical-slot classification, printing/treatment selection, generated/versioned snapshots, image accessibility identity, rear markers, card instances, runtime pools/collation, simulation, and room integration remain future work. The partial product-policy eligibility fact does not resolve treatment or slot semantics. Draft-04 validation, OMN source projection, official/upstream identity reconciliation, recipe rarity correspondence, suffix correspondence, official face projection, MV-only face/row multiplicity reconciliation, and bounded-ticket selection are explicit build-time tooling: import `validateFabEnglishCardDataAgainstSchema`, `projectSchemaValidatedFabEnglishCardDataForOmn`, `reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData`, `reconcileOmensRecipeCustomCardsWithOfficialUpstreamIdentities`, `reconcileOmensRecipeRaritiesWithOfficialUpstreamPrintings`, `classifyOmensOfficialDraftEligibility`, `resolveOmensRecipePoolsToDraftableOfficialIdentities`, `resolveOmensRecipeLayoutsToOfficialIdentityPools`, `compileOmensCollationWeightTables`, `selectOmensCollationLayoutByTicket`, `selectOmensCollationPoolOfficialIdentityByTicket`, `selectOmensCollationLayoutFromOneUnsigned32Sample`, `selectOmensCollationPoolOfficialIdentityFromOneUnsigned32Sample`, `initializeOmensPackLocalPoolDrawState`, `removeOmensPackLocalPoolOfficialIdentity`, `selectOmensPackLocalPoolOfficialIdentityByTicket`, `selectOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample`, `drawOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample`, `initializeOmensPackCollationPlanFromOneUnsigned32Sample`, `initializeOmensPackCollationPlanFromUnsigned32SampleBatch`, `transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatch`, `readOmensPackCollationPlanLayoutForTransition`, `readOmensPackCollationPlanNextPositionForTransition`, `readOmensPackCollationPlanPoolDrawStateForTransition`, `classifyOfficialCardVaultSuffixFoiling`, `projectOfficialCardVaultFaceMetadata`, and `reconcileOfficialCardVaultFacePrintingMultiplicity` from `@draft-table/set-omens/schema-validation`. That subpath requires the package-local Ajv development dependencies and may fail when they are unavailable; the normal `@draft-table/set-omens` root does not load them.

Pull requests and pushes to `main` install with `npm ci` and run every quality command listed above. The root `npm run size` contract reports completed `apps/web/dist` bytes and rejects missing output; it has no client-size ceiling or size gate. The server boundary is not emitted yet and reports as zero bytes.

Open `apps/web/dist/index.html` in a browser after `npm run build`. The accessible, dependency-free static page uses only synthetic `Fixture A` through `Fixture I` cards: three deterministic invented packs for each of two fixture seats. Each native card button click or standard Enter/Space activation records one card in the ordered pool, removes that pack, and advances; captured pack indices reject stale/repeated activation, six selections complete the walkthrough, focus moves to the live completion status, and reload resets it. Labelled regions/lists, high-contrast focus, a one-column phone layout, and reduced-motion behavior are retained.

Readable sources remain `apps/web/index.html`, `main.js`, and `styles.css`. The deterministic build emits uncommitted `dist/index.html` with application script inlined and copies `dist/styles.css`; tests cover repeatable output and cleanup. `npm run size` measures only those completed artifacts, rejects either missing artifact, and intentionally imposes no client ceiling or size gate. The removed 2,048-byte cap had forced accessibility and responsive declarations out and must not return. The shell has no card evidence, engine/set runtime, entropy, networking, authentication, multiplayer authority, or real product treatments. It is fixture-only and awaits a reviewed engine/`set-omens` runtime boundary; real playability must expose 14 visible cards from a conceptual 16-position pack after removing two opaque rear markers.

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
