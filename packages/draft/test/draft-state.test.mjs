import assert from "node:assert/strict";
import test from "node:test";

import {
  DraftRuleError,
  MAX_DRAFT_SEATS,
  MIN_DRAFT_SEATS,
  createDraft,
  firstCardBotPolicy,
  pickCard,
  runPendingBots,
} from "../src/index.ts";

const card = (round, pack, position) => ({
  instanceId: `r${round}-p${pack}-c${position}`,
  cardId: `card-${round}-${pack}-${position}`,
  label: `Card ${round}/${pack}/${position}`,
});

const makeSetup = ({
  seatCount = 2,
  cardsPerRound = [2, 2, 2],
  controllers = Array.from({ length: seatCount }, () => "human"),
} = {}) => ({
  seats: Array.from({ length: seatCount }, (_, index) => ({
    id: `seat-${index}`,
    controller: controllers[index],
  })),
  packsByRound: cardsPerRound.map((cardsPerPack, roundIndex) =>
    Array.from({ length: seatCount }, (_, packIndex) => ({
      id: `round-${roundIndex + 1}-pack-${packIndex}`,
      cards: Array.from({ length: cardsPerPack }, (_, cardIndex) =>
        card(roundIndex + 1, packIndex, cardIndex)
      ),
    }))
  ),
});

const choiceFor = (state, seatId) =>
  state.legalChoices.find((choice) => choice.seatId === seatId);

const actionFor = (state, seatId, cardIndex = 0) => {
  const choice = choiceFor(state, seatId);
  assert.ok(choice, `expected a legal choice for ${seatId}`);
  return {
    round: state.round,
    pick: state.pick,
    seatId,
    packId: choice.packId,
    cardInstanceId: choice.cards[cardIndex].instanceId,
  };
};

const pickBarrier = (initialState, cardIndex = 0) => {
  let state = initialState;
  for (const seatId of initialState.pendingSeatIds) {
    state = pickCard(state, actionFor(state, seatId, cardIndex));
  }
  return state;
};

const finishDraft = (initialState) => {
  let state = initialState;
  while (state.status === "picking") {
    state = pickBarrier(state);
  }
  return state;
};

const assertDeepFrozen = (value, seen = new Set()) => {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child, seen);
};

const expectRuleError = (fn, code) =>
  assert.throws(fn, (error) => {
    assert.ok(error instanceof DraftRuleError);
    assert.equal(error.code, code);
    return true;
  });

test("setup creates a deeply immutable first-round state and detached input snapshot", () => {
  const input = makeSetup({ seatCount: MIN_DRAFT_SEATS });
  const state = createDraft(input);

  assert.equal(MIN_DRAFT_SEATS, 2);
  assert.equal(MAX_DRAFT_SEATS, 8);
  assert.equal(state.status, "picking");
  assert.equal(state.round, 1);
  assert.equal(state.pick, 1);
  assert.equal(state.passDirection, "left");
  assert.deepEqual(state.pendingSeatIds, ["seat-0", "seat-1"]);
  assert.deepEqual(
    state.packsInFlight.map(({ id, atSeatId, originSeatId }) => ({
      id,
      atSeatId,
      originSeatId,
    })),
    [
      { id: "round-1-pack-0", atSeatId: "seat-0", originSeatId: "seat-0" },
      { id: "round-1-pack-1", atSeatId: "seat-1", originSeatId: "seat-1" },
    ]
  );
  assert.deepEqual(
    state.legalChoices.map(({ seatId, packId, cards }) => ({
      seatId,
      packId,
      cards: cards.map(({ instanceId }) => instanceId),
    })),
    [
      {
        seatId: "seat-0",
        packId: "round-1-pack-0",
        cards: ["r1-p0-c0", "r1-p0-c1"],
      },
      {
        seatId: "seat-1",
        packId: "round-1-pack-1",
        cards: ["r1-p1-c0", "r1-p1-c1"],
      },
    ]
  );
  assertDeepFrozen(state);

  input.seats[0].id = "changed";
  input.packsByRound[0][0].cards[0].label = "changed";
  assert.equal(state.seats[0].id, "seat-0");
  assert.equal(state.packsInFlight[0].cards[0].label, "Card 1/0/0");
});

test("a pick barrier removes cards immediately but passes packs only after every seat picks", () => {
  const initial = createDraft(makeSetup({ seatCount: 3 }));
  const afterOne = pickCard(initial, actionFor(initial, "seat-1"));

  assert.equal(afterOne.round, 1);
  assert.equal(afterOne.pick, 1);
  assert.deepEqual(afterOne.pendingSeatIds, ["seat-0", "seat-2"]);
  assert.equal(choiceFor(afterOne, "seat-1"), undefined);
  assert.deepEqual(
    afterOne.packsInFlight.map(({ atSeatId }) => atSeatId),
    ["seat-0", "seat-1", "seat-2"]
  );
  assert.equal(afterOne.packsInFlight[1].cards.length, 1);
  assert.deepEqual(afterOne.pickedPools[1].cards.map(({ instanceId }) => instanceId), [
    "r1-p1-c0",
  ]);

  const afterBarrier = pickBarrier(afterOne);
  assert.equal(afterBarrier.pick, 2);
  assert.deepEqual(afterBarrier.pendingSeatIds, ["seat-0", "seat-1", "seat-2"]);
  assert.deepEqual(
    afterBarrier.packsInFlight.map(({ id, atSeatId }) => ({ id, atSeatId })),
    [
      { id: "round-1-pack-2", atSeatId: "seat-0" },
      { id: "round-1-pack-0", atSeatId: "seat-1" },
      { id: "round-1-pack-1", atSeatId: "seat-2" },
    ]
  );
  assert.equal(initial.packsInFlight[1].cards.length, 2);
  assert.equal(initial.pickedPools[1].cards.length, 0);
});

test("three rounds pass left, right, left and preserve each seat's chronological pool order", () => {
  let state = createDraft(makeSetup({ seatCount: 3 }));

  assert.equal(state.passDirection, "left");
  state = pickBarrier(state);
  state = pickBarrier(state);
  assert.equal(state.round, 2);
  assert.equal(state.pick, 1);
  assert.equal(state.passDirection, "right");

  state = pickBarrier(state);
  assert.deepEqual(
    state.packsInFlight.map(({ id, atSeatId }) => ({ id, atSeatId })),
    [
      { id: "round-2-pack-1", atSeatId: "seat-0" },
      { id: "round-2-pack-2", atSeatId: "seat-1" },
      { id: "round-2-pack-0", atSeatId: "seat-2" },
    ]
  );
  state = pickBarrier(state);
  assert.equal(state.round, 3);
  assert.equal(state.passDirection, "left");
  state = finishDraft(state);

  assert.equal(state.status, "complete");
  assert.deepEqual(
    state.pickedPools[0].cards.map(({ instanceId }) => instanceId),
    ["r1-p0-c0", "r1-p2-c1", "r2-p0-c0", "r2-p1-c1", "r3-p0-c0", "r3-p2-c1"]
  );
});

test("left and right rotations wrap correctly for odd and even seat counts", () => {
  for (const seatCount of [3, 4]) {
    let state = createDraft(makeSetup({ seatCount, cardsPerRound: [2, 2, 1] }));
    state = pickBarrier(state);
    for (let origin = 0; origin < seatCount; origin += 1) {
      const pack = state.packsInFlight.find((candidate) => candidate.originSeatId === `seat-${origin}`);
      assert.equal(pack.atSeatId, `seat-${(origin + 1) % seatCount}`);
    }

    state = pickBarrier(state);
    assert.equal(state.passDirection, "right");
    state = pickBarrier(state);
    for (let origin = 0; origin < seatCount; origin += 1) {
      const pack = state.packsInFlight.find((candidate) => candidate.originSeatId === `seat-${origin}`);
      assert.equal(pack.atSeatId, `seat-${(origin - 1 + seatCount) % seatCount}`);
    }
  }
});

test("pack exhaustion starts the next round without an empty-pack pick window", () => {
  let state = createDraft(makeSetup({ cardsPerRound: [1, 2, 1] }));
  state = pickBarrier(state);

  assert.equal(state.round, 2);
  assert.equal(state.pick, 1);
  assert.equal(state.passDirection, "right");
  assert.deepEqual(state.packsInFlight.map(({ id }) => id), [
    "round-2-pack-0",
    "round-2-pack-1",
  ]);
  assert.equal(state.packsInFlight.every(({ cards }) => cards.length === 2), true);
  assert.equal(state.unopenedRounds.length, 1);
});

test("stale, duplicate, foreign-pack, foreign-card, and unknown-seat actions are atomic rejections", () => {
  const initial = createDraft(makeSetup({ seatCount: 3 }));
  const validAction = actionFor(initial, "seat-0");
  const afterOne = pickCard(initial, validAction);
  const snapshot = JSON.stringify(afterOne);

  expectRuleError(() => pickCard(afterOne, validAction), "SEAT_ALREADY_PICKED");
  expectRuleError(
    () => pickCard(afterOne, { ...actionFor(afterOne, "seat-1"), round: 2 }),
    "STALE_ACTION"
  );
  expectRuleError(
    () =>
      pickCard(afterOne, {
        ...actionFor(afterOne, "seat-1"),
        packId: choiceFor(afterOne, "seat-2").packId,
      }),
    "PACK_MISMATCH"
  );
  expectRuleError(
    () =>
      pickCard(afterOne, {
        ...actionFor(afterOne, "seat-1"),
        cardInstanceId: choiceFor(afterOne, "seat-2").cards[0].instanceId,
      }),
    "CARD_NOT_IN_PACK"
  );
  expectRuleError(
    () => pickCard(afterOne, { ...actionFor(afterOne, "seat-1"), seatId: "not-a-seat" }),
    "UNKNOWN_SEAT"
  );
  assert.equal(JSON.stringify(afterOne), snapshot);
  assert.equal(initial.pickedPools[0].cards.length, 0);
});

test("a stale action from before a completed barrier cannot affect the next pick", () => {
  const initial = createDraft(makeSetup());
  const stale = actionFor(initial, "seat-0");
  const nextPick = pickBarrier(initial);

  expectRuleError(() => pickCard(nextPick, stale), "STALE_ACTION");
  assert.equal(nextPick.pick, 2);
  assert.equal(nextPick.pickedPools[0].cards.length, 1);
});

test("independent transitions branch without sharing mutable arrays", () => {
  const initial = createDraft(makeSetup());
  const firstBranch = pickCard(initial, actionFor(initial, "seat-0", 0));
  const secondBranch = pickCard(initial, actionFor(initial, "seat-0", 1));

  assert.deepEqual(firstBranch.pickedPools[0].cards.map(({ instanceId }) => instanceId), [
    "r1-p0-c0",
  ]);
  assert.deepEqual(secondBranch.pickedPools[0].cards.map(({ instanceId }) => instanceId), [
    "r1-p0-c1",
  ]);
  assert.equal(initial.pickedPools[0].cards.length, 0);
  assertDeepFrozen(firstBranch);
  assertDeepFrozen(secondBranch);
});

test("the default bot deterministically chooses the first locally offered card", () => {
  const state = createDraft(
    makeSetup({ seatCount: 2, controllers: ["human", "bot"] })
  );
  const botChoice = choiceFor(state, "seat-1");

  assert.equal(
    firstCardBotPolicy({
      round: state.round,
      pick: state.pick,
      passDirection: state.passDirection,
      seatId: "seat-1",
      packId: botChoice.packId,
      cards: botChoice.cards,
    }),
    "r1-p1-c0"
  );
  const afterBots = runPendingBots(state);
  assert.deepEqual(afterBots.pendingSeatIds, ["seat-0"]);
  assert.deepEqual(afterBots.pickedPools[1].cards.map(({ instanceId }) => instanceId), [
    "r1-p1-c0",
  ]);
});

test("bot policy is replaceable, receives only local choices, and invalid output is rejected", () => {
  const state = createDraft(
    makeSetup({ seatCount: 2, controllers: ["human", "bot"] })
  );
  const contexts = [];
  const afterBots = runPendingBots(state, (context) => {
    contexts.push(context);
    return context.cards.at(-1).instanceId;
  });

  assert.equal(contexts.length, 1);
  assert.deepEqual(Object.keys(contexts[0]).sort(), [
    "cards",
    "packId",
    "passDirection",
    "pick",
    "round",
    "seatId",
  ]);
  assertDeepFrozen(contexts[0]);
  assert.deepEqual(afterBots.pickedPools[1].cards.map(({ instanceId }) => instanceId), [
    "r1-p1-c1",
  ]);
  expectRuleError(() => runPendingBots(state, () => "foreign-card"), "BOT_INVALID_CHOICE");
  assert.equal(state.pickedPools[1].cards.length, 0);
});

test("one human plus deterministic bots can complete all three rounds", () => {
  let state = createDraft(
    makeSetup({
      seatCount: 4,
      cardsPerRound: [2, 1, 2],
      controllers: ["human", "bot", "bot", "bot"],
    })
  );

  state = runPendingBots(state);
  while (state.status === "picking") {
    const humanChoice = choiceFor(state, "seat-0");
    assert.ok(humanChoice);
    state = pickCard(state, actionFor(state, "seat-0"));
    state = runPendingBots(state);
  }

  assert.equal(state.totalPicks, 20);
  assert.deepEqual(state.pickedPools.map(({ cards }) => cards.length), [5, 5, 5, 5]);
  assert.equal(state.status, "complete");
});

test("completion produces the exact terminal control state and rejects further picks", () => {
  const state = finishDraft(createDraft(makeSetup({ cardsPerRound: [1, 1, 1] })));

  assert.deepEqual(
    {
      status: state.status,
      round: state.round,
      pick: state.pick,
      passDirection: state.passDirection,
      packsInFlight: state.packsInFlight,
      unopenedRounds: state.unopenedRounds,
      pendingSeatIds: state.pendingSeatIds,
      legalChoices: state.legalChoices,
      totalPicks: state.totalPicks,
    },
    {
      status: "complete",
      round: 3,
      pick: 1,
      passDirection: "left",
      packsInFlight: [],
      unopenedRounds: [],
      pendingSeatIds: [],
      legalChoices: [],
      totalPicks: 6,
    }
  );
  assertDeepFrozen(state);
  expectRuleError(
    () =>
      pickCard(state, {
        round: 3,
        pick: 1,
        seatId: "seat-0",
        packId: "round-3-pack-0",
        cardInstanceId: "r3-p0-c0",
      }),
    "DRAFT_COMPLETE"
  );
});

test("malformed setup is rejected before any state is created", () => {
  const setupMutations = [
    () => null,
    () => makeSetup({ seatCount: 1 }),
    () => makeSetup({ seatCount: 9 }),
    () => ({ ...makeSetup(), seats: [{ id: "same", controller: "human" }, { id: "same", controller: "human" }] }),
    () => ({ ...makeSetup(), seats: [{ id: "seat-0", controller: "human" }, { id: "seat-1", controller: "robot" }] }),
    () => makeSetup({ seatCount: 2, controllers: ["bot", "bot"] }),
    () => ({ ...makeSetup(), packsByRound: makeSetup().packsByRound.slice(0, 2) }),
    () => {
      const setup = makeSetup();
      setup.packsByRound[0].pop();
      return setup;
    },
    () => {
      const setup = makeSetup();
      setup.packsByRound[0][1].id = setup.packsByRound[0][0].id;
      return setup;
    },
    () => {
      const setup = makeSetup();
      setup.packsByRound[0][0].cards = [];
      return setup;
    },
    () => {
      const setup = makeSetup();
      setup.packsByRound[0][0].cards.pop();
      return setup;
    },
    () => {
      const setup = makeSetup();
      setup.packsByRound[0][0].cards[0].instanceId = setup.packsByRound[0][1].cards[0].instanceId;
      return setup;
    },
    () => {
      const setup = makeSetup();
      setup.packsByRound[0][0].cards[0].cardId = "";
      return setup;
    },
  ];

  for (const mutate of setupMutations) {
    expectRuleError(() => createDraft(mutate()), "INVALID_SETUP");
  }
});

test("malformed actions are rejected without changing state", () => {
  const state = createDraft(makeSetup());
  const malformedActions = [
    null,
    {},
    { ...actionFor(state, "seat-0"), round: 0 },
    { ...actionFor(state, "seat-0"), pick: 1.5 },
    { ...actionFor(state, "seat-0"), seatId: "" },
    { ...actionFor(state, "seat-0"), packId: "" },
    { ...actionFor(state, "seat-0"), cardInstanceId: "" },
  ];

  for (const action of malformedActions) {
    expectRuleError(() => pickCard(state, action), "MALFORMED_ACTION");
  }
  assert.equal(state.totalPicks, 0);
  assert.deepEqual(state.pendingSeatIds, ["seat-0", "seat-1"]);
});
