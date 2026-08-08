import assert from "node:assert/strict";
import test from "node:test";

import {
  DraftRuleError,
  MAX_DRAFT_SEATS,
  MIN_DRAFT_SEATS,
  createDraft,
  disconnectSeat,
  fillSeat,
  firstCardBotPolicy,
  pickCard,
  reconnectSeat,
  resolveTimeout,
  revealBarrier,
  runPendingBots,
  vacateSeat,
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
    occupantId: state.seats.find(({ id }) => id === seatId).occupantId,
    packId: choice.packId,
    cardInstanceId: choice.cards[cardIndex].instanceId,
  };
};

const pickBarrier = (initialState, cardIndex = 0) => {
  let state = initialState;
  for (const seatId of initialState.seats.map(({ id }) => id)) {
    state = pickCard(state, actionFor(state, seatId, cardIndex));
  }
  return revealBarrier(state, { type: "reveal", round: state.round, pick: state.pick });
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
  const input = makeSetup({ seatCount: 2 });
  const state = createDraft(input);

  assert.equal(MIN_DRAFT_SEATS, 1);
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

test("provisional picks remain hidden and uncommitted until an explicit full barrier reveal", () => {
  const initial = createDraft(makeSetup({ seatCount: 3, cardsPerRound: [3, 2, 2] }));
  const first = pickCard(initial, actionFor(initial, "seat-1"));
  const replaced = pickCard(first, actionFor(first, "seat-1", 1));

  assert.equal(replaced.pick, 1);
  assert.deepEqual(replaced.pendingSeatIds, ["seat-0", "seat-2"]);
  assert.equal(choiceFor(replaced, "seat-1").cards.length, 3);
  assert.equal(replaced.packsInFlight[1].cards.length, 3);
  assert.equal(replaced.pickedPools[1].cards.length, 0);
  assert.equal(replaced.totalPicks, 0);
  assert.equal(replaced.provisionalPicks[0].cardInstanceId, "r1-p1-c1");
  expectRuleError(
    () => revealBarrier(replaced, { type: "reveal", round: 1, pick: 1 }),
    "BARRIER_NOT_READY"
  );

  let queued = replaced;
  queued = pickCard(queued, actionFor(queued, "seat-0"));
  queued = pickCard(queued, actionFor(queued, "seat-2"));
  assert.equal(queued.totalPicks, 0);
  const afterBarrier = revealBarrier(queued, { type: "reveal", round: 1, pick: 1 });
  assert.equal(afterBarrier.pick, 2);
  assert.deepEqual(afterBarrier.pendingSeatIds, ["seat-0", "seat-1", "seat-2"]);
  assert.deepEqual(afterBarrier.packsInFlight.map(({ id, atSeatId }) => ({ id, atSeatId })), [
    { id: "round-1-pack-2", atSeatId: "seat-0" },
    { id: "round-1-pack-0", atSeatId: "seat-1" },
    { id: "round-1-pack-1", atSeatId: "seat-2" },
  ]);
  assert.deepEqual(afterBarrier.pickedPools[1].cards.map(({ instanceId }) => instanceId), ["r1-p1-c1"]);
  assert.equal(initial.packsInFlight[1].cards.length, 3);
});

test("three rounds pass left, right, left and preserve each seat's chronological pool order", () => {
  let state = createDraft(makeSetup({ seatCount: 3, cardsPerRound: [3, 3, 3] }));

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
    [
      "r1-p0-c0", "r1-p2-c1", "r1-p1-c2",
      "r2-p0-c0", "r2-p1-c1", "r2-p2-c2",
      "r3-p0-c0", "r3-p2-c1", "r3-p1-c2",
    ]
  );
});

test("left and right rotations wrap correctly for odd and even seat counts", () => {
  for (const seatCount of [3, 4]) {
    let state = createDraft(makeSetup({ seatCount, cardsPerRound: [3, 3, 1] }));
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

test("a sole final card is passed and assigned in the preceding atomic barrier", () => {
  let state = createDraft(makeSetup({ cardsPerRound: [2, 2, 1] }));
  state = pickBarrier(state);

  assert.equal(state.round, 2);
  assert.equal(state.pick, 1);
  assert.equal(state.passDirection, "right");
  assert.deepEqual(state.pickedPools.map(({ cards }) => cards.map(({ instanceId }) => instanceId)), [
    ["r1-p0-c0", "r1-p1-c1"],
    ["r1-p1-c0", "r1-p0-c1"],
  ]);
  assert.equal(state.totalPicks, 4);
  assert.deepEqual(state.packsInFlight.map(({ id }) => id), [
    "round-2-pack-0",
    "round-2-pack-1",
  ]);
  assert.equal(state.packsInFlight.every(({ cards }) => cards.length === 2), true);
  assert.equal(state.unopenedRounds.length, 1);
});

test("stale, foreign-occupant, foreign-pack, foreign-card, and unknown-seat actions are atomic rejections", () => {
  const initial = createDraft(makeSetup({ seatCount: 3 }));
  const validAction = actionFor(initial, "seat-0");
  const afterOne = pickCard(initial, validAction);
  const snapshot = JSON.stringify(afterOne);

  expectRuleError(() => pickCard(afterOne, { ...validAction, occupantId: "intruder" }), "OCCUPANT_MISMATCH");
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

test("same-card no-op, different-card replacement, and duplicate commit prevention", () => {
  const initial = createDraft(makeSetup({ cardsPerRound: [3, 2, 2] }));
  const firstAction = actionFor(initial, "seat-0");
  const queued = pickCard(initial, firstAction);
  const repeated = pickCard(queued, firstAction);

  assert.equal(repeated, queued);
  assert.equal(repeated.provisionalPicks.length, 1);

  const replaced = pickCard(repeated, actionFor(repeated, "seat-0", 1));
  assert.notEqual(replaced, repeated);
  assert.equal(replaced.provisionalPicks.length, 1);
  assert.equal(replaced.provisionalPicks[0].cardInstanceId, "r1-p0-c1");

  const ready = pickCard(replaced, actionFor(replaced, "seat-1"));
  const committed = revealBarrier(ready, { type: "reveal", round: 1, pick: 1 });
  assert.deepEqual(committed.pickedPools[0].cards.map(({ instanceId }) => instanceId), [
    "r1-p0-c1",
  ]);
  assert.equal(committed.totalPicks, 2);
});

test("a stale action from before a completed barrier cannot affect the next pick", () => {
  const initial = createDraft(makeSetup({ cardsPerRound: [3, 2, 2] }));
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

  assert.equal(firstBranch.provisionalPicks[0].cardInstanceId, "r1-p0-c0");
  assert.equal(secondBranch.provisionalPicks[0].cardInstanceId, "r1-p0-c1");
  assert.equal(initial.provisionalPicks.length, 0);
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
  assert.equal(afterBots.provisionalPicks[0].cardInstanceId, "r1-p1-c0");
  assert.equal(afterBots.pickedPools[1].cards.length, 0);
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
  assert.equal(afterBots.provisionalPicks[0].cardInstanceId, "r1-p1-c1");
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
    state = revealBarrier(state, { type: "reveal", round: state.round, pick: state.pick });
  }

  assert.equal(state.totalPicks, 20);
  assert.deepEqual(state.pickedPools.map(({ cards }) => cards.length), [5, 5, 5, 5]);
  assert.equal(state.status, "complete");
});

test("disconnect preserves intent while vacancy clears before replacement and fallback", () => {
  let state = createDraft(makeSetup({ seatCount: 2, cardsPerRound: [3, 1, 1] }));
  state = pickCard(state, actionFor(state, "seat-1", 2));
  state = disconnectSeat(state, {
    round: 1, pick: 1, seatId: "seat-1", occupantId: "seat-1",
  });
  assert.equal(state.provisionalPicks[0].cardInstanceId, "r1-p1-c2");
  state = reconnectSeat(state, {
    round: 1, pick: 1, seatId: "seat-1", occupantId: "seat-1",
  });
  state = vacateSeat(state, {
    round: 1, pick: 1, seatId: "seat-1", occupantId: "seat-1",
  });
  assert.equal(state.provisionalPicks.length, 0);
  assert.equal(state.seats[1].occupantId, null);
  const inheritedPack = state.packsInFlight.find(({ atSeatId }) => atSeatId === "seat-1").id;
  state = fillSeat(state, {
    round: 1, pick: 1, seatId: "seat-1", occupantId: "replacement",
    controller: "human",
  });
  assert.equal(state.provisionalPicks.length, 0);
  assert.equal(choiceFor(state, "seat-1").packId, inheritedPack);

  state = pickCard(state, actionFor(state, "seat-0"));
  const samples = [0xffff_ffff, 1];
  const resolved = resolveTimeout(
    state,
    { type: "timeout", round: 1, pick: 1 },
    [{ type: "random-fallback", round: 1, pick: 1, seatId: "seat-1", packId: inheritedPack }],
    { nextUint32: () => samples.shift() }
  );
  assert.deepEqual(samples, []);
  assert.equal(resolved.pickedPools[1].cards[0].instanceId, "r1-p1-c1");
  assert.equal(resolved.pick, 2);
});

test("timeout prevalidates complete fallback batches before reading entropy", () => {
  const state = createDraft(makeSetup({ cardsPerRound: [2, 1, 1] }));
  const snapshot = JSON.stringify(state);
  const fallback = (seatId) => ({
    type: "random-fallback", round: 1, pick: 1, seatId,
    packId: choiceFor(state, seatId).packId,
  });
  const invalidBatches = [
    { fallbacks: [fallback("seat-0")], code: "FALLBACK_MISMATCH" },
    { fallbacks: [fallback("seat-0"), fallback("seat-0")], code: "FALLBACK_MISMATCH" },
    { fallbacks: [fallback("seat-0"), null], code: "MALFORMED_ACTION" },
    { fallbacks: [fallback("seat-0"), { ...fallback("seat-1"), round: 2 }], code: "STALE_ACTION" },
    { fallbacks: [fallback("seat-0"), { ...fallback("seat-1"), seatId: "foreign-seat" }], code: "FALLBACK_MISMATCH" },
    { fallbacks: [fallback("seat-0"), { ...fallback("seat-1"), packId: "foreign-pack" }], code: "FALLBACK_MISMATCH" },
  ];
  for (const { fallbacks, code } of invalidBatches) {
    let entropyReads = 0;
    expectRuleError(
      () => resolveTimeout(state, { type: "timeout", round: 1, pick: 1 }, fallbacks, { nextUint32: () => { entropyReads += 1; return 0; } }),
      code
    );
    assert.equal(entropyReads, 0);
  }
  let staleEntropyReads = 0;
  expectRuleError(
    () => resolveTimeout(state, { type: "timeout", round: 2, pick: 1 }, [fallback("seat-0"), fallback("seat-1")],
      { nextUint32: () => { staleEntropyReads += 1; return 0; } }),
    "STALE_ACTION"
  );
  assert.equal(staleEntropyReads, 0);
  assert.equal(JSON.stringify(state), snapshot);
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
        occupantId: "seat-0",
        packId: "round-3-pack-0",
        cardInstanceId: "r3-p0-c0",
      }),
    "DRAFT_COMPLETE"
  );
});

test("malformed setup is rejected before any state is created", () => {
  const setupMutations = [
    () => null,
    () => makeSetup({ seatCount: 0 }),
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
    { ...actionFor(state, "seat-0"), occupantId: "" },
    { ...actionFor(state, "seat-0"), packId: "" },
    { ...actionFor(state, "seat-0"), cardInstanceId: "" },
  ];

  for (const action of malformedActions) {
    expectRuleError(() => pickCard(state, action), "MALFORMED_ACTION");
  }
  assert.equal(state.totalPicks, 0);
  assert.deepEqual(state.pendingSeatIds, ["seat-0", "seat-1"]);
});

test("a table for one drafts alone: the pack passes to its own seat until the draft completes", () => {
  const state = createDraft(makeSetup({ seatCount: 1, cardsPerRound: [3, 3, 3] }));

  assert.deepEqual(state.pendingSeatIds, ["seat-0"]);
  assert.deepEqual(
    state.packsInFlight.map(({ atSeatId, originSeatId }) => ({ atSeatId, originSeatId })),
    [{ atSeatId: "seat-0", originSeatId: "seat-0" }]
  );

  const afterFirst = pickBarrier(state);
  assert.equal(afterFirst.round, 1);
  assert.equal(afterFirst.pick, 2);
  assert.equal(afterFirst.packsInFlight[0].atSeatId, "seat-0",
    "the only seat passes its pack to itself");

  const done = finishDraft(afterFirst);
  assert.equal(done.status, "complete");
  assert.equal(done.pickedPools.length, 1);
  assert.equal(done.pickedPools[0].cards.length, 9, "every card of every round lands in the one pool");
});
