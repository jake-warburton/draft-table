import assert from "node:assert/strict";
import test from "node:test";

import { OMENS_SET_SNAPSHOT } from "@draft-table/set-omens/snapshot";
import { POOL_GROUPINGS, groupPool, identityIndex } from "../src/pool.ts";

const identity = (id, overrides = {}) => ({
  id,
  name: `Card ${id}`,
  pitch: 1,
  rarity: "common",
  image: `https://legendstory-production-s3-public.s3.amazonaws.com/media/cards/normal/${id}.webp`,
  types: ["Lightning", "Wizard", "Action"],
  cardType: "action",
  cardClass: "wizard",
  ...overrides
});

const card = (id, instance = "i") => ({ instanceId: `${id}-${instance}`, cardId: id, label: `Card ${id}` });
const index = (...identities) => identityIndex({ identities });
const labels = (groups) => groups.map(({ label }) => label);
const ids = (groups) => groups.map(({ cards }) => cards.map(({ cardId }) => cardId));

test("the offered groupings are exactly the ones the drafter asked for", () => {
  assert.deepEqual(POOL_GROUPINGS.map(({ id }) => id), ["number", "class", "colour", "type"]);
  assert.deepEqual(POOL_GROUPINGS.map(({ label }) => label), ["Set number", "Class", "Colour", "Type"]);
});

test("grouping by set number keeps one ungrouped run in collector order", () => {
  const groups = groupPool([card("OMN120"), card("OMN007"), card("OMN045")], "number", index(
    identity("OMN120"), identity("OMN007"), identity("OMN045")
  ));

  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, "", "a single ungrouped run needs no heading");
  assert.deepEqual(groups[0].cards.map(({ cardId }) => cardId), ["OMN007", "OMN045", "OMN120"]);
});

test("set numbers order numerically rather than as text", () => {
  const groups = groupPool([card("OMN100"), card("OMN9"), card("OMN20")], "number", index(
    identity("OMN100"), identity("OMN9"), identity("OMN20")
  ));

  assert.deepEqual(groups[0].cards.map(({ cardId }) => cardId), ["OMN9", "OMN20", "OMN100"]);
});

test("grouping by class uses the reviewed order and names the class-less bucket honestly", () => {
  const pool = [card("OMN050"), card("OMN010"), card("OMN030"), card("OMN020"), card("OMN040")];
  const groups = groupPool(pool, "class", index(
    identity("OMN050", { cardClass: null }),
    identity("OMN010", { cardClass: "generic" }),
    identity("OMN030", { cardClass: "illusionist" }),
    identity("OMN020", { cardClass: "runeblade" }),
    identity("OMN040", { cardClass: "wizard" })
  ));

  assert.deepEqual(labels(groups), ["Wizard", "Illusionist", "Runeblade", "Generic", "No class"]);
  assert.deepEqual(ids(groups), [["OMN040"], ["OMN030"], ["OMN020"], ["OMN010"], ["OMN050"]]);
});

test("grouping by colour names the pitch colours and keeps pitchless cards separate", () => {
  const pool = [card("OMN040"), card("OMN010"), card("OMN030"), card("OMN020")];
  const groups = groupPool(pool, "colour", index(
    identity("OMN040", { pitch: 0 }), identity("OMN010", { pitch: 1 }),
    identity("OMN030", { pitch: 3 }), identity("OMN020", { pitch: 2 })
  ));

  assert.deepEqual(labels(groups), ["Red", "Yellow", "Blue", "No pitch"]);
  assert.deepEqual(ids(groups), [["OMN010"], ["OMN020"], ["OMN030"], ["OMN040"]]);
});

test("grouping by type uses the reviewed order", () => {
  const pool = [card("OMN040"), card("OMN010"), card("OMN030"), card("OMN020")];
  const groups = groupPool(pool, "type", index(
    identity("OMN040", { cardType: "equipment" }), identity("OMN010", { cardType: "action" }),
    identity("OMN030", { cardType: "defense-reaction" }), identity("OMN020", { cardType: "instant" })
  ));

  assert.deepEqual(labels(groups), ["Action", "Instant", "Defense Reaction", "Equipment"]);
  assert.deepEqual(ids(groups), [["OMN010"], ["OMN020"], ["OMN030"], ["OMN040"]]);
});

test("cards stay in set number order inside every group", () => {
  const pool = [card("OMN090"), card("OMN005"), card("OMN070"), card("OMN012")];
  const groups = groupPool(pool, "class", index(
    identity("OMN090", { cardClass: "wizard" }), identity("OMN005", { cardClass: "wizard" }),
    identity("OMN070", { cardClass: "generic" }), identity("OMN012", { cardClass: "generic" })
  ));

  assert.deepEqual(ids(groups), [["OMN005", "OMN090"], ["OMN012", "OMN070"]]);
});

test("a group nobody drafted into is left out entirely", () => {
  const groups = groupPool([card("OMN010")], "type", index(identity("OMN010", { cardType: "instant" })));

  assert.deepEqual(labels(groups), ["Instant"]);
});

test("an empty pool produces nothing to render", () => {
  for (const grouping of POOL_GROUPINGS) assert.deepEqual(groupPool([], grouping.id, index()), []);
});

test("every group counts the cards it holds", () => {
  const pool = [card("OMN010", "a"), card("OMN010", "b"), card("OMN020")];
  const groups = groupPool(pool, "class", index(
    identity("OMN010", { cardClass: "wizard" }), identity("OMN020", { cardClass: "generic" })
  ));

  assert.deepEqual(groups.map(({ label, cards }) => `${label} ${cards.length}`), ["Wizard 2", "Generic 1"]);
  assert.deepEqual(groups[0].cards.map(({ instanceId }) => instanceId), ["OMN010-a", "OMN010-b"]);
});

test("a card the snapshot does not know is shown rather than silently dropped", () => {
  const groups = groupPool([card("OMN010"), card("XXX999")], "class", index(identity("OMN010")));

  assert.deepEqual(labels(groups), ["Wizard", "Unknown"]);
  assert.deepEqual(ids(groups), [["OMN010"], ["XXX999"]]);
});

test("grouping never loses, duplicates, or reorders a card out of the real pool", () => {
  const index = identityIndex(OMENS_SET_SNAPSHOT);
  const pool = OMENS_SET_SNAPSHOT.identities
    .filter((unused, position) => position % 5 === 0)
    .map(({ id }, position) => card(id, `p${position}`));

  for (const { id: grouping } of POOL_GROUPINGS) {
    const groups = groupPool(pool, grouping, index);
    const flattened = groups.flatMap(({ cards }) => cards);
    assert.equal(flattened.length, pool.length, grouping);
    assert.deepEqual(
      new Set(flattened.map(({ instanceId }) => instanceId)),
      new Set(pool.map(({ instanceId }) => instanceId)),
      grouping
    );
    for (const group of groups) {
      const numbers = group.cards.map(({ cardId }) => Number(cardId.replace(/\D/gu, "")));
      assert.deepEqual(numbers, [...numbers].sort((left, right) => left - right), `${grouping}/${group.label}`);
    }
  }
});

test("the real snapshot fills every reviewed group at least once", () => {
  const index = identityIndex(OMENS_SET_SNAPSHOT);
  const wholeSet = OMENS_SET_SNAPSHOT.identities.map(({ id }) => card(id));

  assert.deepEqual(labels(groupPool(wholeSet, "class", index)), ["Wizard", "Illusionist", "Runeblade", "Generic", "No class"]);
  assert.deepEqual(labels(groupPool(wholeSet, "colour", index)), ["Red", "Yellow", "Blue", "No pitch"]);
  assert.deepEqual(labels(groupPool(wholeSet, "type", index)), ["Action", "Instant", "Defense Reaction", "Equipment"]);
});

test("the index resolves each identity by the card id a dealt card carries", () => {
  const resolved = identityIndex(OMENS_SET_SNAPSHOT);

  assert.equal(resolved.size, OMENS_SET_SNAPSHOT.identities.length);
  for (const source of OMENS_SET_SNAPSHOT.identities) assert.equal(resolved.get(source.id), source);
});
