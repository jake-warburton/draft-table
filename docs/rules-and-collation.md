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

The approved community recipe begins at the 14-card simulator layout and does not identify or weight the two physical rear cards. The MVP physical model must therefore wrap each generated 14-card visible layout in a 16-position pack containing two explicit, opaque `RemovedRearSlotInstance` values at positions 15 and 16, then apply `removeRear(2)` before any client projection. It must not invent named rear-card probabilities. The rear markers carry unique instance IDs, position/family, `draftable: false`, and the official exclusion evidence, but no fabricated card identity/treatment.

Removed rear markers must never enter a client projection, pool, remaining-card count, pick fallback, or Fabrary export. The versioned snapshot must nevertheless retain every known excluded product entry with:

- source printing/collector identifier;
- card identity;
- treatment/foiling and rarity;
- `expansionSlot` evidence where available;
- physical slot family (`rear-basic`, `rear-premium`, or `unknown-rear`);
- `draftable: false`;
- exclusion reason(s), source, and verification status.

At minimum exclude all Basics/tokens, expansion-slot outcomes, Legendary, Fabled, Marvel, cold foils, and any other TRP extra-card treatment. Legendary Rainbow Foils in a rear slot are excluded. Do not infer that all Rainbow Foils are excluded: Common/Rare/Majestic Rainbow Foils in the legal normal slot remain eligible.

## Captain-approved community MVP recipe

No reviewed official source publishes the Rare-versus-Majestic split, Rainbow Foil rarity/card weights, card-level sheets, exact rear-card weights, or print-run sequencing/pitch correlations. The product page publishes slot categories and the approximate 1-in-24 Cold Foil frequency, but not those values [FAB-3]. The open datasets describe cards and printings, not pack collation [DATA-1][DATA-5].

The captain downloaded `OMN_Draft_3.8 - Fixed New Layout Probabilities.txt` from the Rantaways server, which is widely used by players to practice draft, and approved it as Draft Table's MVP recipe [COMMUNITY-1]. It is a **captain-approved community recipe**, not an official Legend Story Studios publication, sealed-product observation study, or proof of factory print runs. Product copy and code identifiers must preserve that distinction.

### Independently validated evidence

The planning review independently parsed the read-only source and confirmed:

- recipe ID: `rantaways-omn-draft-3.8-fixed-layout-probabilities`;
- SHA-256: `97a964c8c5b6a962404398ca2b57c9ceeeb2dfb714512e61ff22e07ea1ec2328`;
- 120,617 bytes and 5,083 lines, encoded as UTF-8 with BOM and CRLF endings;
- sectioned format: JSON `Settings`, JSON `CustomCards`, an indentation-sensitive weighted `Layouts` DSL, then 11 named weighted card-pool sections;
- settings `showSlots=true`, `withReplacement=false`, and one card-back URL;
- 209 unique custom card names/collector IDs: 134 `common`, 60 `rare`, and 15 file-labelled `mythic` (the recipe's Majestic pool);
- 228 uniquely identified, positive-integer weighted 14-card layouts with total weight **460,800**;
- 38 base common-slot layouts, each expanded into the six exact Rare/Majestic × Rainbow-Foil-rarity outcomes;
- every layout totals 11 normal Common-pool cards (including exactly one Equipment), one guaranteed Rare, one Rare-or-Majestic, and one Rainbow Foil;
- every layout pool reference resolves; the Wizard, Illusionist, Runeblade, Lightning, Generic, Equipment, Rare, and Majestic pools partition all custom cards exactly once; the `Rfcommon`, `RFRare`, and `RFMajestic` pools are valid, potentially overlapping subsets of those cards; every declared pool is used by at least one layout slot; and all card weights are positive integers.

The six outcome coefficients within every base layout are the same, scaled by that base layout's integer multiplier:

| Second rarity slot | Rainbow Foil pool | Coefficient out of 2,400 |
|---|---|---:|
| Rare | Common | 1,411 |
| Rare | Rare | 255 |
| Rare | Majestic | 34 |
| Majestic | Common | 581 |
| Majestic | Rare | 105 |
| Majestic | Majestic | 14 |

That yields exact aggregate fixtures:

| Derived outcome | Layout weight | Probability |
|---|---:|---:|
| Second slot Rare | 326,400 | 70.833333% |
| Second slot Majestic | 134,400 | 29.166667% |
| Rainbow Foil Common | 382,464 | 83% |
| Rainbow Foil Rare | 69,120 | 15% |
| Rainbow Foil Majestic | 9,216 | 2% |

The exact rational fixtures are `17/24` Rare and `7/24` Majestic for the second slot, and `83/100`, `15/100`, `2/100` for Rainbow Foil Common/Rare/Majestic; the six-decimal values above are display rounding.

The internal card-pool fixtures are:

| Pool | Entries | Total internal weight |
|---|---:|---:|
| Wizard | 24 | 159 |
| Illusionist | 24 | 160 |
| Runeblade | 24 | 164 |
| Lightning | 42 | 227 |
| Generic | 6 | 28 |
| Equipment | 14 | 148 |
| Rare | 60 | 120 |
| Majestic | 15 | 30 |
| Rainbow Foil Common (`Rfcommon`) | 105 | 105 |
| Rainbow Foil Rare (`RFRare`) | 59 | 59 |
| Rainbow Foil Majestic (`RFMajestic`) | 7 | 7 |

### Implementation contract

The MVP may use this recipe only after application implementation is separately approved and then only through a strict test-first import:

1. Verify the exact filename/version, byte length, and SHA-256 before parsing; mismatch fails closed.
2. Parse deterministically and reject unknown/missing/duplicate sections, malformed JSON/layout lines, duplicate IDs/names, non-positive weights, unresolved pool names/cards, a layout not totalling 14, or any changed invariant/total above.
3. Lock the six coefficient fixtures, all pool counts/totals, total layout weight, and headline derived probabilities in exact integer/rational tests—never a flaky statistical approximation.
4. Treat `withReplacement=false` as a recipe contract for repeated draws from a card pool within one pack.
5. Version the recipe independently from the card snapshot and store both immutable IDs/checksums in every room. Any upstream file drift requires a new version, a machine-generated comparison report, human review, and explicit captain approval.
6. Keep the full source file outside the repository unless a separate provenance/licensing review approves archiving it; generated output requires the same review as the card snapshot.
7. Generate the recipe's 14 visible cards, wrap them in the conceptual 16-position physical model described above, and remove the two rear markers. Do not pretend the recipe models rear-card identities or official print-run correlations.

Do not derive alternative weights from set card counts, silently normalize malformed totals, invent print runs, or label these community probabilities official.

## Card snapshot reconciliation

The preferred release dataset, `the-fab-cube/flesh-and-blood-cards` v8.2.0, has 251 OMN collector IDs and 482 OMN printing/treatment rows, all with image URLs in the inspected release. Research inspection of the official Card Vault product endpoint observed 260 product entries: 251 `OMN` plus nine `IAR` Marvel entries [DATA-1][FAB-7]. The product page itself says `251 cards in set` [FAB-3], so these counts are different scopes, not safely interchangeable.

Completed build-time slices pin the exact upstream tag and file checksums, validate the full card source against its pinned schema, project exact source-order `set_id === "OMN"` rows with 251-card/482-printing/251-distinct-collector-ID guards, retain the raw checksum of one caller-held observed Card Vault response as dated evidence, and strictly derive its canonical 260-entry membership (251 `OMN`, 9 `IAR`). All 260 validated exact official bases are joined to one pinned upstream identity and every matching printing row across `set_id === "OMN"` and `set_id === "IAR"`. Exact upstream `art_variations` arrays are retained through reconciliation as uninterpreted source metadata and pinned by their exact sequence and suffix-form aggregates. Exact validated official suffix markers are classified against the observed upstream foiling rows (`RF` → `R`, `CF` → `C`, and `MV` → `C`); unsuffixed entries select no correspondence. A separate capability-bound projection revalidates caller-provided Card Vault bytes against canonical membership, then retains entries in canonical membership order with only source-order face positions and exact small/normal/large rendition URL text; its shape, host, distinct-URL, and observed aggregate guards establish no face/product, URL-authority, accessibility, or runtime semantics. Neither retained art-variation metadata nor the suffix correspondence establishes product or treatment semantics. The completed capability-bound MV-only reconciliation retains only each of the nine MV official IDs, its face count, its matching upstream-row count, and whether each count is two; it independently pins 11 faces/rows, seven 1↔1 entries, two 2↔2 entries, zero mismatches, and identical two-count entry sets. This equality is not generalized to RF or unsuffixed records, whose other printing multiplicities are legitimate, and does not interpret rows as face semantics or join URLs. The raw checksum is not a retrievable version pin and must not gate an otherwise identical canonically derived membership after cosmetic live-response changes. The pinned schema requires card-level `pitch` to be a string but does not enumerate it; the checksum-verified 260 official identity owners contain only exact values empty/`1`/`2`/`3` (39/78/74/69 respectively). Reconciliation rejects every other value or type and retains the exact pitch on each opaque official/upstream identity record. Comprehensive Rules 2.1.2a says printed pitches 1, 2, and 3 typically correspond to red, yellow, and blue strips respectively, while explicitly stating pitch and color are independent [FAB-8]. This slice therefore uses that deterministic mapping only to derive the community recipe naming correspondence; it does not establish general card-color, treatment, art, or runtime semantics.

The exact build-time identity join accepts only the completed opaque recipe parser result and completed opaque official/upstream reconciliation. It first selects the exact unsuffixed OMN official identity by unchanged collector text, then compares the unchanged recipe name to the official bare name plus exactly ` (red)`, ` (yellow)`, or ` (blue)` for pitches `1`, `2`, or `3`; exact empty pitch requires the bare official name. It neither strips nor normalizes the recipe name. The first captain four-source run proved the collector path but disconfirmed raw-name equality: 14 pitchless references mapped and 195 pitched references were masked. The corrected deterministic machinery and fictional contracts are implemented, but the real 209-mapped/51-unmapped partition remains captain-acceptance-pending until a captain rerun of the checksum-verifying command passes. Recipe rarity labels remain uninterpreted community metadata. Output remains recipe-order `mapped` facts plus canonical-official-order `unmapped` facts; `unmapped` means only absent from this community recipe and is not `excluded` or evidence of non-draftability.

The remaining import validation must:

- classify name, full suffix/treatment, art-variation, face, image, slot, and exclusion semantics without reinterpreting the completed identity joins, retained source metadata, or foiling correspondence;
- require an explicit classification for all 260 official product entries and every relevant physical treatment;
- fail closed on unknown rarity/foiling/slot metadata;
- establish any recipe/upstream rarity correspondence and replace private pool references with reviewed identities and treatments;
- output a small reviewed Omens-only snapshot; never ship the upstream ~12 MB all-card package to browsers.

Suffix/treatment/art/face/URL semantics, slot and exclusion/draftability classification, private pool-to-identity replacement, generated/versioned snapshots, image accessibility identity, rear markers, collation generation, and runtime behavior remain future slices. No generated snapshot belongs in the repository before its separate review.

## Collation invariants for TDD

With the approved recipe, the executable contract is:

1. Same set-data version + recipe version/checksum + seed + seat count produces byte-equivalent unopened packs.
2. Generate exactly `seatCount × 3 × 16` physical positions (14 card instances plus two rear markers per pack) before exclusion and `seatCount × 3 × 14` draftable card instances after it.
3. Every visible card and rear-marker instance ID is unique even when card identity/treatment repeats.
4. Positions 15 and 16 are typed removed-rear markers, never guessed card outcomes, and are removed atomically.
5. Every visible pack has the 11C + 1R + 1R/M + 1RF slot shape and originates from one of the 228 validated weighted layouts.
6. Layout total, six coefficients, pool counts/totals, `withReplacement=false`, and derived probabilities exactly match the checksum-pinned fixtures above.
7. Visible pools contain no excluded identity/treatment and all visible entries have a remote image URL.
8. All weighted choices use a deterministic random source and unbiased bounded-index sampling.
9. Production seed and random-source state are server-owned and are not sent during the draft.
10. Pack, seat-order, and timeout-fallback random streams are domain-separated so a timeout cannot alter pre-generated packs.
11. A completed N-seat draft assigns exactly 42 visible physical card instances to every draft seat, with no loss or duplication.
