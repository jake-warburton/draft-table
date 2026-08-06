import { DRAFTABLE_PLACEHOLDER_CATALOGUE } from "./cards.ts";
import { DEFAULT_SEAT_COUNT, chooseCard, createTable, viewTable } from "./table.ts";

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

const deal = () => createTable(DEFAULT_SEAT_COUNT, DRAFTABLE_PLACEHOLDER_CATALOGUE, nextUint32);

let state = deal();

const listItem = (text: string): HTMLElement => {
  const item = document.createElement("li");
  item.textContent = text;
  return item;
};

const cardControl = (label: string, instanceId: string, round: number, pick: number): HTMLElement => {
  const control = document.createElement("button");
  control.setAttribute("type", "button");
  control.className = "card";
  control.textContent = label;
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
    ...view.cards.map((card) => cardControl(card.label ?? card.cardId, card.instanceId, view.round, view.pick))
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
