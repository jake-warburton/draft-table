import assert from "node:assert/strict";
import test from "node:test";

import { OMENS_SET_SNAPSHOT, PACK_SIZE } from "../src/cards.ts";
import {
  DEFAULT_SEAT_COUNT,
  HUMAN_SEAT_ID,
  PICKS_PER_ROUND,
  chooseCard,
  createTable,
  viewTable
} from "../src/table.ts";

const sampleSource = (seed) => {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state;
  };
};

const openTable = (seed = 0x5eed_1234, seatCount = DEFAULT_SEAT_COUNT) => {
  const random = sampleSource(seed);
  return { random, state: createTable(seatCount, OMENS_SET_SNAPSHOT, random) };
};

const takeFirst = (table, times) => {
  let { state } = table;
  for (let pick = 0; pick < times; pick += 1) {
    state = chooseCard(state, viewTable(state).cards[0].instanceId, table.random);
  }
  return state;
};

test("a new table seats one drafter against seven bots and opens the first pack", () => {
  const { state } = openTable();
  assert.equal(state.seats.length, DEFAULT_SEAT_COUNT);
  assert.equal(state.seats[0].id, HUMAN_SEAT_ID);
  assert.equal(state.seats[0].controller, "human");
  assert.ok(state.seats.slice(1).every((seat) => seat.controller === "bot"));

  const view = viewTable(state);
  assert.equal(view.complete, false);
  assert.equal(view.round, 1);
  assert.equal(view.pick, 1);
  assert.equal(view.passDirection, "left");
  assert.equal(view.cards.length, PACK_SIZE);
  assert.equal(view.pool.length, 0);
  assert.match(view.heading, /Round 1/);
  assert.match(view.heading, /Pick 1/);
  assert.match(view.status, /Choose one/i);
});

test("choosing a card commits that exact card and passes a smaller pack from the next seat", () => {
  const table = openTable();
  const before = viewTable(table.state);
  const chosen = before.cards[3];

  const after = viewTable(chooseCard(table.state, chosen.instanceId, table.random));
  assert.deepEqual(after.pool.map((card) => card.instanceId), [chosen.instanceId]);
  assert.equal(after.pick, 2);
  assert.equal(after.cards.length, PACK_SIZE - 1);
  assert.notEqual(after.packId, before.packId, "the second pack is passed from a neighbouring seat");
  assert.equal(after.cards.some((card) => card.instanceId === chosen.instanceId), false);
});

test("a card outside the pack at this seat is refused", () => {
  const table = openTable();
  assert.throws(() => chooseCard(table.state, "not-a-real-instance", table.random), /DraftRuleError/);
});

test("thirteen choices finish round one with fourteen cards and reverse the pass direction", () => {
  const table = openTable();
  const view = viewTable(takeFirst(table, PICKS_PER_ROUND));
  assert.equal(view.round, 2);
  assert.equal(view.pick, 1);
  assert.equal(view.passDirection, "right");
  assert.equal(view.pool.length, PACK_SIZE);
  assert.equal(view.cards.length, PACK_SIZE);
});

test("thirty-nine choices complete a three-round draft of forty-two cards", () => {
  const table = openTable();
  const state = takeFirst(table, PICKS_PER_ROUND * 3);
  const view = viewTable(state);
  assert.equal(view.complete, true);
  assert.equal(view.pool.length, PACK_SIZE * 3);
  assert.equal(view.cards.length, 0);
  assert.match(view.status, /complete/i);
  assert.equal(new Set(view.pool.map((card) => card.instanceId)).size, PACK_SIZE * 3);
});

test("a completed draft refuses further choices", () => {
  const table = openTable();
  const state = takeFirst(table, PICKS_PER_ROUND * 3);
  assert.throws(() => chooseCard(state, "anything", table.random), /DraftRuleError/);
});

test("bots choose through caller-owned entropy rather than always taking the first card", () => {
  let leftFirstPosition = 0;
  for (let seed = 1; seed <= 40; seed += 1) {
    const view = viewTable(takeFirst(openTable(seed * 0x9e37_79b1), 1));
    if (view.cards.some((card) => card.instanceId.endsWith("-0"))) leftFirstPosition += 1;
  }
  assert.ok(leftFirstPosition > 0, "a bot that always took position zero would never leave one behind");
});

test("the whole table transition is deterministic for one exact sample sequence", () => {
  const replay = () => viewTable(takeFirst(openTable(0x3333_3333), PICKS_PER_ROUND * 3)).pool;
  assert.deepEqual(replay(), replay());
});

test("smaller tables remain legal and still draft complete packs", () => {
  const table = openTable(0x4444_4444, 4);
  const view = viewTable(takeFirst(table, PICKS_PER_ROUND * 3));
  assert.equal(view.complete, true);
  assert.equal(view.pool.length, PACK_SIZE * 3);
});

test("a seat count outside the supported range is refused", () => {
  assert.throws(() => createTable(0, OMENS_SET_SNAPSHOT, sampleSource(1)));
  assert.throws(() => createTable(9, OMENS_SET_SNAPSHOT, sampleSource(1)));
});
