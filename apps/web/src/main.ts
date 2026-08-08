import { OMENS_SET_SNAPSHOT } from "./cards.ts";
import { FABRARY_IMPORT_URL, fabraryEntries, fabraryImportLink, fabraryTextList } from "./fabrary.ts";
import { POOL_GROUPINGS, groupPool, type PoolGrouping } from "./pool.ts";
import { DEFAULT_SEAT_COUNT, chooseCard, createTable, viewTable } from "./table.ts";
import { cardControl, clearUnusableMarks, faceDownDeck, identities, poolGroup, usableIn } from "./table-render.ts";
import { initRoomsPage } from "./room-page.ts";
import type { DraftCard } from "@draft-table/draft";

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

/** The solo table stands down while a room is live; its state waits untouched. */
let soloActive = true;

/**
 * The page is three screens, not one long scroll: the door (create, join, or deal solo), the
 * table itself, and the results with the Fabrary hand-off. Exactly one shows at a time.
 */
type SoloScreen = "home" | "draft" | "results";
let soloScreen: SoloScreen = "home";

const roomsSection = element("#rooms");
const soloHome = element("#solo-table");
const packSection = element("#pack-section");
const poolSection = element("#pool-section");
const playAgain = element("#play-again");

const applySoloScreen = (): void => {
  roomsSection.hidden = soloScreen !== "home";
  soloHome.hidden = soloScreen !== "home";
  packSection.hidden = soloScreen !== "draft";
  poolSection.hidden = soloScreen === "home";
  playAgain.hidden = soloScreen !== "results";
};

/**
 * The pause between packs is presentation state; the draft itself has already advanced. While it
 * is set, the next pack waits behind the continue control and the pool is face up for review.
 */
let reviewing = false;


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

/** The heading counts what is still usable once any card has been marked out. */
const paintPoolCount = (pool: readonly DraftCard[]): void => {
  const usable = usableIn(pool);
  poolCount.textContent = usable === pool.length
    ? String(pool.length)
    : `${usable} of ${pool.length} usable`;
};

const render = (): void => {
  if (!soloActive) return;
  const view = viewTable(state);
  if (soloScreen === "draft" && view.complete) soloScreen = "results";
  applySoloScreen();
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
  paintPoolCount(view.pool);
  const poolFaceUp = reviewing || view.complete;
  poolGroupingRegion.hidden = !poolFaceUp;
  poolGroupingRegion.replaceChildren(...(poolFaceUp ? POOL_GROUPINGS.map(groupingControl) : []));
  // Face down, the pool is a deck of backs that thickens pick by pick; the cards themselves
  // are genuinely absent rather than hidden with styling, as the accessibility notes require.
  poolRegion.replaceChildren(
    ...(poolFaceUp
      ? groupPool(view.pool, grouping, identities)
          .map(({ label, cards }) => poolGroup(label, cards, () => paintPoolCount(view.pool)))
      : [faceDownDeck(view.pool.length)])
  );
  packRegion.replaceChildren(
    ...(reviewing
      ? []
      : view.cards.map((card) => cardControl(card, () => choose(card.instanceId, view.round, view.pick))))
  );
  renderExport(view.complete, view.pool);
  if (view.complete) {
    statusRegion.tabIndex = -1;
    statusRegion.focus();
  }
};

/** The export appears with the results — completion always turns the page there — and clears on a fresh deal. */
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

const dealFresh = (): void => {
  clearUnusableMarks();
  reviewing = false;
  soloScreen = "draft";
  state = deal();
  render();
  (packRegion.firstChild as HTMLElement | null)?.focus();
};

restartControl.onclick = dealFresh;
playAgain.onclick = dealFresh;

initRoomsPage({
  element,
  setSoloActive: (active) => {
    soloActive = active;
    if (active) {
      // Leaving a room lands back at the door, whatever the solo table was doing before.
      soloScreen = "home";
      render();
    } else {
      soloHome.hidden = true;
      playAgain.hidden = true;
    }
  }
});

render();
