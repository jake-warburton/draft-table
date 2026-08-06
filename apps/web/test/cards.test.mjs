import assert from "node:assert/strict";
import test from "node:test";

import {
  DRAFTABLE_PLACEHOLDER_CATALOGUE,
  PACK_POSITION_ROLES,
  PACK_SIZE,
  buildPack,
  buildPacksByRound
} from "../src/cards.ts";

/** Test-only xorshift32 stand-in for caller-owned entropy; the client owns no entropy contract. */
const sampleSource = (seed) => {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state;
  };
};

const cardsById = new Map(DRAFTABLE_PLACEHOLDER_CATALOGUE.map((card) => [card.cardId, card]));

test("the placeholder catalogue is explicitly labelled, distinct, and covers every recipe rarity", () => {
  assert.ok(DRAFTABLE_PLACEHOLDER_CATALOGUE.length >= 100);
  assert.equal(cardsById.size, DRAFTABLE_PLACEHOLDER_CATALOGUE.length);
  for (const card of DRAFTABLE_PLACEHOLDER_CATALOGUE) {
    assert.match(card.name, /^Placeholder /, "no invented card may be mistaken for a real Omens card");
    assert.ok(["common", "rare", "majestic"].includes(card.rarity));
    assert.ok([0, 1, 2, 3].includes(card.pitch));
  }
  for (const rarity of ["common", "rare", "majestic"]) {
    assert.ok(DRAFTABLE_PLACEHOLDER_CATALOGUE.some((card) => card.rarity === rarity), rarity);
  }
});

test("the pack position roles match the fourteen-position recipe layout shape", () => {
  assert.equal(PACK_SIZE, 14);
  assert.equal(PACK_POSITION_ROLES.length, 14);
  assert.equal(PACK_POSITION_ROLES.filter((role) => role === "common").length, 11);
  assert.equal(PACK_POSITION_ROLES.filter((role) => role === "fixed-rare").length, 1);
  assert.equal(PACK_POSITION_ROLES.filter((role) => role === "rare-or-majestic").length, 1);
  assert.equal(PACK_POSITION_ROLES.filter((role) => role === "rainbow-foil").length, 1);
  assert.deepEqual(PACK_POSITION_ROLES.slice(11), ["fixed-rare", "rare-or-majestic", "rainbow-foil"]);
});

test("one built pack fills every position from its role's rarity scope", () => {
  const pack = buildPack("pack-1", DRAFTABLE_PLACEHOLDER_CATALOGUE, sampleSource(0x1234_5678));
  assert.equal(pack.id, "pack-1");
  assert.equal(pack.cards.length, PACK_SIZE);
  pack.cards.forEach((card, position) => {
    assert.equal(card.instanceId, `pack-1-${position}`);
    const source = cardsById.get(card.cardId);
    assert.ok(source !== undefined, card.cardId);
    const role = PACK_POSITION_ROLES[position];
    if (role === "common") assert.equal(source.rarity, "common");
    if (role === "fixed-rare") assert.equal(source.rarity, "rare");
    if (role === "rare-or-majestic") assert.ok(source.rarity === "rare" || source.rarity === "majestic");
  });
});

test("the thirteen normal positions never repeat one identity inside a pack", () => {
  const random = sampleSource(0x0f0f_0f0f);
  for (let pack = 0; pack < 200; pack += 1) {
    const normal = buildPack(`pack-${pack}`, DRAFTABLE_PLACEHOLDER_CATALOGUE, random).cards.slice(0, 13);
    assert.equal(new Set(normal.map((card) => card.cardId)).size, 13);
  }
});

test("a Rainbow Foil position may legally repeat a normal identity in the same pack", () => {
  const random = sampleSource(0x2bad_c0de);
  let overlaps = 0;
  for (let pack = 0; pack < 500; pack += 1) {
    const cards = buildPack(`pack-${pack}`, DRAFTABLE_PLACEHOLDER_CATALOGUE, random).cards;
    const foil = cards[13];
    if (cards.slice(0, 13).some((card) => card.cardId === foil.cardId)) overlaps += 1;
  }
  assert.ok(overlaps > 0, "cross-pool overlap must not be deduplicated away");
});

test("every card carries a display label naming its rarity and treatment", () => {
  const pack = buildPack("pack-1", DRAFTABLE_PLACEHOLDER_CATALOGUE, sampleSource(7));
  assert.match(pack.cards[0].label, /Placeholder/);
  assert.match(pack.cards[13].label, /Rainbow Foil/);
});

test("three rounds of packs are globally distinct and one pack per seat", () => {
  const rounds = buildPacksByRound(8, DRAFTABLE_PLACEHOLDER_CATALOGUE, sampleSource(99));
  assert.equal(rounds.length, 3);
  const packIds = new Set();
  const instanceIds = new Set();
  for (const round of rounds) {
    assert.equal(round.length, 8);
    for (const pack of round) {
      packIds.add(pack.id);
      for (const card of pack.cards) instanceIds.add(card.instanceId);
    }
  }
  assert.equal(packIds.size, 24);
  assert.equal(instanceIds.size, 24 * PACK_SIZE);
});

test("pack building is a pure function of the caller's sample sequence", () => {
  const first = buildPacksByRound(4, DRAFTABLE_PLACEHOLDER_CATALOGUE, sampleSource(0xabcd));
  const second = buildPacksByRound(4, DRAFTABLE_PLACEHOLDER_CATALOGUE, sampleSource(0xabcd));
  assert.deepEqual(first, second);
});

test("a sample source outside the unsigned 32-bit domain is rejected", () => {
  assert.throws(() => buildPack("pack-1", DRAFTABLE_PLACEHOLDER_CATALOGUE, () => -1));
  assert.throws(() => buildPack("pack-1", DRAFTABLE_PLACEHOLDER_CATALOGUE, () => 2 ** 32));
  assert.throws(() => buildPack("pack-1", DRAFTABLE_PLACEHOLDER_CATALOGUE, () => 1.5));
});

test("a catalogue without enough distinct cards for every role is rejected", () => {
  const tooFew = DRAFTABLE_PLACEHOLDER_CATALOGUE.filter((card) => card.rarity === "common").slice(0, 3);
  assert.throws(() => buildPack("pack-1", tooFew, sampleSource(1)));
});
