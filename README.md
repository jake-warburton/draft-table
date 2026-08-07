# Draft Table

Draft Table is a planned public, free-to-host multiplayer draft simulator for Flesh and Blood. The MVP is scoped to **Omens of the Third Age**, with 2–8 human drafters and up to 16 total room participants including spectators.

> **Status: walking skeleton implementation begun.** The checksum-pinned Omens build-time evidence and capability pipeline are implemented through 14-position collation plans; detailed evidence scope and captain-pending four-source measurements live in [card snapshot reconciliation](docs/rules-and-collation.md#card-snapshot-reconciliation). Complete 14-position identity-only pack construction is also implemented with finite caller-provided batches, immutable continuation/history/pool state, and no entropy ownership. Same official identities may legally occur in normal and Rainbow Foil positions; treatment distinguishes printings, while pitch variants are distinct identities. The structural evidence guard proves the eight normal pools are pairwise disjoint (209 identities), the three Rainbow Foil pools are pairwise disjoint (171 identities), and the latter are a strict normal-pool subset. Private four-source pack acceptance was accepted by the captain on PR 66: comment-recorded 20/20 acceptance and green CI for exact head `aa825b18b5c455d253af9c0c45842b0b21a4d4bd`, merged 2026-08-05T17:06:39Z (squash `bfda2d97104312d4276523ff23f683b296747b22`). Same-account GitHub approval is mechanically unavailable; the captain comment and merge are the durable authority.
>
> `packages/engine` provides the deterministic replay-only `pcg-xsh-rr-64-32-v1` source and bounded retry transcript; it is non-cryptographic and observed output may allow state reconstruction. It is not a competitive-multiplayer unpredictability guarantee. Production source custody, stream separation, and any cryptographic source remain a later architecture decision. `packages/draft` now provides dependency-free, pure, immutable, serializable draft transitions (including provisional barriers, timeout fallback, bots, passing, presence, and idempotent requeue); integration authority remains outside it.
>
> `packages/set-omens` also has a build-time, source-attributed, capability-bound card-presentation projection. It makes no printing, face, treatment, rear, instance, or collation choice and has no runtime fetch or client API. The conceptual physical booster remains 16 positions: it wraps the complete 14-card recipe layout with two opaque rear markers and removes those markers before visibility. Visible packs always start at **14**, and timing counts down 14, 13, 12, …; the subtraction never makes a 12-card recipe layout.
>
> `apps/web` is a readable, dependency-free single-player draft client dealing **real Omens cards**. It runs the real `packages/draft` transitions and the real `packages/engine` unbiased mapper in the browser: eight seats (you plus seven bots), three rounds of fourteen-card packs, thirteen choices per round, left/right/left passing, and a forty-two-card pool. Cards come from the reviewed set snapshot (`@draft-table/set-omens/snapshot`), and packs are collated the reviewed way: one weighted layout is chosen from the exact source-order weights, then each position draws a weighted identity from that position's pool without replacement within that pool. Cross-pool normal/Rainbow-Foil overlap stays legal and is never deduplicated. The snapshot carries card names, pitch, rarity, and each identity's official card image URL: **no image bytes and no upstream bytes are copied into this repository**. Art is requested by the browser straight from Legend Story Studios' own public host, pinned to that single origin by the page's content security policy, sent with no referrer, loaded lazily, and replaced by the card's name if it fails. The client opens no connection of its own. The browser owns entropy through `crypto.getRandomValues`; no transition generates its own randomness. `npm run size` reports completed `apps/web/dist` bytes and rejects missing output; there is no client byte ceiling, `clientCeiling`, size gate, or retained minifier cap. The removed cap had forced accessibility and responsive declarations out, so a budget cannot decide product quality accidentally. Multiplayer rooms, networking, deployment, and timers have not begun; room codes are the first piece of that work.

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

## Room codes

`packages/contracts` owns the shared shapes both the browser and the room server need. The first is the room code: eight Crockford-Base32 symbols carrying exactly forty random bits.

Five entropy bytes become eight five-bit symbols with nothing left over, so the mapping is a bijection — every code is exactly as likely as every other, and no rejection sampling is involved. Entropy is caller-supplied, the same way the draft engine works, and a source that returns anything other than exactly five bytes is refused rather than padded or retried.

Reading a code follows Crockford's own rules, because people retype these from a phone screen: case is ignored, `I` and `L` read as `1`, `O` reads as `0`, and hyphens added for readability are dropped. `U` is excluded from the alphabet rather than aliased, so it is refused.

A code is an unlisted address, not authorization, and a refusal never echoes the rejected text back into a message, log, or stack trace.

## Room routes

`apps/server` is the Cloudflare Worker. It has exactly two dynamic routes, and everything else a browser asks for is a static asset:

- `POST /api/rooms` — mint a code and initialize one room under it.
- `GET /api/rooms/<code>/socket` with `Upgrade: websocket` — open a socket into that room.

The router is deliberately thin. It mints and reads codes and then gets out of the way: room state, passwords, identity credentials, and every rule of the draft belong to the room object rather than to the Worker.

What it does own is turning away traffic a room object should never have to see, because a bad request forwarded to an object spends two of the day's requests instead of one. It refuses a request that did not come from this origin, including one that names no origin at all, a method the route does not have, a content type it does not speak, a body over 4 KiB whether the length is declared, understated, or never declared at all, anything that is not one JSON object, a socket request that is not an upgrade, and a code that could never have been minted. Only the room object can say a code is already *taken*, because only the object is serialized; the Worker's part is to mint another and to give up after a few attempts rather than spin.

Two habits run all the way through it. A refusal never repeats the request back — a create body may carry a room password and a code is an unlisted address, so neither reaches a response body, a header, or a status line. And a socket upgrade is forwarded exactly as it arrived rather than rebuilt, because an upgrade does not survive being rebuilt; the object learns its own code when it is initialized and never needs it handed back.

Not there yet: the room object itself, the per-room and per-network rate limits [security and privacy](docs/security-and-privacy.md#room-codes-and-abuse) calls for, and the optional `GET /api/health`. The router refuses malformed traffic cheaply, but it does not yet refuse repeated traffic.

## Reading your drafted pool

The pool starts in collector order and can be regrouped without changing it. Buttons offer **Set number**, **Class**, **Colour**, and **Type**; cards stay in collector order inside every group, empty groups are left out, and each heading carries its own count.

Grouping is presentation only — `apps/web/src/pool.ts` is pure, never drops or duplicates a card, and a test proves every grouping returns the same pool it was given. Class grouping names its class-less bucket **No class** rather than inventing one: 60 of the 209 identities carry the Lightning talent and no class of their own.

The table lays the pack out five cards to a row, so a fresh fourteen-card pack reads as three rows of five, five, and four. Drafted cards stack into one pile per group: each card overlaps all but the top tenth of the one before it, so the pile reads as a run of name bars, and the newest card sits on top of the pile in full. A card whose art fails keeps its place in the pile and shows its name as text instead.

## Handing your pool to Fabrary

When the draft finishes, the page offers two ways into [Fabrary](https://fabrary.net):

- **A pre-filled import link** — `https://fabrary.net/decks?tab=import&format=Draft&name=…&cards=…`, carrying one collector identifier per physical copy.
- **A copyable text list** in the form Fabrary's own import tab already parses, plus a plain link to that tab.

The fallback is not optional. Fabrary's import query is public client behaviour rather than a documented API, and a signed-out visitor is shown a sign-in wall rather than the import form, so the copyable list is the path that always works. DT-7 in [risks and decisions](docs/risks-and-decisions.md) owns that boundary.

Draft Table never signs you in, never chooses your hero, never creates a deck on your behalf, and never calls Fabrary's private authenticated endpoints. `apps/web/src/fabrary.ts` is pure: it builds a link and a string, and opens no connection. Normal and Rainbow Foil copies of one card collapse to a single counted entry, because deckbuilding treats them alike.

## Copied card images

`scripts/migrate-card-images.mjs` copies the official card art into Draft Table's own storage so it can be served from Draft Table's own host rather than sending every viewer's browser to Legend Story Studios' bucket. That reversal, and what it obliges, is recorded as DT-9 in [risks and decisions](docs/risks-and-decisions.md).

```
npm run migrate:card-images   # copy anything not already held, then rewrite the manifest
npm run verify:card-images    # re-hash every local copy against the manifest; no network
```

The reviewed snapshot is the only thing that decides which images exist and where each one lives. The utility invents no URL, refuses any source that is not on the pinned official origin, refuses a collector identifier that could escape the output directory, follows no redirect, and stores nothing it has not first proven to be a real WebP served as one — so an error page can never be stored under a card's name and served as its art.

`apps/server/card-image-manifest.json` is committed and records each image's source, sha256, and byte length. The images themselves live in `apps/server/card-images/` and are gitignored: **no image byte is ever committed to this repository.** A second run refetches only what is missing, and a local file that no longer matches its recorded digest stops the run rather than being silently replaced.

The utility copies locally and uploads nothing. Publishing to the serving host is a separate, deliberate step.

## Reviewed set snapshot

`packages/set-omens/src/set-snapshot.generated.ts` is the reviewed, versioned Omens set snapshot: the only card material the runtime ever sees. It holds the 209 draftable identities (official base collector id, official bare name, pitch, rarity, official image URL, and the exact upstream type tokens), the 11 weighted pools, and the 228 weighted 14-position layouts totalling 460,800. Upstream mixes class, talent, type, and subtype into one token list, so the validator derives each identity's `cardType` and `cardClass` from those tokens rather than reading them from the data — the two cannot disagree, and an unreviewed token refuses to load instead of being silently misread. Each image URL is copied from that identity's own Card Vault face; `OMENS_SNAPSHOT_IMAGE_ORIGIN` pins the single origin art may be served from, and the validator refuses any image that is not that identity's own rendition on it. It carries no recipe text and no upstream byte, and tests assert both.

The snapshot is generated at build time from all four checksum-pinned evidence sources and committed, so neither CI nor the browser needs the captain-held recipe. `packages/set-omens/src/set-snapshot.ts` owns the shape and a complete validator, which the generated module runs at load: an edit that breaks any structural invariant throws rather than shipping. Ordinary tests re-prove the accepted aggregates without any evidence file, including that the eight normal pools are pairwise disjoint over all 209 identities, that the three Rainbow Foil pools are a strict 171-identity subset, that every identity agrees with its own pool's rarity, and that every layout position draws from a pool its role permits.

Regenerate it with all four sources:

```sh
OMENS_RECIPE_EVIDENCE_PATH=<path-to-private-recipe> \
FAB_CARD_SOURCE_EVIDENCE_PATH=<path-to-card.json> \
FAB_CARD_SCHEMA_EVIDENCE_PATH=<path-to-card-schema.json> \
FAB_CARD_VAULT_EVIDENCE_PATH=<path-to-observed-card-vault-response.json> \
npm --silent --workspace @draft-table/set-omens run build:set-snapshot
```

CI cannot prove the committed file still matches the evidence, because it never holds the recipe. Anyone who does hold all four sources can, with the same four inputs:

```sh
npm --silent --workspace @draft-table/set-omens run test:set-snapshot-evidence
```

Success prints only `set snapshot acceptance passed`. It regenerates into a temporary file and compares byte for byte with the committed snapshot.

For the separate build-time card presentation projection, run the three checksum-pinned public inputs through its command:

```sh
FAB_CARD_SOURCE_EVIDENCE_PATH=<path-to-card.json> \
FAB_CARD_SCHEMA_EVIDENCE_PATH=<path-to-card-schema.json> \
FAB_CARD_VAULT_EVIDENCE_PATH=<path-to-observed-card-vault-response.json> \
npm --silent --workspace @draft-table/set-omens run test:card-presentation-evidence
```

Success prints only `card presentation acceptance passed`. The command verifies the public sources before projecting one exact caller-selected identity, printing, and face; it does not perform those selections or provide runtime presentation. Private four-source acceptance passed on PR 63: captain comment records 19/19 acceptance commands, both named `defineProperty` live-global-substitution contracts failing, all five stored exploits defeated, and green CI for exact head `4dbef5dd63c7e655f2cf9b4674d4238b0f1cac4b`, merged 2026-08-05T16:46:59Z (squash `34e81f3cf54e853ce8c07b9b4606416481a86ffa`).

None of the evidence commands commits or configures its input files. Keep the evidence bytes outside Git pending later provenance and human review. The unversioned Card Vault endpoint is never fetched at runtime. Its immutable 2026-08-04 raw-response checksum descriptor is dated historical evidence, not a retrievable API version pin: it must not reject a future cosmetically changed response when strict canonical official membership remains identical. The build-time `validateCardVaultOmensOfficialMembership` entry point derives that membership from caller-provided bytes and pins canonical sorted print-ID membership facts rather than raw serialization. The validated official membership now also has a build-time syntax/marker-form classifier; all 260 validated exact bases are joined to pinned upstream identities and all matching `OMN` and `IAR` printing rows. Its Card Vault face records retain only exact ordered `layout_position` values and exact HTTPS image rendition URL text after capability-bound membership revalidation, without product-semantic interpretation. The build-time-only reconciled source `art_variations` arrays are retained exactly and aggregate-pinned without interpretation; the observed suffix/foiling correspondence is defined in [card snapshot reconciliation](docs/rules-and-collation.md#card-snapshot-reconciliation). The exact private-recipe identity join first selects the exact collector and then requires exact equality with a name derived from the pinned official bare name plus its exact card-level pitch (`1` → `(red)`, `2` → `(yellow)`, `3` → `(blue)`, empty pitch → bare name). It never rewrites or normalizes the recipe string. The corrected exact-name derivation establishes the real 209/51 identity partition. `unmapped` means only absent from this community recipe and is not `excluded` or evidence of non-draftability. The mapped-only rarity machinery retains observed cross-source metadata without assigning slot, treatment, or draftability semantics; its exact scope and aggregates are defined in [card snapshot reconciliation](docs/rules-and-collation.md#card-snapshot-reconciliation), and the real result remains captain-acceptance-pending. Recipe pool references now resolve only through verified same-source ownership to accepted draftable official identities; Rainbow Foil pool membership remains uninterpreted recipe membership. Completed weighted layouts preserve exact source order and multiplicity plus recipe-structural common-rarity, fixed-rare, rare-or-majestic, and rainbow-foil roles while referencing those exact opaque pool facts; these recipe-structural roles do not choose cards, represent physical slots, or reinterpret Rainbow Foil membership as an official RF form. The completed build-time collation-weight compiler consumes only those exact opaque layout and pool capabilities and retains their references, source order, positive safe-integer weights, cumulative exclusive ends, and scoped totals. Exact bounded-ticket lookup consumes only that registered capability and returns its immutable layout or exact named-pool identity reference; it remains captain-acceptance-pending. One-sample composition now binds the engine's unbiased uint32 mapper to the exact selected layout or pool total, propagates retry without lookup or fallback, and otherwise returns only the immutable capability-owned reference; its real four-source result remains captain-acceptance-pending. A registered immutable pack-local draw-state transition now starts fresh from all 11 registered pool tables and removes an exact capability-owned identity from only its selected pool, preserving source order and weights while recompiling cumulative ends and the scoped total; its real four-source result remains captain-acceptance-pending. Dynamic bounded-ticket lookup now selects one remaining capability-owned identity from that exact state and pool only; its real four-source result remains captain-acceptance-pending. One uint32 sample now composes with that exact current state and pool into immutable retry-or-atomic same-pool selection-and-removal; its real four-source result remains captain-acceptance-pending. One accepted layout sample now binds that exact layout to one fresh immutable all-11-pool plan with cursor zero; one finite caller-supplied uint32 batch now composes only the engine batch mapper, exact capability-bound layout ticket lookup, and that same registration into immutable need-more-or-plan output with the exact consumed count. One finite batch can then transition exactly the plan's current recipe-structural position and one identity draw, returning need-more with no effects or a new immutable plan after exact current-state ticket selection, exact same-pool removal, cursor +1, and an exact immutable appended record retaining those same position and official-identity references. Prior records retain source order and reference identity, fresh plans start with independently owned empty histories, and terminal plans retain exactly 14 records; its real four-source result remains captain-acceptance-pending. A collation plan is not a pack, recipe-structural positions are not physical slots, and it does not select presentation, treatment, instances, or runtime behavior. Separately, complete construction now consumes finite caller batches through all 14 positions and permits legal normal/Rainbow-Foil overlap without a policy switch or deduplication; PR 66 is its durable private acceptance authority. The deterministic source owns replay-only seed/state and bounded retry transcripts, never production entropy. Suffix/treatment/art/face/URL semantics, physical-slot classification, printing/treatment selection, image accessibility identity, rear markers, card instances, simulation, and room integration remain future work. The reviewed versioned set snapshot is now generated, committed, and consumed by the browser client. The partial product-policy eligibility fact does not resolve treatment or slot semantics. Draft-04 validation, OMN source projection, official/upstream identity reconciliation, recipe rarity correspondence, suffix correspondence, official face projection, MV-only face/row multiplicity reconciliation, and bounded-ticket selection are explicit build-time tooling: import `validateFabEnglishCardDataAgainstSchema`, `projectSchemaValidatedFabEnglishCardDataForOmn`, `reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData`, `reconcileOmensRecipeCustomCardsWithOfficialUpstreamIdentities`, `reconcileOmensRecipeRaritiesWithOfficialUpstreamPrintings`, `classifyOmensOfficialDraftEligibility`, `resolveOmensRecipePoolsToDraftableOfficialIdentities`, `resolveOmensRecipeLayoutsToOfficialIdentityPools`, `compileOmensCollationWeightTables`, `selectOmensCollationLayoutByTicket`, `selectOmensCollationPoolOfficialIdentityByTicket`, `selectOmensCollationLayoutFromOneUnsigned32Sample`, `selectOmensCollationPoolOfficialIdentityFromOneUnsigned32Sample`, `initializeOmensPackLocalPoolDrawState`, `removeOmensPackLocalPoolOfficialIdentity`, `selectOmensPackLocalPoolOfficialIdentityByTicket`, `selectOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample`, `drawOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample`, `initializeOmensPackCollationPlanFromOneUnsigned32Sample`, `initializeOmensPackCollationPlanFromUnsigned32SampleBatch`, `transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatch`, `readOmensPackCollationPlanLayoutForTransition`, `readOmensPackCollationPlanNextPositionForTransition`, `readOmensPackCollationPlanPoolDrawStateForTransition`, `classifyOfficialCardVaultSuffixFoiling`, `projectOfficialCardVaultFaceMetadata`, and `reconcileOfficialCardVaultFacePrintingMultiplicity` from `@draft-table/set-omens/schema-validation`. That subpath requires the package-local Ajv development dependencies and may fail when they are unavailable; the normal `@draft-table/set-omens` root does not load them.

Pull requests and pushes to `main` install with `npm ci` and run every quality command listed above. The root `npm run size` contract reports completed `apps/web/dist` bytes and rejects missing output; it has no client-size ceiling or size gate. The server boundary is not emitted yet and reports as zero bytes.

To play the draft locally:

```sh
npm run dev
```

That builds the client and serves it at `http://127.0.0.1:8137/` (override with `PORT`). Opening `apps/web/dist/index.html` directly also works, because the whole client is inlined into one module script rather than fetched as separate files.

Every card is a real Omens card drawn through the snapshot's own collation weights. Every card button is a native control, so click and standard Enter/Space activation behave identically. Each choice queues your pick, lets every bot queue through the ordinary provisional transition, and reveals the barrier atomically; the captured round and pick reject stale activation from a superseded pack. A pack holding a single card commits automatically, so a fourteen-card pack takes thirteen explicit choices. Thirty-nine choices complete three rounds, focus moves to the live completion status, and "Deal a new draft" restarts. Labelled regions/lists, high-contrast focus, a one-column phone layout, and reduced-motion behavior are retained.

Readable sources remain `apps/web/index.html`, `apps/web/styles.css`, and the TypeScript modules under `apps/web/src`. The deterministic build transpiles the client and every workspace module it imports, then inlines them into `dist/index.html` behind a small CommonJS registry, and copies `dist/styles.css`. The registry exists because separate workspace modules legitimately declare the same private names, so flat concatenation would break them; a specifier the build cannot resolve inside the workspace fails the build rather than reaching the browser. Tests cover repeatable output, cleanup, scope isolation, and a whole draft played through the built artifact. `npm run size` measures only those completed artifacts, rejects either missing artifact, and intentionally imposes no client ceiling or size gate. The removed 2,048-byte cap had forced accessibility and responsive declarations out and must not return. The client reads the reviewed set snapshot and nothing else: no evidence bytes, no schema validation, no networking, no authentication, no multiplayer authority, no timers, no card images, and no printing or treatment selection. It shows the 14 visible cards of a conceptual 16-position pack after removing two opaque rear markers.

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
