import { OMENS_SET_SNAPSHOT, imageIndex } from "./cards.ts";
import { DEFAULT_SEAT_COUNT, chooseCard, createTable, viewTable } from "./table.ts";

/** The official art is 376×526, so declaring it reserves each card's space before the art arrives. */
const ART_WIDTH = 376;
const ART_HEIGHT = 526;

const images = imageIndex(OMENS_SET_SNAPSHOT);

const element = (selector: string): HTMLElement => {
  const found = document.querySelector(selector);
  if (found === null) throw new Error(`The draft shell is missing ${selector}.`);
  return found as HTMLElement;
};

const packRegion = element("#pack");
const statusRegion = element("#status");
const poolRegion = element("#pool");
const poolCount = element("#pool-count");
const roundNumber = element("#round");
const pickNumber = element("#pick");
const restartControl = element("#restart");

/** The browser owns the entropy; every transition only maps caller-supplied samples. */
const nextUint32 = (): number => crypto.getRandomValues(new Uint32Array(1))[0] as number;

const deal = () => createTable(DEFAULT_SEAT_COUNT, OMENS_SET_SNAPSHOT, nextUint32);

let state = deal();

const listItem = (text: string): HTMLElement => {
  const item = document.createElement("li");
  item.textContent = text;
  return item;
};

/**
 * Card art is decorative: the visible name beside it is already the button's accessible name, so a
 * failed image simply gets out of the way rather than leaving an unreadable card.
 */
const cardArt = (cardId: string): HTMLElement | null => {
  const source = images.get(cardId);
  if (source === undefined) return null;
  const art = document.createElement("img");
  art.setAttribute("src", source);
  art.setAttribute("alt", "");
  art.setAttribute("loading", "lazy");
  art.setAttribute("decoding", "async");
  art.setAttribute("referrerpolicy", "no-referrer");
  art.setAttribute("width", String(ART_WIDTH));
  art.setAttribute("height", String(ART_HEIGHT));
  art.onerror = () => { art.hidden = true; };
  return art;
};

const cardControl = (card: { cardId: string; label?: string }, instanceId: string, round: number, pick: number): HTMLElement => {
  const control = document.createElement("button");
  control.setAttribute("type", "button");
  control.className = "card";
  const name = document.createElement("span");
  name.className = "card-name";
  name.textContent = card.label ?? card.cardId;
  const art = cardArt(card.cardId);
  control.replaceChildren(...(art === null ? [name] : [art, name]));
  control.onclick = () => choose(instanceId, round, pick);
  return control;
};

const render = (): void => {
  const view = viewTable(state);
  roundNumber.textContent = String(view.round);
  pickNumber.textContent = String(view.pick);
  statusRegion.textContent = view.status;
  poolCount.textContent = String(view.pool.length);
  poolRegion.replaceChildren(...view.pool.map((card) => listItem(card.label ?? card.cardId)));
  packRegion.replaceChildren(
    ...view.cards.map((card) => cardControl(card, card.instanceId, view.round, view.pick))
  );
  if (view.complete) {
    statusRegion.tabIndex = -1;
    statusRegion.focus();
  }
};

/** A captured round and pick reject any activation left over from a superseded pack. */
const choose = (instanceId: string, round: number, pick: number): void => {
  const view = viewTable(state);
  if (view.complete || view.round !== round || view.pick !== pick) return;
  state = chooseCard(state, instanceId, nextUint32);
  render();
  (packRegion.firstChild as HTMLElement | null)?.focus();
};

restartControl.onclick = () => {
  state = deal();
  render();
};

render();
