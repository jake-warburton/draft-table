/** Minimum and maximum supported number of active drafting seats. */
export const MIN_DRAFT_SEATS = 2;
export const MAX_DRAFT_SEATS = 8;

export type DraftStatus = "picking" | "complete";
export type PassDirection = "left" | "right";
export type SeatController = "human" | "bot";
export type DraftRound = 1 | 2 | 3;

/** A card instance is opaque to the runtime beyond stable instance and card identities. */
export interface DraftCard {
  readonly instanceId: string;
  readonly cardId: string;
  readonly label?: string;
}

/** A pack supplied by product-specific collation code. */
export interface DraftPack {
  readonly id: string;
  readonly cards: readonly DraftCard[];
}

export interface DraftSeat {
  readonly id: string;
  readonly controller: SeatController;
}

export interface DraftSetup {
  readonly seats: readonly DraftSeat[];
  readonly packsByRound: readonly [
    readonly DraftPack[],
    readonly DraftPack[],
    readonly DraftPack[],
  ];
}

export interface PackInFlight extends DraftPack {
  readonly originSeatId: string;
  readonly atSeatId: string;
}

export interface PickedPool {
  readonly seatId: string;
  readonly cards: readonly DraftCard[];
}

export interface LegalChoice {
  readonly seatId: string;
  readonly packId: string;
  readonly cards: readonly DraftCard[];
}

/**
 * `pendingSeatIds` is the canonical seat-order subset still allowed to act in
 * the current simultaneous pick barrier. Packs pass only when it is empty.
 */
export interface DraftState {
  readonly status: DraftStatus;
  readonly seats: readonly DraftSeat[];
  readonly round: DraftRound;
  readonly pick: number;
  readonly passDirection: PassDirection;
  readonly packsInFlight: readonly PackInFlight[];
  readonly unopenedRounds: readonly (readonly DraftPack[])[];
  readonly pendingSeatIds: readonly string[];
  readonly pickedPools: readonly PickedPool[];
  readonly legalChoices: readonly LegalChoice[];
  readonly totalPicks: number;
}

export interface PickCardAction {
  readonly round: DraftRound;
  readonly pick: number;
  readonly seatId: string;
  readonly packId: string;
  readonly cardInstanceId: string;
}

export interface BotChoiceContext {
  readonly round: DraftRound;
  readonly pick: number;
  readonly passDirection: PassDirection;
  readonly seatId: string;
  readonly packId: string;
  readonly cards: readonly DraftCard[];
}

export type BotPolicy = (context: BotChoiceContext) => string;

export type DraftRuleErrorCode =
  | "INVALID_SETUP"
  | "MALFORMED_ACTION"
  | "DRAFT_COMPLETE"
  | "STALE_ACTION"
  | "UNKNOWN_SEAT"
  | "SEAT_ALREADY_PICKED"
  | "PACK_MISMATCH"
  | "CARD_NOT_IN_PACK"
  | "BOT_INVALID_CHOICE";

/** A rejected setup, action, or bot decision. No transition has occurred. */
export class DraftRuleError extends Error {
  readonly code: DraftRuleErrorCode;

  constructor(code: DraftRuleErrorCode, message: string) {
    super(message);
    this.name = "DraftRuleError";
    this.code = code;
  }
}

interface StateFields {
  readonly status: DraftStatus;
  readonly seats: readonly DraftSeat[];
  readonly round: DraftRound;
  readonly pick: number;
  readonly passDirection: PassDirection;
  readonly packsInFlight: readonly PackInFlight[];
  readonly unopenedRounds: readonly (readonly DraftPack[])[];
  readonly pendingSeatIds: readonly string[];
  readonly pickedPools: readonly PickedPool[];
  readonly totalPicks: number;
}

const fail = (code: DraftRuleErrorCode, message: string): never => {
  throw new DraftRuleError(code, message);
};

const frozenArray = <Value>(values: readonly Value[]): readonly Value[] =>
  Object.freeze(Array.from(values));

const isIdentifier = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.trim().length > 0;

const directionForRound = (round: DraftRound): PassDirection =>
  round === 2 ? "right" : "left";

const nextRound = (round: DraftRound): DraftRound => {
  if (round === 1) return 2;
  if (round === 2) return 3;
  return fail("INVALID_SETUP", "The third round has no successor.");
};

const copyCard = (value: unknown): DraftCard => {
  if (typeof value !== "object" || value === null) {
    return fail("INVALID_SETUP", "Every pack entry must be a card object.");
  }
  const candidate = value as Partial<DraftCard>;
  if (!isIdentifier(candidate.instanceId) || !isIdentifier(candidate.cardId)) {
    return fail("INVALID_SETUP", "Every card needs non-empty instanceId and cardId values.");
  }
  if (candidate.label !== undefined && !isIdentifier(candidate.label)) {
    return fail("INVALID_SETUP", "A card label, when present, must be non-empty.");
  }
  return Object.freeze({
    instanceId: candidate.instanceId,
    cardId: candidate.cardId,
    ...(candidate.label === undefined ? {} : { label: candidate.label }),
  });
};

const copyPack = (value: unknown, packIds: Set<string>, cardIds: Set<string>): DraftPack => {
  if (typeof value !== "object" || value === null) {
    return fail("INVALID_SETUP", "Every round entry must be a pack object.");
  }
  const candidate = value as Partial<DraftPack>;
  if (!isIdentifier(candidate.id) || !Array.isArray(candidate.cards)) {
    return fail("INVALID_SETUP", "Every pack needs a non-empty id and a cards array.");
  }
  if (packIds.has(candidate.id)) {
    return fail("INVALID_SETUP", `Duplicate pack id: ${candidate.id}`);
  }
  packIds.add(candidate.id);
  const cards = candidate.cards.map((entry) => copyCard(entry));
  if (cards.length === 0) {
    return fail("INVALID_SETUP", `Pack ${candidate.id} must contain at least one card.`);
  }
  for (const card of cards) {
    if (cardIds.has(card.instanceId)) {
      return fail("INVALID_SETUP", `Duplicate card instance id: ${card.instanceId}`);
    }
    cardIds.add(card.instanceId);
  }
  return Object.freeze({ id: candidate.id, cards: frozenArray(cards) });
};

const openPacks = (
  packs: readonly DraftPack[],
  seats: readonly DraftSeat[],
): readonly PackInFlight[] => frozenArray(packs.map((pack, index) => Object.freeze({
  id: pack.id,
  cards: pack.cards,
  originSeatId: seats[index].id,
  atSeatId: seats[index].id,
})));

const legalChoicesFor = (
  status: DraftStatus,
  packs: readonly PackInFlight[],
  pendingSeatIds: readonly string[],
): readonly LegalChoice[] => {
  if (status === "complete") return frozenArray([]);
  return frozenArray(pendingSeatIds.map((seatId) => {
    const pack = packs.find(({ atSeatId }) => atSeatId === seatId);
    if (pack === undefined) {
      return fail("INVALID_SETUP", `No active pack exists for pending seat ${seatId}.`);
    }
    return Object.freeze({ seatId, packId: pack.id, cards: pack.cards });
  }));
};

const makeState = (fields: StateFields): DraftState => Object.freeze({
  status: fields.status,
  seats: fields.seats,
  round: fields.round,
  pick: fields.pick,
  passDirection: fields.passDirection,
  packsInFlight: fields.packsInFlight,
  unopenedRounds: fields.unopenedRounds,
  pendingSeatIds: fields.pendingSeatIds,
  pickedPools: fields.pickedPools,
  legalChoices: legalChoicesFor(fields.status, fields.packsInFlight, fields.pendingSeatIds),
  totalPicks: fields.totalPicks,
});

/** Validates and snapshots all three rounds before exposing the initial state. */
export const createDraft = (input: DraftSetup): DraftState => {
  if (typeof input !== "object" || input === null || !Array.isArray(input.seats) ||
    !Array.isArray(input.packsByRound)) {
    return fail("INVALID_SETUP", "Draft setup must contain seats and packsByRound arrays.");
  }
  if (input.seats.length < MIN_DRAFT_SEATS || input.seats.length > MAX_DRAFT_SEATS) {
    return fail(
      "INVALID_SETUP",
      `Drafts require ${MIN_DRAFT_SEATS} to ${MAX_DRAFT_SEATS} seats.`,
    );
  }
  if (input.packsByRound.length !== 3) {
    return fail("INVALID_SETUP", "Draft setup must provide exactly three pack rounds.");
  }

  const seatIds = new Set<string>();
  const seats = input.seats.map((value) => {
    if (typeof value !== "object" || value === null) {
      return fail("INVALID_SETUP", "Every seat must be an object.");
    }
    const candidate = value as Partial<DraftSeat>;
    if (!isIdentifier(candidate.id) ||
      (candidate.controller !== "human" && candidate.controller !== "bot")) {
      return fail("INVALID_SETUP", "Every seat needs an id and human or bot controller.");
    }
    if (seatIds.has(candidate.id)) {
      return fail("INVALID_SETUP", `Duplicate seat id: ${candidate.id}`);
    }
    seatIds.add(candidate.id);
    return Object.freeze({ id: candidate.id, controller: candidate.controller });
  });
  if (!seats.some(({ controller }) => controller === "human")) {
    return fail("INVALID_SETUP", "A draft must contain at least one human-controlled seat.");
  }

  const packIds = new Set<string>();
  const cardInstanceIds = new Set<string>();
  const rounds = input.packsByRound.map((round, roundIndex) => {
    if (!Array.isArray(round) || round.length !== seats.length) {
      return fail(
        "INVALID_SETUP",
        `Round ${roundIndex + 1} must contain exactly one pack per seat.`,
      );
    }
    const packs = round.map((entry) => copyPack(entry, packIds, cardInstanceIds));
    const expectedSize = packs[0].cards.length;
    if (!packs.every(({ cards }) => cards.length === expectedSize)) {
      return fail(
        "INVALID_SETUP",
        `Every pack in round ${roundIndex + 1} must have the same non-zero size.`,
      );
    }
    return frozenArray(packs);
  });

  const frozenSeats = frozenArray(seats);
  const pickedPools = frozenArray(frozenSeats.map(({ id }) => Object.freeze({
    seatId: id,
    cards: frozenArray<DraftCard>([]),
  })));
  return makeState({
    status: "picking",
    seats: frozenSeats,
    round: 1,
    pick: 1,
    passDirection: directionForRound(1),
    packsInFlight: openPacks(rounds[0], frozenSeats),
    unopenedRounds: frozenArray([rounds[1], rounds[2]]),
    pendingSeatIds: frozenArray(frozenSeats.map(({ id }) => id)),
    pickedPools,
    totalPicks: 0,
  });
};

const isPickAction = (value: unknown): value is PickCardAction => {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<PickCardAction>;
  return (candidate.round === 1 || candidate.round === 2 || candidate.round === 3) &&
    Number.isSafeInteger(candidate.pick) && (candidate.pick as number) >= 1 &&
    isIdentifier(candidate.seatId) && isIdentifier(candidate.packId) &&
    isIdentifier(candidate.cardInstanceId);
};

const passPacks = (
  packs: readonly PackInFlight[],
  seats: readonly DraftSeat[],
  direction: PassDirection,
): readonly PackInFlight[] => {
  const destinationBySeat = new Map<string, string>();
  for (let index = 0; index < seats.length; index += 1) {
    const destinationIndex = direction === "left"
      ? (index + 1) % seats.length
      : (index - 1 + seats.length) % seats.length;
    destinationBySeat.set(seats[index].id, seats[destinationIndex].id);
  }
  const passed = packs.map((pack) => Object.freeze({
    id: pack.id,
    cards: pack.cards,
    originSeatId: pack.originSeatId,
    atSeatId: destinationBySeat.get(pack.atSeatId) as string,
  }));
  return frozenArray(seats.map(({ id }) => {
    const pack = passed.find(({ atSeatId }) => atSeatId === id);
    if (pack === undefined) {
      return fail("PACK_MISMATCH", `Passing produced no pack for seat ${id}.`);
    }
    return pack;
  }));
};

/**
 * Applies one seat's choice to the current pick barrier. Any legal pending seat
 * may act next; no pack passes and no pick advances until every seat has acted.
 */
export const pickCard = (state: DraftState, action: PickCardAction): DraftState => {
  if (state.status === "complete") {
    return fail("DRAFT_COMPLETE", "The draft is already complete.");
  }
  if (!isPickAction(action)) {
    return fail("MALFORMED_ACTION", "Pick action fields are malformed.");
  }
  if (action.round !== state.round || action.pick !== state.pick) {
    return fail("STALE_ACTION", "Pick action does not target the current round and pick.");
  }
  const seat = state.seats.find(({ id }) => id === action.seatId);
  if (seat === undefined) {
    return fail("UNKNOWN_SEAT", `Unknown seat: ${action.seatId}`);
  }
  if (!state.pendingSeatIds.includes(action.seatId)) {
    return fail("SEAT_ALREADY_PICKED", `Seat ${action.seatId} already acted in this pick.`);
  }
  const packIndex = state.packsInFlight.findIndex(({ atSeatId }) => atSeatId === action.seatId);
  const pack = state.packsInFlight[packIndex];
  if (pack === undefined || pack.id !== action.packId) {
    return fail("PACK_MISMATCH", "Pick action does not target the pack at that seat.");
  }
  const cardIndex = pack.cards.findIndex(({ instanceId }) =>
    instanceId === action.cardInstanceId);
  if (cardIndex < 0) {
    return fail("CARD_NOT_IN_PACK", "Pick action card is not in the active pack.");
  }

  const selectedCard = pack.cards[cardIndex];
  const remainingCards = frozenArray([
    ...pack.cards.slice(0, cardIndex),
    ...pack.cards.slice(cardIndex + 1),
  ]);
  const packsAfterPick = frozenArray(state.packsInFlight.map((candidate, index) =>
    index === packIndex ? Object.freeze({
      id: candidate.id,
      cards: remainingCards,
      originSeatId: candidate.originSeatId,
      atSeatId: candidate.atSeatId,
    }) : candidate));
  const poolsAfterPick = frozenArray(state.pickedPools.map((pool) =>
    pool.seatId === action.seatId ? Object.freeze({
      seatId: pool.seatId,
      cards: frozenArray([...pool.cards, selectedCard]),
    }) : pool));
  const pendingAfterPick = frozenArray(state.pendingSeatIds.filter((id) =>
    id !== action.seatId));
  const totalPicks = state.totalPicks + 1;

  if (pendingAfterPick.length > 0) {
    return makeState({
      ...state,
      packsInFlight: packsAfterPick,
      pendingSeatIds: pendingAfterPick,
      pickedPools: poolsAfterPick,
      totalPicks,
    });
  }

  const remainingPackSize = packsAfterPick[0].cards.length;
  if (remainingPackSize > 0) {
    return makeState({
      ...state,
      pick: state.pick + 1,
      packsInFlight: passPacks(packsAfterPick, state.seats, state.passDirection),
      pendingSeatIds: frozenArray(state.seats.map(({ id }) => id)),
      pickedPools: poolsAfterPick,
      totalPicks,
    });
  }

  if (state.unopenedRounds.length > 0) {
    const round = nextRound(state.round);
    return makeState({
      status: "picking",
      seats: state.seats,
      round,
      pick: 1,
      passDirection: directionForRound(round),
      packsInFlight: openPacks(state.unopenedRounds[0], state.seats),
      unopenedRounds: frozenArray(state.unopenedRounds.slice(1)),
      pendingSeatIds: frozenArray(state.seats.map(({ id }) => id)),
      pickedPools: poolsAfterPick,
      totalPicks,
    });
  }

  return makeState({
    status: "complete",
    seats: state.seats,
    round: 3,
    pick: state.pick,
    passDirection: directionForRound(3),
    packsInFlight: frozenArray([]),
    unopenedRounds: frozenArray([]),
    pendingSeatIds: frozenArray([]),
    pickedPools: poolsAfterPick,
    totalPicks,
  });
};

/** Strength-agnostic deterministic policy: choose the first offered card. */
export const firstCardBotPolicy: BotPolicy = (context) => {
  const selected = context.cards[0];
  if (selected === undefined) {
    return fail("BOT_INVALID_CHOICE", "A bot received no legal cards.");
  }
  return selected.instanceId;
};

/**
 * Resolves all bot-controlled seats in the current barrier, continuing only if
 * a bot's final action opens another barrier. It stops when human input is the
 * only input still pending or the draft completes.
 */
export const runPendingBots = (
  state: DraftState,
  policy: BotPolicy = firstCardBotPolicy,
): DraftState => {
  let current = state;
  while (current.status === "picking") {
    const botSeatId = current.pendingSeatIds.find((seatId) =>
      current.seats.find(({ id }) => id === seatId)?.controller === "bot");
    if (botSeatId === undefined) return current;
    const choice = current.legalChoices.find(({ seatId }) => seatId === botSeatId);
    if (choice === undefined) {
      return fail("BOT_INVALID_CHOICE", `Bot seat ${botSeatId} has no legal choice.`);
    }
    const context = Object.freeze({
      round: current.round,
      pick: current.pick,
      passDirection: current.passDirection,
      seatId: botSeatId,
      packId: choice.packId,
      cards: choice.cards,
    });
    const cardInstanceId = policy(context);
    if (!isIdentifier(cardInstanceId) ||
      !choice.cards.some(({ instanceId }) => instanceId === cardInstanceId)) {
      return fail("BOT_INVALID_CHOICE", `Bot policy selected an illegal card for ${botSeatId}.`);
    }
    current = pickCard(current, {
      round: current.round,
      pick: current.pick,
      seatId: botSeatId,
      packId: choice.packId,
      cardInstanceId,
    });
  }
  return current;
};
