/**
 * Deals real Omens packs from the reviewed set snapshot, on the server.
 *
 * This mirrors the reviewed collation semantics the browser already uses in
 * `apps/web/src/cards.ts`: one weighted layout is chosen from the exact source-order weights,
 * then each of the fourteen positions draws a weighted identity from that position's pool
 * without replacement within that pool. Cross-pool overlap is legal and never deduplicated.
 * The two copies are deliberate for now — pack construction has no reviewed shared export yet —
 * and the server's copy carries no display labels, because every client owns the snapshot and
 * renders a card from its identity alone.
 */

import { mapUnsigned32SampleToBoundedTicket } from "@draft-table/engine";
import {
  OMENS_SET_SNAPSHOT,
  OMENS_SNAPSHOT_PACK_SIZE,
  type OmensSetSnapshot
} from "@draft-table/set-omens/snapshot";
import type { DraftPack } from "@draft-table/draft";

export { OMENS_SET_SNAPSHOT };
export type { OmensSetSnapshot };

export const PACK_SIZE = OMENS_SNAPSHOT_PACK_SIZE;

/** Caller-owned entropy. The room injects it; nothing here generates randomness. */
export type Uint32Source = () => number;

const MAXIMUM_TICKET_ATTEMPTS = 64;

const drawBoundedTicket = (bound: number, random: Uint32Source): number => {
  for (let attempt = 0; attempt < MAXIMUM_TICKET_ATTEMPTS; attempt += 1) {
    const mapping = mapUnsigned32SampleToBoundedTicket(random(), bound);
    if (mapping.state === "accepted") return mapping.ticket;
  }
  throw new RangeError("The sample source produced no accepted bounded ticket.");
};

const selectWeightedIndex = (weights: readonly number[], ticket: number): number => {
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

const selectLayout = (snapshot: OmensSetSnapshot, random: Uint32Source): number => {
  const weights = snapshot.layouts.map((layout) => layout.weight);
  return selectWeightedIndex(weights, drawBoundedTicket(totalWeight(weights), random));
};

/** Builds one fourteen-position pack; pools deplete within the pack, never across pools. */
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
    return Object.freeze({ instanceId: `${packId}-${position}`, cardId: identity.id });
  });

  return Object.freeze({ id: packId, cards: Object.freeze(cards) });
};

/** Three rounds of one pack per seat, with globally distinct pack and instance identities. */
export const buildPacksByRound = (
  seatCount: number,
  snapshot: OmensSetSnapshot,
  random: Uint32Source
): readonly [readonly DraftPack[], readonly DraftPack[], readonly DraftPack[]] => {
  const round = (index: number): readonly DraftPack[] => Object.freeze(
    Array.from({ length: seatCount }, (unused, seat) => buildPack(`r${index}s${seat + 1}`, snapshot, random))
  );
  return Object.freeze([round(1), round(2), round(3)]) as readonly [
    readonly DraftPack[], readonly DraftPack[], readonly DraftPack[]
  ];
};
