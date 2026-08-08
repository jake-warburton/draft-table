/**
 * The table's shared card rendering: one set of DOM builders for the solo table and a room.
 *
 * Everything here is presentation. Cards render as art with the name kept for screen readers,
 * a failed image gets out of the way, and the pool builders preserve exactly the order they are
 * given. Nothing in this module owns state, entropy, or a connection.
 */

import type { DraftCard } from "@draft-table/draft";

import { OMENS_SET_SNAPSHOT, type OmensSnapshotIdentity } from "./cards.ts";
import { identityIndex } from "./pool.ts";

/** The official art is 376×526, so declaring it reserves each card's space before it arrives. */
const ART_WIDTH = 376;
const ART_HEIGHT = 526;

const PITCH_SUFFIXES = Object.freeze(["", " (red)", " (yellow)", " (blue)"]);
const RARITY_LABELS = Object.freeze({ common: "Common", rare: "Rare", majestic: "Majestic" });

export const identities = identityIndex(OMENS_SET_SNAPSHOT);

/** The card's readable label, built from its snapshot identity when the server sends none. */
export const labelFor = (card: DraftCard): string => {
  if (card.label !== undefined) return card.label;
  const identity = identities.get(card.cardId);
  if (identity === undefined) return card.cardId;
  return `${identity.name}${PITCH_SUFFIXES[identity.pitch]} · ${RARITY_LABELS[identity.rarity]}`;
};

/**
 * Card art is decorative: the visible name beside it is already the accessible name, so a failed
 * image simply gets out of the way rather than leaving an unreadable card.
 */
export const cardArt = (cardId: string): HTMLElement | null => {
  const identity: OmensSnapshotIdentity | undefined = identities.get(cardId);
  if (identity === undefined) return null;
  const art = document.createElement("img");
  art.setAttribute("src", identity.image);
  art.setAttribute("alt", "");
  art.setAttribute("loading", "lazy");
  art.setAttribute("decoding", "async");
  art.setAttribute("referrerpolicy", "no-referrer");
  art.setAttribute("width", String(ART_WIDTH));
  art.setAttribute("height", String(ART_HEIGHT));
  art.onerror = () => { art.hidden = true; };
  return art;
};

const named = (card: DraftCard): HTMLElement => {
  const name = document.createElement("span");
  name.className = "card-name";
  name.textContent = labelFor(card);
  return name;
};

/** Art first, then the name, so a card reads the same way whether or not its image loaded. */
export const withArt = (host: HTMLElement, card: DraftCard): HTMLElement => {
  const art = cardArt(card.cardId);
  host.replaceChildren(...(art === null ? [named(card)] : [art, named(card)]));
  return host;
};

/** One clickable card in a pack; the caller owns what a click means. */
export const cardControl = (card: DraftCard, onChoose: () => void): HTMLElement => {
  const control = document.createElement("button");
  control.setAttribute("type", "button");
  control.className = "card";
  control.onclick = onChoose;
  return withArt(control, card);
};

export const poolCard = (card: DraftCard): HTMLElement => {
  const item = document.createElement("li");
  item.className = "pool-card";
  return withArt(item, card);
};

export const poolGroup = (label: string, cards: readonly DraftCard[]): HTMLElement => {
  const group = document.createElement("div");
  group.className = "pool-group";
  const list = document.createElement("ol");
  list.replaceChildren(...cards.map(poolCard));
  if (label === "") {
    group.replaceChildren(list);
    return group;
  }
  const heading = document.createElement("h3");
  heading.textContent = `${label} (${cards.length})`;
  list.setAttribute("aria-label", label);
  group.replaceChildren(heading, list);
  return group;
};
