import type { OmensSnapshotIdentity } from "@draft-table/set-omens/snapshot";
import type { DraftCard } from "@draft-table/draft";

/**
 * Hands a finished pool to Fabrary.
 *
 * Fabrary's import query is public client behaviour rather than a documented API, so this is
 * deliberately progressive: the deep link pre-populates an import form for a signed-in user, and
 * the copyable text list works for everyone. Neither creates a deck on anyone's behalf, and this
 * module reaches no network — it only ever builds a link and a string for the drafter to use.
 *
 * `docs/risks-and-decisions.md` DT-7 owns that boundary, including why the fallback is mandatory.
 */

export const FABRARY_IMPORT_ORIGIN = "https://fabrary.net";
export const FABRARY_IMPORT_URL = `${FABRARY_IMPORT_ORIGIN}/decks?tab=import`;
export const FABRARY_DECK_NAME = "Draft Table – Omens pool";

/** Pitch is a resource value; these are the names Fabrary's own copyable list uses. */
const PITCH_COLOURS = Object.freeze(["", "red", "yellow", "blue"]);

export interface FabraryEntry {
  /** The six-character official collector identifier Fabrary accepts, for example `OMN134`. */
  readonly id: string;
  readonly name: string;
  readonly pitch: 0 | 1 | 2 | 3;
  /** Physical copies drafted. Normal and Rainbow Foil collapse here, as deckbuilding treats them alike. */
  readonly count: number;
}

const collectorOrder = (left: FabraryEntry, right: FabraryEntry): number => {
  const number = (id: string) => Number(id.replace(/\D/gu, ""));
  const difference = number(left.id) - number(right.id);
  return difference !== 0 ? difference : (left.id < right.id ? -1 : 1);
};

/**
 * Collapses a drafted pool into one counted entry per identity, in collector order.
 *
 * A card this snapshot does not know keeps its identifier as its name rather than disappearing:
 * losing a card silently from an export is worse than showing an unfamiliar identifier.
 */
export const fabraryEntries = (
  cards: readonly DraftCard[],
  identities: ReadonlyMap<string, OmensSnapshotIdentity>
): readonly FabraryEntry[] => {
  const counted = new Map<string, { name: string; pitch: 0 | 1 | 2 | 3; count: number }>();
  for (const card of cards) {
    const existing = counted.get(card.cardId);
    if (existing !== undefined) {
      existing.count += 1;
      continue;
    }
    const identity = identities.get(card.cardId);
    counted.set(card.cardId, {
      name: identity?.name ?? card.cardId,
      pitch: identity?.pitch ?? 0,
      count: 1
    });
  }

  return Object.freeze([...counted]
    .map(([id, { name, pitch, count }]) => Object.freeze({ id, name, pitch, count }))
    .sort(collectorOrder));
};

/**
 * The pre-populated import link, or `null` when there is nothing to import.
 *
 * One identifier occurrence per physical copy, which is how the import form counts them.
 */
export const fabraryImportLink = (entries: readonly FabraryEntry[]): string | null => {
  if (entries.length === 0) return null;
  const cards = entries.flatMap(({ id, count }) => Array.from({ length: count }, () => encodeURIComponent(id)));
  // Each identifier is encoded on its own so an odd one cannot forge a parameter, while the commas
  // between them stay literal: `URLSearchParams` would percent-encode the separators Fabrary splits on.
  return `${FABRARY_IMPORT_ORIGIN}/decks?tab=import&format=Draft`
    + `&name=${encodeURIComponent(FABRARY_DECK_NAME)}`
    + `&cards=${cards.join(",")}`;
};

/** The copyable list Fabrary's own import form already parses, for anyone the link cannot serve. */
export const fabraryTextList = (entries: readonly FabraryEntry[]): string => [
  `Name: ${FABRARY_DECK_NAME}`,
  "Format: Draft",
  "",
  "Deck cards",
  ...entries.map(({ name, pitch, count }) => `${count}x ${name}${pitch === 0 ? "" : ` (${PITCH_COLOURS[pitch]})`}`)
].join("\n");
