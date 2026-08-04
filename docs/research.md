# External research and approved evidence

**Research date:** 2026-08-03. External services and free-tier terms can change; re-run the validation gates before implementation and release. Citation IDs used throughout `docs/` resolve in the [source register](#source-register).

## Card-data source evaluation

### Preferred source: the-fab-cube/flesh-and-blood-cards

Use a pinned release of [`the-fab-cube/flesh-and-blood-cards`](https://github.com/the-fab-cube/flesh-and-blood-cards) as the future import source, then commit only a reviewed Omens snapshot.

Why it is the best fit [DATA-1][DATA-2][DATA-3]:

- standalone JSON and CSV rather than a required runtime service;
- stable generated IDs for identities and printings;
- card rules text, type/class/talent, pitch/cost/power/defense, format legality, references, and double-sided-card links;
- per-printing set ID, rarity, edition, foiling, art treatment, `expansion_slot`, artist, remote official image URL, and optional TCGplayer metadata;
- published JSON Schemas and semantic-versioned release tags;
- direct raw-file URLs make a build-time, checksum-pinned import possible with no production API dependency.

Recommended inputs are the tagged English `json/english/card.json`, `set.json`, schemas, and official Card Vault product membership—not `develop` and not a live fetch at application runtime. The build-time boundary checksum-pins that card input and `json-schema/card-schema.json` to one immutable v8.2.0 commit; it does not yet decode or validate either input. v8.2.0 was published 2026-06-30 and includes Omens; observed development commits continued through 2026-08-03 [DATA-4]. The project warns that past releases are not back-patched and recommends pinning a tag [DATA-2].

Observed Omens coverage at v8.2.0:

- 251 `OMN` collector IDs;
- 482 OMN printing/treatment records;
- zero missing image URLs among those records;
- image host `legendstory-production-s3-public.s3.amazonaws.com`;
- foiling and identity are separate, although many Rainbow Foils reuse the standard image URL, so treatment metadata—not URL shape—must drive the UI.

Material gaps:

1. No formal `LICENSE` file and GitHub reports no detected license. The README calls the resource open source and invites broad use, but that is not a standard license grant. The captain accepted proceeding under the currently published source terms without requiring separate written confirmation; the snapshot phase must still minimize redistribution, preserve provenance, and re-review any terms drift.
2. No booster slot weights, sheet/run ordering, or pack generator.
3. `expansion_slot` is printing metadata, not complete product-membership/collation evidence.
4. The official Card Vault product list includes nine `IAR` Marvel entries not found by filtering upstream records to `set_id=OMN` [FAB-7].
5. Raw GitHub/CDN files have no availability or compatibility SLA.

### Alternative: fabrary/cards npm API

[`fabrary/cards`](https://github.com/fabrary/cards) publishes `@flesh-and-blood/cards` and typed helpers [DATA-5]. It is current and convenient for TypeScript, carries printings/images/foiling/expansion metadata, and its package metadata declares MIT. It is not preferred for the MVP snapshot because:

- its generated all-card export is documented at about 12 MB;
- it transforms the preferred dataset and adds derived/override behavior, increasing the reconciliation surface;
- the repository has no root license file even though package metadata says MIT;
- it still cannot supply booster collation.

It is useful as a comparison oracle in import tests, not as a browser runtime dependency.

### Official comparison source

The public Card Vault endpoint [FAB-7] is authoritative evidence for current product membership and official image renditions. It currently returns 260 Omens product entries and permissive CORS, but no reviewed terms promise a stable public API. Treat it as a build-time validation source with recorded response checksums, not a production dependency or unsupported write endpoint.

### Proposed versioned import boundary

A future `SetImporter` consumes immutable source documents and emits a set-specific snapshot with a schema version, source versions/checksums, identities, physical treatments, slot eligibility, image URLs, Fabrary IDs, and explicit inclusion/exclusion evidence. The platform-independent engine consumes only that snapshot. Adding a set means adding evidence and an adapter invocation, not subclassing the engine.

## Captain-approved community collation evidence

The captain downloaded `OMN_Draft_3.8 - Fixed New Layout Probabilities.txt` from the Rantaways server, which the captain records as widely used by players to practice draft, and expressly approved it as the MVP recipe [COMMUNITY-1]. This provenance is community evidence, not an LSS statement. The source remains outside the repository; the [README](../README.md) owns the current implementation scope.

Independent planning analysis confirmed the exact SHA-256, file format, all 228 weighted 14-card layouts, total layout weight 460,800, 209-card pool structure and internal totals, and the 70.833333%/29.166667% Rare/Majestic and 83%/15%/2% Rainbow Foil headline probabilities. The complete accepted fixture and future strict-parser contract are in [rules-and-collation.md](rules-and-collation.md#captain-approved-community-mvp-recipe).

The recipe represents the 14 cards its simulator displays. It does not publish named/weighted rear-card outcomes or prove factory print runs. Draft Table therefore preserves the official conceptual 16-position pack and rear-two removal with opaque excluded rear markers rather than inventing those missing probabilities.

## Image hosting implications

Card images remain remote and are never copied into the repository. The preferred dataset points at Legend Story Studios' public S3 host [DATA-1]. Consequences:

- no repository/deployment image-storage footprint;
- image host receives the viewer's network request and can observe IP/headers;
- URLs may change, throttle, or disappear without an API SLA;
- availability must not affect server authority—name/treatment text remains usable if an image fails;
- use `Referrer-Policy: no-referrer`, explicit `img-src`, lazy loading, dimensions/aspect ratio, and a non-image accessible name;
- do not proxy, transform, or persist images in Cloudflare storage without a separate rights and cost review.

## Legend Story Studios image and app terms

The current LSS asset terms state [FAB-6]:

- all cards, art, logos, and website assets remain LSS property;
- card images may be used for card databases/platforms and related content under non-exclusive, revocable permission;
- direct platform monetization requires express permission; indirect monetization is separately described;
- every use of card images requires `© Legend Story Studios`;
- third-party service/rules apps and related APIs may be created subject to the document, must carry its specified non-affiliation/property disclaimer, cannot be directly monetized without permission, and may not be created by a commercial entity;
- FAB/LSS logos must not be used in third-party applications and passing off is prohibited.

Draft Table therefore uses no FAB/LSS/set logos or copied trade dress, includes the full concise disclaimer in the README and product footer, is free, and treats these permissions as revocable. Public self-hosters remain responsible for their own compliance. The captain accepted proceeding under these currently published terms without requiring separate written confirmation; any material terms change reopens the launch review.

## Fabrary export/import research

### Current supported UI

The public Fabrary deck page exposes `Create` and `Import` tabs, with sign-in required to save a deck [FABR-1]. Its current deployed public client implements the import route [FABR-2]:

- `https://fabrary.net/decks?tab=import`
- repeated/comma-separated `cards` query values;
- optional `format` and `name` query values;
- six-character set printing IDs (for example `OMN134`) or Fabrary card identifiers;
- Draft-specific hero inference and basic weapon assistance when possible.

Recommended primary link:

```text
https://fabrary.net/decks?tab=import&format=Draft&name=<encoded>&cards=<comma-separated-print-ids>
```

Use one occurrence per drafted physical copy. Normal/Rainbow treatments intentionally collapse to shared card identity/count for deckbuilding. This opens a pre-populated import form; the user may need to sign in and select/correct a hero before importing. It is not an API that Draft Table can use to create a deck on the user's behalf.

The query behavior is public client behavior but is not a versioned/documented Fabrary API. Add a browser contract check before every release and fall back immediately if it changes. Do not call the authenticated GraphQL mutations visible in the client bundle; they are private implementation endpoints and require Fabrary authentication.

### Accepted text fallback

The same public client currently parses Fabrary's own copied-list form [FABR-2]:

```text
Name: Draft Table – Omens pool
Format: Draft

Deck cards
2x Aethersling (red)
1x <Card name> (yellow)
```

It also accepts plain non-empty lines of `quantity card name`, but the native headers plus `Nx Name (red|yellow|blue)` are less ambiguous. If no hero can be inferred, Fabrary's import UI supplies hero selection. Fallback behavior is one reliable two-action path: `Copy Fabrary list`, then open the public Import tab. Clipboard failure reveals a selectable text area.

No supported public endpoint or documented URL was found that creates a saved Fabrary deck without user authentication/confirmation.

## Cloudflare research conclusion

The smallest current-free architecture is one Worker deployment serving free static assets and routing dynamic room/WebSocket traffic to one SQLite-backed Durable Object per room. No Pages project, D1, KV, R2, Queue, paid service, or image proxy is required. Free-tier evidence, arithmetic, and failure thresholds are in [architecture.md](architecture.md).

## Source register

All sources were accessed **2026-08-03** unless noted. Claims above are limited to the evidence described; missing evidence is not inferred.

### Official Flesh and Blood

- **[FAB-1]** [TRP §8, Limited Formats](https://rules.fabtcg.com/en/trp/08-limited-formats/) — current official draft pool, three-pack procedure, left/right/left passing, review restrictions, and official/non-called draft distinctions.
- **[FAB-2]** [TRP Appendix A.3 and A.7](https://rules.fabtcg.com/en/trp/appendix/) — called-pick schedule, one-minute review, Omens' 14 limited cards, extra-card categories, and Omens of Arcana limited rule.
- **[FAB-3]** [Omens product page](https://fabtcg.com/products/booster-set/omen/) — June 5 product information; 251 cards, 16 cards/pack, 24 packs/display, slot distribution, Cold Foil approximate frequency, and production-average disclaimer. WordPress product record modified 2026-05-29.
- **[FAB-4]** [Omens Pre-Release Guide](https://fabtcg.com/articles/omens-of-the-third-age-pre-release-guide/) — May 29–June 4 events; eight packs; remove the last two cards; enumerated rear outcomes; exactly 30-card sealed deck. Article published 2026-05-26, modified 2026-07-20.
- **[FAB-5]** [Card Legality Policy](https://fabtcg.com/rules-and-policy-center/card-legality-policy/) — new cards become legal on product release date; current format legality source.
- **[FAB-6]** [Terms of Use for Game and Studio Assets and IP](https://fabtcg.com/resources/terms-use-licensed-assets/) — card-image, logo, asset, third-party-app, disclaimer, monetization, revocation, and commercial-entity terms.
- **[FAB-7]** [Official Card Vault Omens product endpoint](https://api.cardvault.fabtcg.com/carddb/api/v1/product-cards/omens-of-the-third-age/) — release date 2026-06-05, 260 current product entries, image URLs, and the nine `IAR` entries. Endpoint returned `Access-Control-Allow-Origin: *`; no stability promise was found.

### Open card data

- **[DATA-1]** [`the-fab-cube/flesh-and-blood-cards`](https://github.com/the-fab-cube/flesh-and-blood-cards) at release [`v8.2.0`](https://github.com/the-fab-cube/flesh-and-blood-cards/releases/tag/v8.2.0) — JSON/CSV card/printing data inspected for OMN coverage, treatments, expansion flags, and image hosts.
- **[DATA-2]** [Upstream README at v8.2.0](https://github.com/the-fab-cube/flesh-and-blood-cards/blob/v8.2.0/README.md) — intended use, stable IDs, semantic version policy, tag-pinning guidance, and no back-patching promise.
- **[DATA-3]** [Card JSON Schema at v8.2.0](https://github.com/the-fab-cube/flesh-and-blood-cards/blob/v8.2.0/json-schema/card-schema.json) and [schema index](https://github.com/the-fab-cube/flesh-and-blood-cards/blob/v8.2.0/documentation/json-schemas.md) — schema capability. Repository and GitHub metadata had no formal license file/detected license.
- **[DATA-4]** [Upstream releases](https://github.com/the-fab-cube/flesh-and-blood-cards/releases) and [commit history](https://github.com/the-fab-cube/flesh-and-blood-cards/commits/develop/) — v8.0.0 (2025-06-27), v8.1.0 (2025-10-08), v8.2.0 (2026-06-30), plus active spoiler/fix commits observed through 2026-08-03.
- **[DATA-5]** [`fabrary/cards`](https://github.com/fabrary/cards), package [`@flesh-and-blood/cards`](https://www.npmjs.com/package/@flesh-and-blood/cards) — typed transformed dataset, documented ~12 MB generated export, MIT package metadata, printing/image fields, and active v4.0.49 update observed 2026-08-01.

### Captain-approved community evidence

- **[COMMUNITY-1]** Captain-held `OMN_Draft_3.8 - Fixed New Layout Probabilities.txt`, downloaded by the captain from the Rantaways server and approved 2026-08-03 as the community MVP recipe. Independently inspected as a 120,617-byte UTF-8-BOM/CRLF sectioned file with SHA-256 `97a964c8c5b6a962404398ca2b57c9ceeeb2dfb714512e61ff22e07ea1ec2328`. It is not an official LSS publication and remains intentionally uncommitted pending the required provenance and licensing review.

### Fabrary

- **[FABR-1]** [Fabrary Import tab](https://fabrary.net/decks?tab=import) — public import UI and sign-in requirement.
- **[FABR-2]** Public client asset loaded by that route on access date, [`index-D1yt-_jf.js`](https://fabrary.net/assets/index-D1yt-_jf.js) — current parser accepted `Name:`, `Hero:`, `Format:`, `Nx Name (pitch)` lists and parsed `cards`, `format`, and `name` URL parameters. The content-hashed URL is evidence of current behavior, not a stable API contract.

### Cloudflare

- **[CF-1]** [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) — 100,000 requests/day, 10 ms CPU, 128 MB isolate memory, subrequests, code/asset limits. Page updated 2026-07-28.
- **[CF-2]** [Workers Static Assets billing and limitations](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) — asset requests free/unlimited and no asset-storage charge. Updated 2026-04-23.
- **[CF-3]** [Pages limits](https://developers.cloudflare.com/pages/platform/limits/) — 500 builds/month, 20,000 files, 25 MiB/file, Functions count as Workers usage. Updated 2026-07-16.
- **[CF-4]** [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) — Free availability/SQLite-only rule; 100,000 requests and 13,000 GB-s/day; 20:1 incoming WebSocket billing ratio; outgoing messages free; 5M rows read, 100,000 rows written/day, and 5 GB storage. Updated 2026-06-19.
- **[CF-5]** [Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/) — unlimited objects, 1 GB per Free object (5 GB account), 32 MiB incoming WebSocket message, 1,000 requests/s soft object limit, CPU/storage limits. Updated 2026-06-01.
- **[CF-6]** [Durable Object WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) — hibernation behavior, thousands of clients per instance, attachments, automatic ping/pong, batching, and deploy disconnects. Updated 2026-06-19.
- **[CF-7]** [Durable Object alarms](https://developers.cloudflare.com/durable-objects/api/alarms/) — one alarm/object, at-least-once delivery, retry/backoff, scheduling multiple logical events, and storage semantics. Updated 2026-04-21.
- **[CF-8]** [Durable Object lifecycle](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/) — hibernation after idle, in-memory reset, storage requirement, eligibility conditions, duration states, and restart/disconnect behavior.
