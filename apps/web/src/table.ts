import {
  DraftRuleError,
  createDraft,
  pickCard,
  revealBarrier,
  runPendingBots,
  type BotPolicy,
  type DraftCard,
  type DraftSeat,
  type DraftState,
  type PassDirection
} from "@draft-table/draft";

import {
  PACK_SIZE,
  buildPacksByRound,
  drawBoundedTicket,
  type OmensSetSnapshot,
  type Uint32Source
} from "./cards.ts";

export const HUMAN_SEAT_ID = "seat-1";
export const DEFAULT_SEAT_COUNT = 8;

/**
 * One seat chooses once per pass until a pack holds a single card, which the draft commits
 * automatically. A fourteen-card pack therefore needs thirteen explicit choices per round.
 */
export const PICKS_PER_ROUND = PACK_SIZE - 1;

export interface TableView {
  readonly complete: boolean;
  readonly round: number;
  readonly pick: number;
  readonly passDirection: PassDirection;
  readonly packId: string;
  readonly heading: string;
  readonly status: string;
  readonly cards: readonly DraftCard[];
  readonly pool: readonly DraftCard[];
  readonly seatCount: number;
}

const EMPTY_CARDS: readonly DraftCard[] = Object.freeze([]);
const DIRECTION_WORDS = Object.freeze({ left: "to the left", right: "to the right" });

/** Bots choose uniformly from their legal cards through the same caller-owned samples. */
export const uniformBotPolicy = (random: Uint32Source): BotPolicy =>
  (context) => context.cards[drawBoundedTicket(context.cards.length, random)].instanceId;

/** Opens a table with the drafter in seat one and every remaining seat played by a bot. */
export const createTable = (
  seatCount: number,
  snapshot: OmensSetSnapshot,
  random: Uint32Source
): DraftState => {
  const seats: readonly DraftSeat[] = Array.from({ length: seatCount }, (unused, index) => ({
    id: index === 0 ? HUMAN_SEAT_ID : `seat-${index + 1}`,
    controller: index === 0 ? "human" : "bot"
  }));
  return createDraft({ seats, packsByRound: buildPacksByRound(seatCount, snapshot, random) });
};

/**
 * Commits one whole pass: the drafter's choice is queued, every bot queues through the ordinary
 * provisional transition, and the barrier reveals all of them atomically.
 */
export const chooseCard = (
  state: DraftState,
  cardInstanceId: string,
  random: Uint32Source
): DraftState => {
  if (state.status === "complete") {
    throw new DraftRuleError("DRAFT_COMPLETE", "The draft is already complete.");
  }
  const seat = state.seats.find(({ id }) => id === HUMAN_SEAT_ID);
  const choice = state.legalChoices.find(({ seatId }) => seatId === HUMAN_SEAT_ID);
  if (seat === undefined || seat.occupantId === null || choice === undefined) {
    throw new DraftRuleError("SEAT_VACANT", "No drafter seat is ready to choose.");
  }
  const queued = pickCard(state, {
    round: state.round,
    pick: state.pick,
    seatId: seat.id,
    occupantId: seat.occupantId,
    packId: choice.packId,
    cardInstanceId
  });
  return revealBarrier(runPendingBots(queued, uniformBotPolicy(random)), {
    type: "reveal",
    round: queued.round,
    pick: queued.pick
  });
};

/** Projects the drafter's own view of the table; it makes no decision and holds no state. */
export const viewTable = (state: DraftState): TableView => {
  const pool = state.pickedPools.find(({ seatId }) => seatId === HUMAN_SEAT_ID)?.cards ?? EMPTY_CARDS;
  const choice = state.legalChoices.find(({ seatId }) => seatId === HUMAN_SEAT_ID);
  const complete = state.status === "complete";
  const cards = complete || choice === undefined ? EMPTY_CARDS : choice.cards;
  return Object.freeze({
    complete,
    round: state.round,
    pick: state.pick,
    passDirection: state.passDirection,
    packId: choice?.packId ?? "",
    seatCount: state.seats.length,
    heading: complete ? "Draft complete" : `Round ${state.round} · Pick ${state.pick}`,
    status: complete
      ? `Draft complete. You drafted ${pool.length} cards.`
      : `Choose one of ${cards.length} cards. Packs then pass ${DIRECTION_WORDS[state.passDirection]}.`,
    cards,
    pool
  });
};
