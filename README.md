# Draft Table

Draft Table is a planned public, free-to-host multiplayer draft simulator for Flesh and Blood. The MVP is scoped to **Omens of the Third Age**, with 2–8 human drafters and up to 16 total room participants including spectators.

> **Status: walking skeleton implementation begun.** Phase 2 checksum verification plus strict Settings-envelope, CustomCards-schema, indentation-sensitive Layouts-schema parsing, pinned Layouts aggregate fixtures, and strict immutable pool-section schema parsing with pinned pool aggregates are implemented, including exact Layout-to-pool and pool-to-CustomCards reference resolution. The public v8.2.0 English `card.json` input and card schema are checksum-pinned and receive strict build-time JSON encoding/envelope, duplicate-key, root-shape, and full pinned Draft-04 schema conformance validation; the build-time-only schema-validation entry point now projects exact source-order `set_id === "OMN"` card identities and printings (251 records, 482 rows, 251 distinct collector IDs). The dated 2026-08-04 official Card Vault response remains checksum-pinned as historical build-time evidence; a separate strict build-time entry point derives and canonically pins its official membership (260 IDs: 251 `OMN`, 9 `IAR`) without retaining response bytes or IDs in the repository. Official identity/base reconciliation is complete; name and suffix/treatment/image/slot/exclusion semantics, generated snapshots, and runtime behavior remain unimplemented. Normal-pool partition, Rainbow Foil subset coverage, all-pinned-pools-used validation, recipe rarity semantics, the six exact outcome coefficients, 11C + 1R + 1R/M + 1RF slot structure, and exact derived rational fixtures are enforced. Random generation, rear-slot wrapping, cross-source treatment classification, private-recipe reconciliation, import, and snapshots remain unimplemented. The repository otherwise contains only a neutral browser shell and workspace boundaries. Draft behavior, rooms, networking, deployment, Fabrary integration, and product UI have not begun.

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

Neither evidence command commits or configures its input files. Keep the evidence bytes outside Git pending later provenance and human review. The unversioned Card Vault endpoint is never fetched at runtime. Its immutable 2026-08-04 raw-response checksum descriptor is dated historical evidence, not a retrievable API version pin: it must not reject a future cosmetically changed response when strict canonical official membership remains identical. The build-time `validateCardVaultOmensOfficialMembership` entry point derives that membership from caller-provided bytes and pins canonical sorted print-ID membership facts rather than raw serialization. The validated official membership now also has a build-time syntax/marker-form classifier; all 260 validated exact bases are joined to pinned upstream identities and all matching `OMN` and `IAR` printing rows. This identity join is not treatment classification: name and suffix/treatment/image/slot/exclusion semantics remain unclassified, as do all 209 private-recipe names and collector IDs. Draft-04 validation, OMN source projection, and official/upstream identity reconciliation are explicit build-time tooling: import `validateFabEnglishCardDataAgainstSchema`, `projectSchemaValidatedFabEnglishCardDataForOmn`, and `reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData` from `@draft-table/set-omens/schema-validation`. That subpath requires the package-local Ajv development dependencies and may fail when they are unavailable; the normal `@draft-table/set-omens` root does not load them.

Pull requests and pushes to `main` install with `npm ci` and run every quality command listed above. `npm run size` enforces a 2,048-byte total emitted-client ceiling; the server boundary is not emitted yet and reports as zero bytes.

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
