/** Minimum and maximum supported number of drafting seats. */
export const MIN_DRAFT_SEATS = 2;
export const MAX_DRAFT_SEATS = 8;

export type DraftStatus = "picking" | "complete";
export type PassDirection = "left" | "right";
export type SeatController = "human" | "bot";
export type DraftRound = 1 | 2 | 3;

export interface DraftCard {
  readonly instanceId: string;
  readonly cardId: string;
  readonly label?: string;
}

export interface DraftPack {
  readonly id: string;
  readonly cards: readonly DraftCard[];
}

export interface DraftSeat {
  readonly id: string;
  readonly controller: SeatController;
  readonly occupantId?: string;
  readonly connected?: boolean;
}

export interface ActiveDraftSeat {
  readonly id: string;
  readonly controller: SeatController;
  readonly occupantId: string | null;
  readonly connected: boolean;
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

export interface ProvisionalPick {
  readonly round: DraftRound;
  readonly pick: number;
  readonly seatId: string;
  readonly occupantId: string;
  readonly packId: string;
  readonly cardInstanceId: string;
}

export interface DraftState {
  readonly status: DraftStatus;
  readonly seats: readonly ActiveDraftSeat[];
  readonly round: DraftRound;
  readonly pick: number;
  readonly passDirection: PassDirection;
  readonly packsInFlight: readonly PackInFlight[];
  readonly unopenedRounds: readonly (readonly DraftPack[])[];
  readonly provisionalPicks: readonly ProvisionalPick[];
  readonly pendingSeatIds: readonly string[];
  readonly pickedPools: readonly PickedPool[];
  readonly legalChoices: readonly LegalChoice[];
  readonly totalPicks: number;
}

export interface PickCardAction {
  readonly round: DraftRound;
  readonly pick: number;
  readonly seatId: string;
  readonly occupantId: string;
  readonly packId: string;
  readonly cardInstanceId: string;
}

export interface BarrierIntent {
  readonly type: "reveal";
  readonly round: DraftRound;
  readonly pick: number;
}

export interface TimeoutIntent {
  readonly type: "timeout";
  readonly round: DraftRound;
  readonly pick: number;
}

export interface RandomFallbackIntent {
  readonly type: "random-fallback";
  readonly round: DraftRound;
  readonly pick: number;
  readonly seatId: string;
  readonly packId: string;
}

/** Caller-owned entropy. The runtime only performs unbiased bounded mapping. */
export interface DraftRandomSource {
  nextUint32(): number;
}

export interface SeatPresenceAction {
  readonly round: DraftRound;
  readonly pick: number;
  readonly seatId: string;
  readonly occupantId: string;
}

export interface FillSeatAction {
  readonly round: DraftRound;
  readonly pick: number;
  readonly seatId: string;
  readonly occupantId: string;
  readonly controller: SeatController;
  readonly connected?: boolean;
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
  | "OCCUPANT_MISMATCH"
  | "SEAT_OCCUPIED"
  | "SEAT_VACANT"
  | "PACK_MISMATCH"
  | "CARD_NOT_IN_PACK"
  | "BARRIER_NOT_READY"
  | "FALLBACK_MISMATCH"
  | "INVALID_RANDOM_SAMPLE"
  | "BOT_INVALID_CHOICE";

export class DraftRuleError extends Error {
  readonly code: DraftRuleErrorCode;

  constructor(code: DraftRuleErrorCode, message: string) {
    super(message);
    this.name = "DraftRuleError";
    this.code = code;
  }
}

interface StateFields extends Omit<DraftState, "legalChoices" | "pendingSeatIds"> {}

function fail(code: DraftRuleErrorCode, message: string): never {
  throw new DraftRuleError(code, message);
}
const frozenArray = <T>(values: readonly T[]): readonly T[] => Object.freeze(Array.from(values));
const isIdentifier = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.trim().length > 0;
const directionForRound = (round: DraftRound): PassDirection => round === 2 ? "right" : "left";
const nextRound = (round: DraftRound): DraftRound =>
  round === 1 ? 2 : round === 2 ? 3 : fail("INVALID_SETUP", "The third round has no successor.");

const copyCard = (value: unknown): DraftCard => {
  if (typeof value !== "object" || value === null) fail("INVALID_SETUP", "Every pack entry must be a card object.");
  const candidate = value as Partial<DraftCard>;
  if (!isIdentifier(candidate.instanceId) || !isIdentifier(candidate.cardId)) {
    fail("INVALID_SETUP", "Every card needs non-empty instanceId and cardId values.");
  }
  if (candidate.label !== undefined && !isIdentifier(candidate.label)) {
    fail("INVALID_SETUP", "A card label, when present, must be non-empty.");
  }
  return Object.freeze({ instanceId: candidate.instanceId, cardId: candidate.cardId,
    ...(candidate.label === undefined ? {} : { label: candidate.label }) });
};

const copyPack = (value: unknown, packIds: Set<string>, cardIds: Set<string>): DraftPack => {
  if (typeof value !== "object" || value === null) fail("INVALID_SETUP", "Every round entry must be a pack object.");
  const candidate = value as Partial<DraftPack>;
  if (!isIdentifier(candidate.id) || !Array.isArray(candidate.cards)) {
    fail("INVALID_SETUP", "Every pack needs a non-empty id and a cards array.");
  }
  if (packIds.has(candidate.id)) fail("INVALID_SETUP", `Duplicate pack id: ${candidate.id}`);
  packIds.add(candidate.id);
  const cards = candidate.cards.map(copyCard);
  if (cards.length === 0) fail("INVALID_SETUP", `Pack ${candidate.id} must contain at least one card.`);
  for (const card of cards) {
    if (cardIds.has(card.instanceId)) fail("INVALID_SETUP", `Duplicate card instance id: ${card.instanceId}`);
    cardIds.add(card.instanceId);
  }
  return Object.freeze({ id: candidate.id, cards: frozenArray(cards) });
};

const openPacks = (packs: readonly DraftPack[], seats: readonly ActiveDraftSeat[]): readonly PackInFlight[] =>
  frozenArray(packs.map((pack, index) => Object.freeze({ ...pack, originSeatId: seats[index].id, atSeatId: seats[index].id })));

const makeState = (fields: StateFields): DraftState => {
  const queued = new Set(fields.provisionalPicks.map(({ seatId }) => seatId));
  const pendingSeatIds = fields.status === "complete" ? frozenArray<string>([]) :
    frozenArray(fields.seats.filter(({ id }) => !queued.has(id)).map(({ id }) => id));
  const legalChoices = fields.status === "complete" ? frozenArray<LegalChoice>([]) :
    frozenArray(fields.seats.flatMap((seat) => {
      if (seat.occupantId === null || !seat.connected) return [];
      const pack = fields.packsInFlight.find(({ atSeatId }) => atSeatId === seat.id);
      if (pack === undefined) fail("PACK_MISMATCH", `No active pack exists for seat ${seat.id}.`);
      return [Object.freeze({ seatId: seat.id, packId: pack.id, cards: pack.cards })];
    }));
  return Object.freeze({ ...fields, pendingSeatIds, legalChoices });
};

export const createDraft = (input: DraftSetup): DraftState => {
  if (typeof input !== "object" || input === null || !Array.isArray(input.seats) || !Array.isArray(input.packsByRound)) {
    fail("INVALID_SETUP", "Draft setup must contain seats and packsByRound arrays.");
  }
  if (input.seats.length < MIN_DRAFT_SEATS || input.seats.length > MAX_DRAFT_SEATS) {
    fail("INVALID_SETUP", `Drafts require ${MIN_DRAFT_SEATS} to ${MAX_DRAFT_SEATS} seats.`);
  }
  if (input.packsByRound.length !== 3) fail("INVALID_SETUP", "Draft setup must provide exactly three pack rounds.");
  const seatIds = new Set<string>();
  const occupantIds = new Set<string>();
  const seats = input.seats.map((value) => {
    if (typeof value !== "object" || value === null) fail("INVALID_SETUP", "Every seat must be an object.");
    const candidate = value as DraftSeat;
    if (!isIdentifier(candidate.id) || (candidate.controller !== "human" && candidate.controller !== "bot") ||
      (candidate.occupantId !== undefined && !isIdentifier(candidate.occupantId)) ||
      (candidate.connected !== undefined && typeof candidate.connected !== "boolean")) {
      fail("INVALID_SETUP", "Every seat needs valid identity, controller, and presence fields.");
    }
    if (seatIds.has(candidate.id)) fail("INVALID_SETUP", `Duplicate seat id: ${candidate.id}`);
    const occupantId = candidate.occupantId ?? candidate.id;
    if (occupantIds.has(occupantId)) fail("INVALID_SETUP", `Duplicate occupant id: ${occupantId}`);
    seatIds.add(candidate.id); occupantIds.add(occupantId);
    return Object.freeze({ id: candidate.id, controller: candidate.controller, occupantId,
      connected: candidate.connected ?? true });
  });
  if (!seats.some(({ controller }) => controller === "human")) fail("INVALID_SETUP", "A draft must contain a human seat.");
  const packIds = new Set<string>(); const cardIds = new Set<string>();
  const rounds = input.packsByRound.map((round, index) => {
    if (!Array.isArray(round) || round.length !== seats.length) {
      fail("INVALID_SETUP", `Round ${index + 1} must contain exactly one pack per seat.`);
    }
    const packs = round.map((pack) => copyPack(pack, packIds, cardIds));
    if (!packs.every(({ cards }) => cards.length === packs[0].cards.length)) {
      fail("INVALID_SETUP", `Every pack in round ${index + 1} must have the same non-zero size.`);
    }
    return frozenArray(packs);
  });
  const frozenSeats = frozenArray(seats);
  return makeState({ status: "picking", seats: frozenSeats, round: 1, pick: 1,
    passDirection: "left", packsInFlight: openPacks(rounds[0], frozenSeats),
    unopenedRounds: frozenArray([rounds[1], rounds[2]]), provisionalPicks: frozenArray([]),
    pickedPools: frozenArray(frozenSeats.map(({ id }) => Object.freeze({ seatId: id, cards: frozenArray<DraftCard>([]) }))),
    totalPicks: 0 });
};

const validateCurrent = (state: DraftState, action: { readonly round: DraftRound; readonly pick: number }): void => {
  if (state.status === "complete") fail("DRAFT_COMPLETE", "The draft is already complete.");
  if (action.round !== state.round || action.pick !== state.pick) fail("STALE_ACTION", "Intent does not target the current round and pick.");
};
const isCurrentFields = (value: unknown): value is { round: DraftRound; pick: number } => {
  if (typeof value !== "object" || value === null) return false;
  const action = value as { round?: unknown; pick?: unknown };
  return (action.round === 1 || action.round === 2 || action.round === 3) && Number.isSafeInteger(action.pick) && (action.pick as number) >= 1;
};

/** Queues or replaces a provisional selection without moving a card or revealing any pick. */
export const pickCard = (state: DraftState, action: PickCardAction): DraftState => {
  if (!isCurrentFields(action) || !isIdentifier(action.seatId) || !isIdentifier(action.occupantId) ||
    !isIdentifier(action.packId) || !isIdentifier(action.cardInstanceId)) fail("MALFORMED_ACTION", "Pick action fields are malformed.");
  validateCurrent(state, action);
  const seat = state.seats.find(({ id }) => id === action.seatId);
  if (seat === undefined) fail("UNKNOWN_SEAT", `Unknown seat: ${action.seatId}`);
  if (seat.occupantId !== action.occupantId) fail("OCCUPANT_MISMATCH", "Pick action occupant does not own that seat.");
  if (!seat.connected) fail("OCCUPANT_MISMATCH", "A disconnected occupant cannot queue a pick.");
  const pack = state.packsInFlight.find(({ atSeatId }) => atSeatId === seat.id);
  if (pack === undefined || pack.id !== action.packId) fail("PACK_MISMATCH", "Pick action does not target the pack at that seat.");
  if (!pack.cards.some(({ instanceId }) => instanceId === action.cardInstanceId)) fail("CARD_NOT_IN_PACK", "Pick action card is not in the active pack.");
  const provisional = Object.freeze({ ...action });
  const priorIndex = state.provisionalPicks.findIndex(({ seatId }) => seatId === seat.id);
  if (priorIndex >= 0 && state.provisionalPicks[priorIndex].cardInstanceId === action.cardInstanceId) {
    return state;
  }
  const picks = priorIndex < 0 ? [...state.provisionalPicks, provisional] :
    state.provisionalPicks.map((pick, index) => index === priorIndex ? provisional : pick);
  return makeState({ ...state, provisionalPicks: frozenArray(picks) });
};

const isPresenceAction = (value: unknown): value is SeatPresenceAction => isCurrentFields(value) &&
  isIdentifier((value as Partial<SeatPresenceAction>).seatId) && isIdentifier((value as Partial<SeatPresenceAction>).occupantId);
const updatePresence = (state: DraftState, action: SeatPresenceAction, connected: boolean): DraftState => {
  if (!isPresenceAction(action)) fail("MALFORMED_ACTION", "Presence action fields are malformed.");
  validateCurrent(state, action);
  const seat = state.seats.find(({ id }) => id === action.seatId);
  if (seat === undefined) fail("UNKNOWN_SEAT", `Unknown seat: ${action.seatId}`);
  if (seat.occupantId !== action.occupantId) fail("OCCUPANT_MISMATCH", "Presence action occupant does not own that seat.");
  return makeState({ ...state, seats: frozenArray(state.seats.map((candidate) => candidate.id === seat.id ?
    Object.freeze({ ...candidate, connected }) : candidate)) });
};

/** Disconnecting preserves both seat ownership and any provisional selection. */
export const disconnectSeat = (state: DraftState, action: SeatPresenceAction): DraftState => updatePresence(state, action, false);
export const reconnectSeat = (state: DraftState, action: SeatPresenceAction): DraftState => updatePresence(state, action, true);

/** Vacating clears the old occupant's provisional selection in the same transition. */
export const vacateSeat = (state: DraftState, action: SeatPresenceAction): DraftState => {
  if (!isPresenceAction(action)) fail("MALFORMED_ACTION", "Vacate action fields are malformed.");
  validateCurrent(state, action);
  const seat = state.seats.find(({ id }) => id === action.seatId);
  if (seat === undefined) fail("UNKNOWN_SEAT", `Unknown seat: ${action.seatId}`);
  if (seat.occupantId !== action.occupantId) fail("OCCUPANT_MISMATCH", "Vacate action occupant does not own that seat.");
  return makeState({ ...state,
    seats: frozenArray(state.seats.map((candidate) => candidate.id === seat.id ? Object.freeze({ ...candidate, occupantId: null, connected: false }) : candidate)),
    provisionalPicks: frozenArray(state.provisionalPicks.filter(({ seatId }) => seatId !== seat.id)) });
};

/** A replacement inherits the seat, pack, and pool, but never a queued pick. */
export const fillSeat = (state: DraftState, action: FillSeatAction): DraftState => {
  if (!isCurrentFields(action) || !isIdentifier(action.seatId) || !isIdentifier(action.occupantId) ||
    (action.controller !== "human" && action.controller !== "bot") ||
    (action.connected !== undefined && typeof action.connected !== "boolean")) fail("MALFORMED_ACTION", "Fill action fields are malformed.");
  validateCurrent(state, action);
  const seat = state.seats.find(({ id }) => id === action.seatId);
  if (seat === undefined) fail("UNKNOWN_SEAT", `Unknown seat: ${action.seatId}`);
  if (seat.occupantId !== null) fail("SEAT_OCCUPIED", `Seat ${seat.id} is occupied.`);
  if (state.seats.some(({ occupantId }) => occupantId === action.occupantId)) fail("SEAT_OCCUPIED", "Occupant already owns another seat.");
  return makeState({ ...state, seats: frozenArray(state.seats.map((candidate) => candidate.id === seat.id ?
    Object.freeze({ ...candidate, occupantId: action.occupantId, controller: action.controller, connected: action.connected ?? true }) : candidate)) });
};

const passPacks = (packs: readonly PackInFlight[], seats: readonly ActiveDraftSeat[], direction: PassDirection): readonly PackInFlight[] => {
  const destination = new Map<string, string>();
  seats.forEach((seat, index) => destination.set(seat.id, seats[direction === "left" ? (index + 1) % seats.length : (index - 1 + seats.length) % seats.length].id));
  const passed = packs.map((pack) => Object.freeze({ ...pack, atSeatId: destination.get(pack.atSeatId) as string }));
  return frozenArray(seats.map(({ id }) => passed.find(({ atSeatId }) => atSeatId === id) as PackInFlight));
};

const commitPicks = (state: DraftState, picks: readonly ProvisionalPick[]): DraftState => {
  const selected = new Map(picks.map((pick) => [pick.seatId, pick]));
  const selectedCards = new Map<string, DraftCard>();
  const reducedPacks = frozenArray(state.packsInFlight.map((pack) => {
    const pick = selected.get(pack.atSeatId);
    if (pick === undefined || pick.packId !== pack.id) fail("FALLBACK_MISMATCH", "Barrier has no exact selection for every pack.");
    const index = pack.cards.findIndex(({ instanceId }) => instanceId === pick.cardInstanceId);
    if (index < 0) fail("CARD_NOT_IN_PACK", "A provisional card is no longer in its pack.");
    selectedCards.set(pack.atSeatId, pack.cards[index]);
    return Object.freeze({ ...pack, cards: frozenArray([...pack.cards.slice(0, index), ...pack.cards.slice(index + 1)]) });
  }));
  let committedBySeat = state.seats.map(({ id }) => frozenArray([selectedCards.get(id) as DraftCard]));
  let totalPicks = state.totalPicks + state.seats.length;
  let packs = reducedPacks;
  if (reducedPacks[0].cards.length === 1) {
    packs = passPacks(reducedPacks, state.seats, state.passDirection);
    committedBySeat = state.seats.map(({ id }, index) => frozenArray([...committedBySeat[index],
      (packs.find(({ atSeatId }) => atSeatId === id) as PackInFlight).cards[0]]));
    totalPicks += state.seats.length;
    packs = frozenArray(packs.map((pack) => Object.freeze({ ...pack, cards: frozenArray<DraftCard>([]) })));
  }
  const pools = frozenArray(state.pickedPools.map((pool, index) => Object.freeze({ ...pool,
    cards: frozenArray([...pool.cards, ...committedBySeat[index]]) })));
  if (packs[0].cards.length > 0) return makeState({ ...state, pick: state.pick + 1,
    packsInFlight: passPacks(packs, state.seats, state.passDirection), provisionalPicks: frozenArray([]), pickedPools: pools, totalPicks });
  if (state.unopenedRounds.length > 0) {
    const round = nextRound(state.round);
    return makeState({ ...state, round, pick: 1, passDirection: directionForRound(round),
      packsInFlight: openPacks(state.unopenedRounds[0], state.seats), unopenedRounds: frozenArray(state.unopenedRounds.slice(1)),
      provisionalPicks: frozenArray([]), pickedPools: pools, totalPicks });
  }
  return makeState({ ...state, status: "complete", packsInFlight: frozenArray([]), unopenedRounds: frozenArray([]),
    provisionalPicks: frozenArray([]), pickedPools: pools, totalPicks });
};

/** Reveals and commits a complete provisional barrier atomically. */
export const revealBarrier = (state: DraftState, intent: BarrierIntent): DraftState => {
  if (!isCurrentFields(intent) || intent.type !== "reveal") fail("MALFORMED_ACTION", "Reveal intent fields are malformed.");
  validateCurrent(state, intent);
  if (state.provisionalPicks.length !== state.seats.length) fail("BARRIER_NOT_READY", "Every seat must have a provisional pick.");
  return commitPicks(state, state.provisionalPicks);
};

const boundedIndex = (upperExclusive: number, random: DraftRandomSource): number => {
  const range = 0x1_0000_0000;
  const limit = Math.floor(range / upperExclusive) * upperExclusive;
  for (;;) {
    const sample = random.nextUint32();
    if (!Number.isInteger(sample) || sample < 0 || sample >= range) fail("INVALID_RANDOM_SAMPLE", "Random source must return uint32 values.");
    if (sample < limit) return sample % upperExclusive;
  }
};

/** Commits queued choices and resolves every absent choice through caller-owned entropy. */
export const resolveTimeout = (
  state: DraftState,
  timeout: TimeoutIntent,
  fallbacks: readonly RandomFallbackIntent[],
  random: DraftRandomSource,
): DraftState => {
  if (!isCurrentFields(timeout) || timeout.type !== "timeout" || !Array.isArray(fallbacks) ||
    typeof random !== "object" || random === null || typeof random.nextUint32 !== "function") {
    fail("MALFORMED_ACTION", "Timeout resolution fields are malformed.");
  }
  validateCurrent(state, timeout);
  const queued = new Set(state.provisionalPicks.map(({ seatId }) => seatId));
  const missing = state.seats.filter(({ id }) => !queued.has(id));
  if (fallbacks.length !== missing.length) fail("FALLBACK_MISMATCH", "Fallback intents must exactly cover unqueued seats.");
  const validatedFallbacks = fallbacks.map((value) => {
    const intent: RandomFallbackIntent = value;
    if (!isCurrentFields(value) || intent.type !== "random-fallback" ||
      !isIdentifier(intent.seatId) || !isIdentifier(intent.packId)) {
      fail("MALFORMED_ACTION", "Random fallback intent fields are malformed.");
    }
    return intent;
  });
  const missingIds = new Set(missing.map(({ id }) => id));
  const fallbackBySeat = new Map<string, RandomFallbackIntent>();
  for (const intent of validatedFallbacks) {
    if (intent.round !== state.round || intent.pick !== state.pick) fail("STALE_ACTION", "Fallback intent does not target the current round and pick.");
    if (!missingIds.has(intent.seatId) || fallbackBySeat.has(intent.seatId)) {
      fail("FALLBACK_MISMATCH", "Fallback intents must exactly cover unqueued seats once.");
    }
    const pack = state.packsInFlight.find(({ atSeatId }) => atSeatId === intent.seatId);
    if (pack === undefined || intent.packId !== pack.id) fail("FALLBACK_MISMATCH", `Invalid fallback intent for ${intent.seatId}.`);
    fallbackBySeat.set(intent.seatId, intent);
  }
  if (fallbackBySeat.size !== missing.length) fail("FALLBACK_MISMATCH", "Fallback intents must exactly cover unqueued seats.");
  const fallbackPicks = missing.map((seat) => {
    const intent = fallbackBySeat.get(seat.id) as RandomFallbackIntent;
    const pack = state.packsInFlight.find(({ atSeatId }) => atSeatId === seat.id) as PackInFlight;
    const card = pack.cards[boundedIndex(pack.cards.length, random)];
    return Object.freeze({ round: state.round, pick: state.pick, seatId: seat.id,
      occupantId: seat.occupantId ?? "random-fallback", packId: intent.packId, cardInstanceId: card.instanceId });
  });
  return commitPicks(state, frozenArray([...state.provisionalPicks, ...fallbackPicks]));
};

export const firstCardBotPolicy: BotPolicy = (context) => {
  const selected = context.cards[0];
  if (selected === undefined) fail("BOT_INVALID_CHOICE", "A bot received no legal cards.");
  return selected.instanceId;
};

/** Queues each connected bot through the ordinary provisional-pick transition. */
export const runPendingBots = (state: DraftState, policy: BotPolicy = firstCardBotPolicy): DraftState => {
  let current = state;
  for (;;) {
    if (current.status === "complete") return current;
    const bot = current.seats.find((seat) => seat.controller === "bot" && seat.connected && seat.occupantId !== null &&
      !current.provisionalPicks.some(({ seatId }) => seatId === seat.id));
    if (bot === undefined) return current;
    const choice = current.legalChoices.find(({ seatId }) => seatId === bot.id);
    if (choice === undefined) fail("BOT_INVALID_CHOICE", `Bot seat ${bot.id} has no legal choice.`);
    const context = Object.freeze({ round: current.round, pick: current.pick, passDirection: current.passDirection,
      seatId: bot.id, packId: choice.packId, cards: choice.cards });
    const cardInstanceId = policy(context);
    if (!isIdentifier(cardInstanceId) || !choice.cards.some(({ instanceId }) => instanceId === cardInstanceId)) {
      fail("BOT_INVALID_CHOICE", `Bot policy selected an illegal card for ${bot.id}.`);
    }
    current = pickCard(current, { round: current.round, pick: current.pick, seatId: bot.id,
      occupantId: bot.occupantId as string, packId: choice.packId, cardInstanceId });
  }
};
