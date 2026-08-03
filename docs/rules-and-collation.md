# Verified draft rules and booster collation

External citation IDs resolve in the [research source register](research.md#source-register). **Verified** below means supported by an official Legend Story Studios source. Anything else is labelled as a product rule, recommendation, or unknown.

## Verified draft procedure

The current Tournament Rules and Policy (TRP) specifies that Booster Draft normally uses pods of eight, three boosters per player, one card drafted per pass, and a 30-card starting deck. A limited pool may contain any number of copies of a unique card and may use any number of basic-rarity cards from the set without opening them [FAB-1]. Draft Table intentionally supports 2–8 players; 2–7 is a simulator extension, not a claim of official pod size.

The recommended procedure is [FAB-1]:

1. Remove non-draftable basic-rarity and extra cards.
2. Draft one card, place it face-down, shuffle the rest, and pass it left.
3. Review drafted cards only between packs.
4. Repeat, passing pack 1 left, pack 2 right, pack 3 left.
5. A physical pick is final once placed face-down; players may not communicate draft information or inspect pools during picks.

Draft Table's provisional selection until the server deadline is a deliberate digital product rule, not the official physical finality rule.

## Verified called-draft timing

TRP Appendix A.3 publishes the following recommended schedule and a one-minute review [FAB-2]. Omens starts at 14 visible cards, so the 15-card row is not used.

| Cards in current pack | Pick time |
|---:|---:|
| 14, 13, 12 | 50 seconds |
| 11, 10 | 40 seconds |
| 9, 8 | 30 seconds |
| 7, 6 | 20 seconds |
| 5, 4 | 10 seconds |
| 3, 2 | 5 seconds |
| 1 | Automatic; official table shows `-` |

The official caller may advance once all players have picked, but does not prescribe Draft Table's five-second change window [FAB-2]. That countdown is a product rule.

## Verified Omens limited legality

- Omens of the Third Age is listed in current set-specific limited rules and starts games with an Omens of Arcana macro [FAB-2].
- Current TRP classifies Omens with 14 limited cards and the modern extra-card exclusions: Legendary, Fabled, Marvel, extended-art, micro-text, cold-foil, and expansion cards [FAB-2].
- The official Pre-Release Guide says to remove the **last two** cards; those removed outcomes are Basic, Expansion, Legendary, Marvel, or Cold Foil [FAB-4]. TRP's broader table controls where the article omits Fabled and other treatments.
- The product release date is June 5, 2026 [FAB-7]. New cards become legal for official tournament play on their product release date [FAB-5]. Official pre-release events ran May 29–June 4 [FAB-4].

This simulator models drafting only. It does not validate a final limited deck or implement the Omens of Arcana macro.

## Verified physical booster distribution

The product page says Omens boosters contain 16 cards and publishes this distribution [FAB-3]:

| Physical allocation | Published statement | Visible after rear removal |
|---|---|---|
| Common | 11 per pack | Yes |
| Rare/Majestic | 2 per pack: one Rare plus one Rare or Majestic | Yes |
| Rainbow Foil | 1 per pack | Yes, provided it is a legal normal-slot rarity |
| Basic | 2 per pack: one Basic plus one Basic, Expansion Slot, Legendary, Marvel, or Fabled | No; these are the rear two |
| Cold Foil | Approx. 1 per 24 packs, replacing a Basic | No |

Published frequencies are approximate across the whole production and not guaranteed in a given pack/display/case [FAB-3].

Therefore every visible simulated pack has exactly:

- 11 standard Commons;
- 1 standard Rare;
- 1 standard Rare-or-Majestic;
- 1 Rainbow Foil from the legal normal-slot pool;
- no replacement for the removed rear two cards.

Majestics and Rainbow Foils in those normal slots are draftable. A normal and Rainbow Foil copy are different `PhysicalCardInstance`s with the same deckbuilding `CardIdentity`. The UI renders Rainbow Foil using a restrained art filter plus a nearby icon and accessible text.

## Rear-slot exclusion contract

The collator must first represent a 16-card physical booster and only then apply `removeRear(2)`. Removed instances must never enter a client projection, pool, remaining-card count, pick fallback, or Fabrary export. The versioned snapshot must nevertheless retain every excluded entry with:

- source printing/collector identifier;
- card identity;
- treatment/foiling and rarity;
- `expansionSlot` evidence where available;
- physical slot family (`rear-basic`, `rear-premium`, or `unknown-rear`);
- `draftable: false`;
- exclusion reason(s), source, and verification status.

At minimum exclude all Basics/tokens, expansion-slot outcomes, Legendary, Fabled, Marvel, cold foils, and any other TRP extra-card treatment. Legendary Rainbow Foils in a rear slot are excluded. Do not infer that all Rainbow Foils are excluded: Common/Rare/Majestic Rainbow Foils in the legal normal slot remain eligible.

## Correlation and probability evidence boundary

No reviewed official source publishes:

- the Rare-versus-Majestic probability in the `Rare or Majestic` slot;
- rarity weights for the Rainbow Foil slot;
- card-level sheet weights;
- which Basic position a Cold Foil replaces;
- print-run sequencing or pitch/card correlations.

The product page publishes slot categories and the 1-in-24 approximate Cold Foil frequency, but not those missing weights [FAB-3]. The open datasets describe cards and printings, not pack collation [DATA-1][DATA-5]. **Do not derive weights from set card counts and do not invent print runs.**

Recommended implementation gate:

1. Obtain an authoritative collation statement, or a captain-approved, documented observation dataset of sealed Omens product.
2. Commit the evidence as small human-reviewed fixtures, not raw scraped/generated card data in this planning task.
3. Version the resulting probability table separately from card data.
4. Use independent slot draws only where no reliable correlation evidence exists, as the product brief directs.
5. Mark empirical estimates with sample size and confidence; never label them official.

Until the missing normal-slot weights are resolved, implementation may build and test the collation boundary but must not ship an `authentic` generator using guessed probabilities (DT-1).

## Card snapshot reconciliation

The preferred release dataset, `the-fab-cube/flesh-and-blood-cards` v8.2.0, has 251 OMN collector IDs and 482 OMN printing/treatment rows, all with image URLs in the inspected release. The official Card Vault product endpoint currently reports 260 product entries: 251 `OMN` plus nine `IAR` Marvel entries [DATA-1][FAB-7]. The product page itself says `251 cards in set` [FAB-3], so these counts are different scopes, not safely interchangeable.

The future import validation must:

- pin the exact upstream tag and file checksums;
- start from the official Card Vault product membership list;
- join all matching upstream identities/printings, including the nine `IAR` entries;
- report missing, duplicate, treatment, image-host, and slot-classification differences;
- require an explicit classification for all 260 official product entries and every relevant physical treatment;
- fail closed on unknown rarity/foiling/slot metadata;
- output a small reviewed Omens-only snapshot; never ship the upstream ~12 MB all-card package to browsers.

This is a future data-import phase. No generated snapshot belongs in the planning commit.

## Collation invariants for TDD

Once DT-1 is resolved, the executable contract is:

1. Same set-data version + seed + seat count produces byte-equivalent unopened packs.
2. Generate exactly `seatCount × 3 × 16` physical instances before exclusion and `seatCount × 3 × 14` draftable instances after it.
3. Every physical instance ID is unique even when card identity/treatment repeats.
4. The two rear positions contain only snapshot entries classified as rear-eligible; all are removed atomically.
5. Every visible pack has the 11C + 1R + 1R/M + 1RF slot shape.
6. Visible pools contain no excluded identity/treatment and all visible entries have a remote image URL.
7. All weighted choices use a deterministic random source and unbiased bounded-index sampling.
8. Production seed and random-source state are server-owned and are not sent during the draft.
9. Pack, seat-order, and timeout-fallback random streams are domain-separated so a timeout cannot alter pre-generated packs.
10. A completed N-seat draft assigns exactly 42 visible physical instances to every draft seat, with no loss or duplication.
