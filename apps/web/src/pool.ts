import {
  OMENS_SNAPSHOT_CARD_TYPE_ORDER,
  OMENS_SNAPSHOT_CLASS_ORDER,
  type OmensSetSnapshot,
  type OmensSnapshotIdentity
} from "@draft-table/set-omens/snapshot";
import type { DraftCard } from "@draft-table/draft";

/**
 * Groups a drafted pool for reading.
 *
 * This is presentation only: it never changes what was drafted, never drops a card, and always
 * leaves cards in collector order inside a group, so switching grouping rearranges the same pool
 * rather than showing a different one.
 */

export type PoolGrouping = "number" | "class" | "colour" | "type";

export interface PoolGroup {
  readonly key: string;
  /** Empty for the single ungrouped run, which needs no heading of its own. */
  readonly label: string;
  readonly cards: readonly DraftCard[];
}

export const POOL_GROUPINGS: readonly { readonly id: PoolGrouping; readonly label: string }[] = Object.freeze([
  Object.freeze({ id: "number" as const, label: "Set number" }),
  Object.freeze({ id: "class" as const, label: "Class" }),
  Object.freeze({ id: "colour" as const, label: "Colour" }),
  Object.freeze({ id: "type" as const, label: "Type" })
]);

const CLASS_LABELS = Object.freeze({
  wizard: "Wizard", illusionist: "Illusionist", runeblade: "Runeblade", generic: "Generic"
});
const CARD_TYPE_LABELS = Object.freeze({
  action: "Action", instant: "Instant", "defense-reaction": "Defense Reaction", equipment: "Equipment"
});
const PITCH_LABELS = Object.freeze(["No pitch", "Red", "Yellow", "Blue"]);

/** A card whose identity this snapshot does not know is still shown, in its own trailing group. */
const UNKNOWN = Object.freeze({ key: "unknown", label: "Unknown" });

/** Indexes identities by the `cardId` a dealt card carries. */
export const identityIndex = (snapshot: Pick<OmensSetSnapshot, "identities">): ReadonlyMap<string, OmensSnapshotIdentity> =>
  new Map(snapshot.identities.map((identity) => [identity.id, identity]));

/** Collector order: the number decides, and the whole identifier only breaks a tie. */
const collectorOrder = (left: DraftCard, right: DraftCard): number => {
  const number = (cardId: string) => Number(cardId.replace(/\D/gu, ""));
  const difference = number(left.cardId) - number(right.cardId);
  if (difference !== 0) return difference;
  if (left.cardId !== right.cardId) return left.cardId < right.cardId ? -1 : 1;
  return left.instanceId < right.instanceId ? -1 : 1;
};

/** The buckets a grouping offers, in the order they are shown. Empty buckets are dropped later. */
const bucketsFor = (grouping: PoolGrouping): readonly { key: string; label: string }[] => {
  if (grouping === "class") {
    return [...OMENS_SNAPSHOT_CLASS_ORDER.map((entry) => ({ key: entry, label: CLASS_LABELS[entry] })),
      { key: "classless", label: "No class" }];
  }
  if (grouping === "colour") return [1, 2, 3, 0].map((pitch) => ({ key: `pitch-${pitch}`, label: PITCH_LABELS[pitch] }));
  if (grouping === "type") return OMENS_SNAPSHOT_CARD_TYPE_ORDER.map((entry) => ({ key: entry, label: CARD_TYPE_LABELS[entry] }));
  return [{ key: "all", label: "" }];
};

/** Which bucket one card belongs to, or `null` when its identity is unknown to this snapshot. */
const bucketOf = (grouping: PoolGrouping, identity: OmensSnapshotIdentity | undefined): string | null => {
  if (grouping === "number") return "all";
  if (identity === undefined) return null;
  if (grouping === "class") return identity.cardClass ?? "classless";
  if (grouping === "colour") return `pitch-${identity.pitch}`;
  return identity.cardType;
};

export const groupPool = (
  cards: readonly DraftCard[],
  grouping: PoolGrouping,
  identities: ReadonlyMap<string, OmensSnapshotIdentity>
): readonly PoolGroup[] => {
  const collected = new Map<string, DraftCard[]>();
  for (const card of cards) {
    const key = bucketOf(grouping, identities.get(card.cardId)) ?? UNKNOWN.key;
    const bucket = collected.get(key);
    if (bucket === undefined) collected.set(key, [card]);
    else bucket.push(card);
  }

  return Object.freeze([...bucketsFor(grouping), UNKNOWN]
    .filter(({ key }) => collected.has(key))
    .map(({ key, label }) => Object.freeze({
      key,
      label,
      cards: Object.freeze([...(collected.get(key) as DraftCard[])].sort(collectorOrder))
    })));
};
