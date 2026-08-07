import { OMENS_SET_SNAPSHOT } from "./cards.ts";
import { FABRARY_IMPORT_URL, fabraryEntries, fabraryImportLink, fabraryTextList } from "./fabrary.ts";
import { POOL_GROUPINGS, groupPool, identityIndex, type PoolGrouping } from "./pool.ts";
import { DEFAULT_SEAT_COUNT, chooseCard, createTable, viewTable } from "./table.ts";
import type { DraftCard } from "@draft-table/draft";

/** The official art is 376×526, so declaring it reserves each card's space before the art arrives. */
const ART_WIDTH = 376;
const ART_HEIGHT = 526;

const identities = identityIndex(OMENS_SET_SNAPSHOT);

const element = (selector: string): HTMLElement => {
  const found = document.querySelector(selector);
  if (found === null) throw new Error(`The draft shell is missing ${selector}.`);
  return found as HTMLElement;
};

const packRegion = element("#pack");
const statusRegion = element("#status");
const draftingHeading = element("#drafting-heading");
const reviewHeading = element("#review-heading");
const reviewPack = element("#review-pack");
const continueControl = element("#continue");
const poolRegion = element("#pool");
const poolGroupingRegion = element("#pool-grouping");
const poolCount = element("#pool-count");
const roundNumber = element("#round");
const pickNumber = element("#pick");
const restartControl = element("#restart");
const exportRegion = element("#export");
const exportLink = element("#export-link");
const exportList = element("#export-list") as HTMLTextAreaElement;
const exportCopy = element("#export-copy");
const exportStatus = element("#export-status");

/** The browser owns the entropy; every transition only maps caller-supplied samples. */
const nextUint32 = (): number => crypto.getRandomValues(new Uint32Array(1))[0] as number;

const deal = () => createTable(DEFAULT_SEAT_COUNT, OMENS_SET_SNAPSHOT, nextUint32);

let state = deal();
let grouping: PoolGrouping = "number";

/**
 * The pause between packs is presentation state; the draft itself has already advanced. While it
 * is set, the next pack waits behind the continue control and the pool is face up for review.
 */
let reviewing = false;

/**
 * While picking, the pile is face down: the pool region holds only this notice, and the cards
 * are genuinely absent rather than hidden with styling, as the accessibility notes require.
 */
const POOL_HIDDEN_NOTICE = "Pool hidden until the next review";

const hiddenPoolNotice = (): HTMLElement => {
  const notice = document.createElement("p");
  notice.className = "pool-hidden";
  notice.textContent = POOL_HIDDEN_NOTICE;
  return notice;
};

/**
 * Card art is decorative: the visible name beside it is already the accessible name, so a failed
 * image simply gets out of the way rather than leaving an unreadable card.
 */
const cardArt = (cardId: string): HTMLElement | null => {
  const identity = identities.get(cardId);
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
  name.textContent = card.label ?? card.cardId;
  return name;
};

/** Art first, then the name, so a card reads the same way whether or not its image loaded. */
const withArt = (host: HTMLElement, card: DraftCard): HTMLElement => {
  const art = cardArt(card.cardId);
  host.replaceChildren(...(art === null ? [named(card)] : [art, named(card)]));
  return host;
};

const cardControl = (card: DraftCard, round: number, pick: number): HTMLElement => {
  const control = document.createElement("button");
  control.setAttribute("type", "button");
  control.className = "card";
  control.onclick = () => choose(card.instanceId, round, pick);
  return withArt(control, card);
};

const poolCard = (card: DraftCard): HTMLElement => {
  const item = document.createElement("li");
  item.className = "pool-card";
  return withArt(item, card);
};

const poolGroup = (label: string, cards: readonly DraftCard[]): HTMLElement => {
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

const groupingControl = (choice: { id: PoolGrouping; label: string }): HTMLElement => {
  const control = document.createElement("button");
  control.setAttribute("type", "button");
  control.className = "grouping";
  control.setAttribute("aria-pressed", String(choice.id === grouping));
  control.textContent = choice.label;
  control.onclick = () => {
    grouping = choice.id;
    render();
  };
  return control;
};

const render = (): void => {
  const view = viewTable(state);
  roundNumber.textContent = String(view.round);
  pickNumber.textContent = String(view.pick);
  draftingHeading.hidden = reviewing;
  reviewHeading.hidden = !reviewing;
  reviewPack.textContent = String(view.round - 1);
  continueControl.hidden = !reviewing;
  continueControl.textContent = `Continue to pack ${view.round}`;
  statusRegion.textContent = reviewing
    ? `Pack ${view.round - 1} drafted. Review your pool. Pack ${view.round} passes ${
        view.passDirection === "left" ? "to the left" : "to the right"}.`
    : view.status;
  poolCount.textContent = String(view.pool.length);
  const poolFaceUp = reviewing || view.complete;
  poolGroupingRegion.hidden = !poolFaceUp;
  poolGroupingRegion.replaceChildren(...(poolFaceUp ? POOL_GROUPINGS.map(groupingControl) : []));
  poolRegion.replaceChildren(
    ...(poolFaceUp
      ? groupPool(view.pool, grouping, identities).map(({ label, cards }) => poolGroup(label, cards))
      : [hiddenPoolNotice()])
  );
  packRegion.replaceChildren(
    ...(reviewing ? [] : view.cards.map((card) => cardControl(card, view.round, view.pick)))
  );
  renderExport(view.complete, view.pool);
  if (view.complete) {
    statusRegion.tabIndex = -1;
    statusRegion.focus();
  }
};

/** The export appears only once there is a finished pool to export, and clears on a fresh deal. */
const renderExport = (complete: boolean, pool: readonly DraftCard[]): void => {
  exportRegion.hidden = !complete;
  exportStatus.textContent = "";
  if (!complete) return;
  const entries = fabraryEntries(pool, identities);
  exportList.value = fabraryTextList(entries);
  exportLink.setAttribute("href", fabraryImportLink(entries) ?? FABRARY_IMPORT_URL);
};

/** Copying is a convenience; the list stays selectable so a refusal never strands the drafter. */
exportCopy.onclick = () => {
  exportList.select();
  const copied = navigator.clipboard?.writeText(exportList.value);
  if (copied === undefined) {
    exportStatus.textContent = "Your browser would not copy it. The list is selected, so copy it yourself.";
    return;
  }
  copied.then(
    () => { exportStatus.textContent = "Copied."; },
    () => { exportStatus.textContent = "Your browser would not copy it. The list is selected, so copy it yourself."; }
  );
};

/** A captured round and pick reject any activation left over from a superseded pack. */
const choose = (instanceId: string, round: number, pick: number): void => {
  const view = viewTable(state);
  if (view.complete || view.round !== round || view.pick !== pick) return;
  state = chooseCard(state, instanceId, nextUint32);
  const after = viewTable(state);
  // A finished pack pauses the table for review; the finished draft reviews itself below.
  if (!after.complete && after.round !== round) reviewing = true;
  render();
  if (reviewing) {
    continueControl.focus();
    return;
  }
  (packRegion.firstChild as HTMLElement | null)?.focus();
};

continueControl.onclick = () => {
  reviewing = false;
  render();
  (packRegion.firstChild as HTMLElement | null)?.focus();
};

restartControl.onclick = () => {
  reviewing = false;
  state = deal();
  render();
};

render();
