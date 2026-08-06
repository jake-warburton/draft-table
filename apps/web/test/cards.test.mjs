import assert from "node:assert/strict";
import test from "node:test";

import {
  OMENS_SET_SNAPSHOT,
  OMENS_SNAPSHOT_SLOT_ROLES,
  PACK_SIZE,
  buildPack,
  buildPacksByRound,
  selectWeightedIndex
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

const snapshot = OMENS_SET_SNAPSHOT;
const identityIndex = new Map(snapshot.identities.map((identity, index) => [identity.id, index]));
const layoutOf = (pack) => snapshot.layouts.find((layout) => layout.pools.every((poolIndex, position) =>
  snapshot.pools[poolIndex].entries.some((entry) => snapshot.identities[entry.identity].id === pack.cards[position].cardId)));

test("the client deals from the reviewed snapshot rather than invented material", () => {
  assert.equal(snapshot.identities.length, 209);
  assert.equal(snapshot.layouts.length, 228);
  assert.equal(PACK_SIZE, 14);
  assert.ok(snapshot.identities.every((identity) => identity.name.trim().length > 0));
  assert.equal(snapshot.provenance.recipe.provenance, "community-not-official");
});

test("one built pack fills every position from that position's own layout pool", () => {
  const pack = buildPack("pack-1", snapshot, sampleSource(0x1234_5678));
  assert.equal(pack.id, "pack-1");
  assert.equal(pack.cards.length, PACK_SIZE);

  const layout = layoutOf(pack);
  assert.ok(layout !== undefined, "the dealt cards must belong to one exact layout");
  pack.cards.forEach((card, position) => {
    assert.equal(card.instanceId, `pack-1-${position}`);
    const pool = snapshot.pools[layout.pools[position]];
    const identity = identityIndex.get(card.cardId);
    assert.ok(pool.entries.some((entry) => entry.identity === identity),
      `position ${position} drew ${card.cardId} from outside ${pool.label}`);
  });
});

test("the thirteen normal positions never repeat one identity inside a pack", () => {
  const random = sampleSource(0x0f0f_0f0f);
  for (let pack = 0; pack < 200; pack += 1) {
    const normal = buildPack(`pack-${pack}`, snapshot, random).cards.slice(0, 13);
    assert.equal(new Set(normal.map((card) => card.cardId)).size, 13);
  }
});

test("a Rainbow Foil position may legally repeat a normal identity in the same pack", () => {
  const random = sampleSource(0x2bad_c0de);
  let overlaps = 0;
  for (let pack = 0; pack < 500; pack += 1) {
    const cards = buildPack(`pack-${pack}`, snapshot, random).cards;
    if (cards.slice(0, 13).some((card) => card.cardId === cards[13].cardId)) overlaps += 1;
  }
  assert.ok(overlaps > 0, "cross-pool overlap must not be deduplicated away");
});

test("the rare and Rainbow Foil positions hold the rarities their roles require", () => {
  const random = sampleSource(0x5150_5150);
  for (let pack = 0; pack < 100; pack += 1) {
    const cards = buildPack(`pack-${pack}`, snapshot, random).cards;
    const rarityOf = (card) => snapshot.identities[identityIndex.get(card.cardId)].rarity;
    assert.ok(cards.slice(0, 11).every((card) => rarityOf(card) === "common"));
    assert.equal(rarityOf(cards[11]), "rare");
    assert.ok(["rare", "majestic"].includes(rarityOf(cards[12])));
    assert.match(cards[13].label, / · Rainbow Foil$/);
    assert.ok(cards.slice(0, 13).every((card) => !/Rainbow Foil/.test(card.label)));
  }
  assert.equal(OMENS_SNAPSHOT_SLOT_ROLES[13], "rainbow-foil");
});

test("every card label names the real card, its pitch, and its rarity", () => {
  const cards = buildPack("pack-1", snapshot, sampleSource(7)).cards;
  for (const card of cards) {
    const identity = snapshot.identities[identityIndex.get(card.cardId)];
    const pitch = ["", " (red)", " (yellow)", " (blue)"][identity.pitch];
    assert.ok(card.label.startsWith(`${identity.name}${pitch} · `), card.label);
    assert.match(card.label, /· (Common|Rare|Majestic)/);
  }
});

test("weighted selection resolves each ticket to its exact source-order entry", () => {
  const weights = [3, 1, 2];
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((ticket) => selectWeightedIndex(weights, ticket)), [0, 0, 0, 1, 2, 2]);
  assert.throws(() => selectWeightedIndex(weights, 6), RangeError);
  assert.throws(() => selectWeightedIndex([], 0), RangeError);
});

test("heavier snapshot weights are drawn more often than lighter ones", () => {
  const pool = snapshot.pools.find((entry) => new Set(entry.entries.map((item) => item.weight)).size > 1);
  assert.ok(pool !== undefined, "the real snapshot must contain an unevenly weighted pool");
  const heaviest = pool.entries.reduce((best, entry) => entry.weight > best.weight ? entry : best);
  const lightest = pool.entries.reduce((best, entry) => entry.weight < best.weight ? entry : best);

  const counts = new Map();
  const random = sampleSource(0xfeed_face);
  for (let pack = 0; pack < 400; pack += 1) {
    for (const card of buildPack(`pack-${pack}`, snapshot, random).cards) {
      counts.set(card.cardId, (counts.get(card.cardId) ?? 0) + 1);
    }
  }
  const seen = (entry) => counts.get(snapshot.identities[entry.identity].id) ?? 0;
  assert.ok(seen(heaviest) > seen(lightest),
    `heaviest ${seen(heaviest)} should beat lightest ${seen(lightest)}`);
});

test("three rounds of packs are globally distinct and one pack per seat", () => {
  const rounds = buildPacksByRound(8, snapshot, sampleSource(99));
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
  const first = buildPacksByRound(4, snapshot, sampleSource(0xabcd));
  const second = buildPacksByRound(4, snapshot, sampleSource(0xabcd));
  assert.deepEqual(first, second);
});

test("a sample source outside the unsigned 32-bit domain is rejected", () => {
  assert.throws(() => buildPack("pack-1", snapshot, () => -1));
  assert.throws(() => buildPack("pack-1", snapshot, () => 2 ** 32));
  assert.throws(() => buildPack("pack-1", snapshot, () => 1.5));
});

test("a pool too small for the positions it must fill is refused rather than repeated", () => {
  const starved = {
    ...snapshot,
    pools: snapshot.pools.map((pool, index) => index === snapshot.layouts[0].pools[0]
      ? { ...pool, entries: pool.entries.slice(0, 1) }
      : pool),
    layouts: [snapshot.layouts[0]]
  };
  const shared = starved.layouts[0].pools.filter((poolIndex) => poolIndex === starved.layouts[0].pools[0]).length;
  assert.ok(shared > 1, "the probed layout must reuse that pool for more than one position");
  assert.throws(() => buildPack("pack-1", starved, sampleSource(1)), RangeError);
});
