import assert from "node:assert/strict";
import test from "node:test";

import { OMENS_SET_SNAPSHOT } from "@draft-table/set-omens/snapshot";
import {
  FABRARY_DECK_NAME,
  FABRARY_IMPORT_ORIGIN,
  FABRARY_IMPORT_URL,
  fabraryEntries,
  fabraryImportLink,
  fabraryTextList
} from "../src/fabrary.ts";
import { identityIndex } from "../src/pool.ts";

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

test("the import target is Fabrary's own public import tab", () => {
  assert.equal(FABRARY_IMPORT_ORIGIN, "https://fabrary.net");
  assert.equal(FABRARY_IMPORT_URL, "https://fabrary.net/decks?tab=import");
});

test("entries collapse duplicate identities into a count, in collector order", () => {
  const pool = [card("OMN126", "a"), card("OMN020"), card("OMN126", "b"), card("OMN126", "c")];
  const entries = fabraryEntries(pool, index(identity("OMN126"), identity("OMN020")));

  assert.deepEqual(entries.map(({ id, count }) => `${id} x${count}`), ["OMN020 x1", "OMN126 x3"]);
});

test("a normal card and its Rainbow Foil counterpart collapse to one deckbuilding entry", () => {
  const pool = [
    { instanceId: "r1s1-3", cardId: "OMN092", label: "Leech Renown (red) · Rare" },
    { instanceId: "r1s1-13", cardId: "OMN092", label: "Leech Renown (red) · Rare · Rainbow Foil" }
  ];
  const entries = fabraryEntries(pool, index(identity("OMN092")));

  assert.deepEqual(entries, [{ id: "OMN092", name: "Card OMN092", pitch: 1, count: 2 }]);
});

test("the import link carries one identifier occurrence per drafted copy", () => {
  const pool = [card("OMN126", "a"), card("OMN020"), card("OMN126", "b")];
  const link = fabraryImportLink(fabraryEntries(pool, index(identity("OMN126"), identity("OMN020"))));
  const query = new URL(link).searchParams;

  assert.equal(new URL(link).origin, FABRARY_IMPORT_ORIGIN);
  assert.equal(new URL(link).pathname, "/decks");
  assert.equal(query.get("tab"), "import");
  assert.equal(query.get("format"), "Draft");
  assert.equal(query.get("name"), FABRARY_DECK_NAME);
  assert.equal(query.get("cards"), "OMN020,OMN126,OMN126");
});

test("the import link encodes the deck name rather than breaking the query", () => {
  const link = fabraryImportLink(fabraryEntries([card("OMN020")], index(identity("OMN020"))));

  assert.ok(link.includes("name=Draft%20Table"), link);
  assert.doesNotMatch(link.split("name=")[1].split("&")[0], /[&?# ]/u, "the name cannot introduce a query parameter");
});

test("an empty pool produces no link at all rather than an empty import", () => {
  assert.equal(fabraryImportLink([]), null);
});

test("the separators Fabrary splits on stay literal while identifiers cannot forge a parameter", () => {
  const pool = [card("OMN020"), card("OMN126")];
  const link = fabraryImportLink(fabraryEntries(pool, index(identity("OMN020"), identity("OMN126"))));

  assert.ok(link.endsWith("&cards=OMN020,OMN126"), link);
  assert.doesNotMatch(link, /%2C/iu, "an encoded comma would leave Fabrary one unsplittable identifier");

  const hostile = fabraryImportLink([{ id: "OMN020&format=Constructed", name: "x", pitch: 1, count: 1 }]);
  assert.equal(new URL(hostile).searchParams.get("format"), "Draft", "an identifier cannot introduce a parameter");
  assert.equal(new URL(hostile).searchParams.get("cards"), "OMN020&format=Constructed");
});

test("the text list follows the copyable form Fabrary already parses", () => {
  const pool = [card("OMN126", "a"), card("OMN020"), card("OMN126", "b"), card("OMN300")];
  const list = fabraryTextList(fabraryEntries(pool, index(
    identity("OMN020", { name: "Aethersling", pitch: 1 }),
    identity("OMN126", { name: "Tap Lessons Past", pitch: 3 }),
    identity("OMN300", { name: "Seeker's Gilet", pitch: 0 })
  )));

  assert.equal(list, [
    `Name: ${FABRARY_DECK_NAME}`,
    "Format: Draft",
    "",
    "Deck cards",
    "1x Aethersling (red)",
    "2x Tap Lessons Past (blue)",
    "1x Seeker's Gilet"
  ].join("\n"));
});

test("a pitchless card carries no colour, because it has none to carry", () => {
  const list = fabraryTextList(fabraryEntries([card("OMN300")], index(identity("OMN300", { name: "Gilet", pitch: 0 }))));

  assert.match(list, /^1x Gilet$/mu);
});

test("an empty pool still produces a well-formed but empty list", () => {
  assert.equal(fabraryTextList([]), `Name: ${FABRARY_DECK_NAME}\nFormat: Draft\n\nDeck cards`);
});

test("a card the snapshot does not know keeps its identifier rather than vanishing", () => {
  const entries = fabraryEntries([card("OMN020"), card("XXX999")], index(identity("OMN020")));

  assert.deepEqual(entries.map(({ id, name, count }) => `${id}|${name}|${count}`), ["OMN020|Card OMN020|1", "XXX999|XXX999|1"]);
  assert.match(fabraryImportLink(entries), /cards=OMN020,XXX999/u);
  assert.match(fabraryTextList(entries), /^1x XXX999$/mu);
});

test("a whole real forty-two card pool exports every copy exactly once", () => {
  const identities = identityIndex(OMENS_SET_SNAPSHOT);
  const drafted = OMENS_SET_SNAPSHOT.identities.slice(0, 40).map(({ id }) => card(id));
  const pool = [...drafted, card(drafted[0].cardId, "again"), card(drafted[1].cardId, "again")];
  const entries = fabraryEntries(pool, identities);

  assert.equal(entries.reduce((total, { count }) => total + count, 0), 42);
  assert.equal(entries.length, 40, "duplicates collapse but distinct identities do not");
  assert.equal(fabraryImportLink(entries).split("cards=")[1].split(",").length, 42);
  assert.equal(fabraryTextList(entries).split("\n").filter((line) => /^\d+x /u.test(line)).length, 40);

  const numbers = entries.map(({ id }) => Number(id.replace(/\D/gu, "")));
  assert.deepEqual(numbers, [...numbers].sort((left, right) => left - right), "collector order throughout");
});

test("the export names no card material of its own", () => {
  const identities = identityIndex(OMENS_SET_SNAPSHOT);
  const entries = fabraryEntries(OMENS_SET_SNAPSHOT.identities.slice(0, 5).map(({ id }) => card(id)), identities);

  for (const entry of entries) {
    const source = OMENS_SET_SNAPSHOT.identities.find(({ id }) => id === entry.id);
    assert.equal(entry.name, source.name);
    assert.equal(entry.pitch, source.pitch);
  }
  assert.doesNotMatch(fabraryTextList(entries), /legendstory|\.webp/u, "no image material leaves through the export");
});
