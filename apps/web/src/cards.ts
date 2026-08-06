import { mapUnsigned32SampleToBoundedTicket } from "@draft-table/engine";
import {
  OMENS_SET_SNAPSHOT,
  OMENS_SNAPSHOT_IMAGE_ORIGIN,
  OMENS_SNAPSHOT_PACK_SIZE,
  OMENS_SNAPSHOT_SLOT_ROLES,
  type OmensSetSnapshot,
  type OmensSnapshotIdentity
} from "@draft-table/set-omens/snapshot";
import type { DraftCard, DraftPack } from "@draft-table/draft";

/**
 * Deals real Omens packs from the reviewed set snapshot.
 *
 * This mirrors the reviewed build-time collation semantics rather than reimplementing them: one
 * weighted layout is chosen, then each of the fourteen positions draws a weighted identity from
 * that position's pool without replacement *within that pool*. Cross-pool overlap is legal, so a
 * normal card and its Rainbow Foil counterpart may both appear and are never deduplicated.
 *
 * Card art stays remote: the snapshot carries each identity's official image URL, and nothing here
 * fetches it. The browser requests art directly from the pinned origin when it paints a card.
 */

export { OMENS_SET_SNAPSHOT, OMENS_SNAPSHOT_IMAGE_ORIGIN, OMENS_SNAPSHOT_SLOT_ROLES };
export type { OmensSetSnapshot, OmensSnapshotIdentity };

/** Caller-owned entropy. The client never generates its own randomness inside a transition. */
export type Uint32Source = () => number;

export const PACK_SIZE = OMENS_SNAPSHOT_PACK_SIZE;

const PITCH_SUFFIXES = Object.freeze(["", " (red)", " (yellow)", " (blue)"]);
const RARITY_LABELS = Object.freeze({ common: "Common", rare: "Rare", majestic: "Majestic" });
const MAXIMUM_TICKET_ATTEMPTS = 64;

/**
 * Maps caller samples to one unbiased ticket in [0, bound), retrying only on the engine's rejection
 * tail. The bounded attempt count refuses a source that never produces an accepted sample.
 */
export const drawBoundedTicket = (bound: number, random: Uint32Source): number => {
  for (let attempt = 0; attempt < MAXIMUM_TICKET_ATTEMPTS; attempt += 1) {
    const mapping = mapUnsigned32SampleToBoundedTicket(random(), bound);
    if (mapping.state === "accepted") return mapping.ticket;
  }
  throw new RangeError("The sample source produced no accepted bounded ticket.");
};

/**
 * Resolves one exact ticket in [0, total) to the index whose cumulative weight range contains it.
 * Source order and repeated weights are preserved exactly, so equal weights stay equally likely.
 */
export const selectWeightedIndex = (weights: readonly number[], ticket: number): number => {
  let cumulative = 0;
  for (let index = 0; index < weights.length; index += 1) {
    cumulative += weights[index];
    if (ticket < cumulative) return index;
  }
  throw new RangeError("The ticket falls outside the total weight.");
};

const totalWeight = (weights: readonly number[]): number => {
  let total = 0;
  for (const weight of weights) total += weight;
  return total;
};

/** Chooses one layout from the snapshot's exact source-order weights. */
export const selectLayout = (snapshot: OmensSetSnapshot, random: Uint32Source): number => {
  const weights = snapshot.layouts.map((layout) => layout.weight);
  return selectWeightedIndex(weights, drawBoundedTicket(totalWeight(weights), random));
};

const cardLabel = (identity: OmensSnapshotIdentity, rainbowFoil: boolean): string =>
  `${identity.name}${PITCH_SUFFIXES[identity.pitch]} · ${RARITY_LABELS[identity.rarity]}` +
  (rainbowFoil ? " · Rainbow Foil" : "");

/**
 * Builds one fourteen-position pack. Each pool keeps its own remaining entries for the life of the
 * pack, so a pool that fills several positions never repeats an identity, while separate pools stay
 * independent.
 */
export const buildPack = (
  packId: string,
  snapshot: OmensSetSnapshot,
  random: Uint32Source
): DraftPack => {
  const layout = snapshot.layouts[selectLayout(snapshot, random)];
  const remaining = new Map<number, number[]>();

  const cards = layout.pools.map((poolIndex, position) => {
    const pool = snapshot.pools[poolIndex];
    let available = remaining.get(poolIndex);
    if (available === undefined) {
      available = pool.entries.map((unused, index) => index);
      remaining.set(poolIndex, available);
    }
    if (available.length === 0) {
      throw new RangeError(`Pool ${pool.label} cannot fill every position it is asked to fill.`);
    }
    const weights = available.map((entry) => pool.entries[entry].weight);
    const chosen = selectWeightedIndex(weights, drawBoundedTicket(totalWeight(weights), random));
    const entry = pool.entries[available[chosen]];
    available.splice(chosen, 1);
    const identity = snapshot.identities[entry.identity];
    return Object.freeze({
      instanceId: `${packId}-${position}`,
      cardId: identity.id,
      label: cardLabel(identity, OMENS_SNAPSHOT_SLOT_ROLES[position] === "rainbow-foil")
    }) as DraftCard;
  });

  return Object.freeze({ id: packId, cards: Object.freeze(cards) });
};

/** Builds the three rounds of one pack per seat with globally distinct pack and instance identities. */
export const buildPacksByRound = (
  seatCount: number,
  snapshot: OmensSetSnapshot,
  random: Uint32Source
): readonly [readonly DraftPack[], readonly DraftPack[], readonly DraftPack[]] => {
  const round = (index: number): readonly DraftPack[] => Object.freeze(
    Array.from({ length: seatCount }, (unused, seat) => buildPack(`r${index}s${seat + 1}`, snapshot, random))
  );
  return Object.freeze([round(1), round(2), round(3)]);
};
