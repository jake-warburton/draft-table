import { mapUnsigned32SampleToBoundedTicket } from "@draft-table/engine";
import type { DraftCard, DraftPack } from "@draft-table/draft";

/**
 * Placeholder card material for the browser client.
 *
 * Nothing here is Omens evidence. The reviewed versioned set snapshot is still future work, so the
 * client draws from an obviously invented catalogue that mirrors only the *shape* of the recipe
 * layout: eleven common-rarity positions, one fixed rare, one rare-or-majestic, and one Rainbow
 * Foil. Swapping in the real snapshot replaces this catalogue, not the draft itself.
 */

export type CardRarity = "common" | "rare" | "majestic";
export type PackPositionRole = "common" | "fixed-rare" | "rare-or-majestic" | "rainbow-foil";

export interface CatalogueCard {
  readonly cardId: string;
  readonly name: string;
  readonly rarity: CardRarity;
  /** 0 marks a card with no pitch value; 1, 2, and 3 are red, yellow, and blue. */
  readonly pitch: 0 | 1 | 2 | 3;
}

/** Caller-owned entropy. The client never generates its own randomness inside a transition. */
export type Uint32Source = () => number;

export const PACK_SIZE = 14;
export const COMMON_POSITIONS = 11;

export const PACK_POSITION_ROLES: readonly PackPositionRole[] = Object.freeze([
  ...Array.from({ length: COMMON_POSITIONS }, (): PackPositionRole => "common"),
  "fixed-rare" as const,
  "rare-or-majestic" as const,
  "rainbow-foil" as const
]);

const PITCH_SUFFIXES = Object.freeze(["", " (red)", " (yellow)", " (blue)"]);
const RARITY_LABELS = Object.freeze({ common: "Common", rare: "Rare", majestic: "Majestic" });
const MAXIMUM_TICKET_ATTEMPTS = 64;

const generate = (rarity: CardRarity, prefix: string, count: number): readonly CatalogueCard[] =>
  Object.freeze(Array.from({ length: count }, (unused, index) => {
    const pitch = (index % 4) as 0 | 1 | 2 | 3;
    const ordinal = String(index + 1).padStart(3, "0");
    return Object.freeze({
      cardId: `plc-${prefix}-${ordinal}`,
      name: `Placeholder ${RARITY_LABELS[rarity]} ${ordinal}${PITCH_SUFFIXES[pitch]}`,
      rarity,
      pitch
    });
  }));

/** An invented catalogue sized like the accepted 209 draftable Omens identities. */
export const DRAFTABLE_PLACEHOLDER_CATALOGUE: readonly CatalogueCard[] = Object.freeze([
  ...generate("common", "c", 140),
  ...generate("rare", "r", 50),
  ...generate("majestic", "m", 19)
]);

/**
 * Maps caller samples to one unbiased ticket in [0, bound), retrying only on the engine's
 * rejection tail. The bounded attempt count refuses a source that never produces an accepted sample.
 */
export const drawBoundedTicket = (bound: number, random: Uint32Source): number => {
  for (let attempt = 0; attempt < MAXIMUM_TICKET_ATTEMPTS; attempt += 1) {
    const mapping = mapUnsigned32SampleToBoundedTicket(random(), bound);
    if (mapping.state === "accepted") return mapping.ticket;
  }
  throw new RangeError("The sample source produced no accepted bounded ticket.");
};

const drawCard = (pool: readonly CatalogueCard[], random: Uint32Source): CatalogueCard => {
  if (pool.length === 0) throw new RangeError("A pack position has no remaining catalogue card.");
  return pool[drawBoundedTicket(pool.length, random)];
};

const toDraftCard = (source: CatalogueCard, instanceId: string, rainbowFoil: boolean): DraftCard =>
  Object.freeze({
    instanceId,
    cardId: source.cardId,
    label: `${source.name} · ${RARITY_LABELS[source.rarity]}${rainbowFoil ? " · Rainbow Foil" : ""}`
  });

/**
 * Builds one fourteen-position pack. The thirteen normal positions never repeat an identity, and
 * the Rainbow Foil position draws from the whole catalogue, so a legal normal/foil pair of the same
 * identity is never deduplicated away.
 */
export const buildPack = (
  packId: string,
  catalogue: readonly CatalogueCard[],
  random: Uint32Source
): DraftPack => {
  const taken = new Set<string>();
  const available = (accept: (card: CatalogueCard) => boolean): readonly CatalogueCard[] =>
    catalogue.filter((card) => accept(card) && !taken.has(card.cardId));

  const cards = PACK_POSITION_ROLES.map((role, position) => {
    const instanceId = `${packId}-${position}`;
    if (role === "rainbow-foil") return toDraftCard(drawCard(catalogue, random), instanceId, true);
    const drawn = drawCard(available(
      role === "common"
        ? (card) => card.rarity === "common"
        : role === "fixed-rare"
          ? (card) => card.rarity === "rare"
          : (card) => card.rarity === "rare" || card.rarity === "majestic"
    ), random);
    taken.add(drawn.cardId);
    return toDraftCard(drawn, instanceId, false);
  });

  return Object.freeze({ id: packId, cards: Object.freeze(cards) });
};

/** Builds the three rounds of one pack per seat with globally distinct pack and instance identities. */
export const buildPacksByRound = (
  seatCount: number,
  catalogue: readonly CatalogueCard[],
  random: Uint32Source
): readonly [readonly DraftPack[], readonly DraftPack[], readonly DraftPack[]] => {
  const round = (index: number): readonly DraftPack[] => Object.freeze(
    Array.from({ length: seatCount }, (unused, seat) => buildPack(`r${index}s${seat + 1}`, catalogue, random))
  );
  return Object.freeze([round(1), round(2), round(3)]);
};
