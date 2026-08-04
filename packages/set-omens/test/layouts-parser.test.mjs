import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  OmensRecipeLayoutsError,
  parseVerifiedOmensLayouts,
  verifyOmensRecipeBytes
} from "../src/index.ts";
import {
  parseOmensLayoutsFromTrustedBytes,
  validateOmensRecipeDerivedTotals,
  validateOmensRecipeLayoutsAggregate
} from "../src/layouts.ts";

const privateEvidencePath = process.env.OMENS_RECIPE_EVIDENCE_PATH;
const settings = JSON.stringify({
  showSlots: true,
  withReplacement: false,
  cardBack: "https://cards.invalid/back.png"
});
const cards = JSON.stringify([{
  name: "Fictional Aster",
  collector_number: "OMN-001",
  mana_cost: "2",
  rarity: "common",
  type: "action",
  image_uris: { en: "https://cards.invalid/fictional-aster.png" }
}]);
const source = (layouts, pools = "uninterpreted pool body") => Buffer.from(
  `\ufeff[Settings]\r\n${settings}\r\n[CustomCards]\r\n${cards}\r\n[Layouts]\r\n${layouts}\r\n[Pools]\r\n${pools}`,
  "utf8"
);
const validLayouts = "\t- Fictional Layout (7)\r\n\t\t2 Fictional Alpha Pool\r\n\t\t12 Fictional Beta Pool";
const outcomes = [
  ["Rare", "Rfcommon", 1411], ["Rare", "RFRare", 255], ["Rare", "RFMajestic", 34],
  ["Majestic", "Rfcommon", 581], ["Majestic", "RFRare", 105], ["Majestic", "RFMajestic", 14]
];
const commonSlots = () => [
  { count: 3, pool: "Wizard" }, { count: 2, pool: "Illusionist" }, { count: 2, pool: "Runeblade" },
  { count: 1, pool: "Lightning" }, { count: 2, pool: "Generic" }, { count: 1, pool: "Equipment" }
];
const slotsFor = ([second, rainbow]) => Object.freeze([
  ...commonSlots(),
  ...(second === "Rare" ? [{ count: 2, pool: "Rare" }] : [{ count: 1, pool: "Rare" }, { count: 1, pool: "Majestic" }]),
  { count: 1, pool: rainbow }
].map(Object.freeze));
const aggregateFixture = () => Object.freeze({ layouts: Object.freeze(
  Array.from({ length: 38 }, (_, group) => outcomes.map(([second, rainbow, coefficient], outcome) => Object.freeze({
    id: `Synthetic ${group}-${outcome}`,
    weight: coefficient * (group === 37 ? 155 : 1),
    slots: slotsFor([second, rainbow])
  }))).flat()
) });

const expectLayoutsError = (bytes) => {
  assert.throws(() => parseOmensLayoutsFromTrustedBytes(bytes), (error) => {
    assert.ok(error instanceof OmensRecipeLayoutsError);
    assert.equal(error.code, "OMENS_RECIPE_LAYOUTS_INVALID");
    assert.equal(error.message, "Omens recipe layouts are invalid.");
    assert.equal(error.stack, "OmensRecipeLayoutsError: Omens recipe layouts are invalid.");
    assert.deepEqual(JSON.parse(JSON.stringify(error)), {
      code: "OMENS_RECIPE_LAYOUTS_INVALID",
      name: "OmensRecipeLayoutsError"
    });
    return true;
  });
};

test("parses the observed synthetic indentation-sensitive Layouts grammar into a minimal immutable schema", () => {
  const bytes = source(validLayouts);
  const schema = parseOmensLayoutsFromTrustedBytes(bytes);
  bytes.fill(0);

  assert.deepEqual(schema, {
    layouts: [{
      id: "Fictional Layout",
      weight: 7,
      slots: [
        { count: 2, pool: "Fictional Alpha Pool" },
        { count: 12, pool: "Fictional Beta Pool" }
      ]
    }]
  });
  assert.ok(Object.isFrozen(schema));
  assert.ok(Object.isFrozen(schema.layouts));
  assert.ok(Object.isFrozen(schema.layouts[0]));
  assert.ok(Object.isFrozen(schema.layouts[0].slots));
  assert.ok(Object.isFrozen(schema.layouts[0].slots[0]));
  assert.throws(() => { schema.layouts[0].id = "changed"; }, TypeError);
  assert.throws(() => { schema.layouts[0].slots.push({}); }, TypeError);
});

test("rejects Layouts framing, ordering, blank lines, and every indentation or token delimiter mutation", () => {
  expectLayoutsError(source(""));
  expectLayoutsError(Buffer.from(`\ufeff[Settings]\r\n${settings}\r\n[CustomCards]\r\n${cards}\r\n[Pools]\r\nopaque`, "utf8"));
  expectLayoutsError(Buffer.from(`\ufeff[Settings]\r\n${settings}\r\n[Layouts]\r\n${validLayouts}\r\n[Pools]\r\nopaque`, "utf8"));
  expectLayoutsError(Buffer.from(`\ufeff[Settings]\r\n${settings}\r\n[CustomCards]\r\n${cards}\r\n[Layouts]\r\n${validLayouts}\r\n[Layouts]\r\n${validLayouts}\r\n[Pools]\r\nopaque`, "utf8"));
  expectLayoutsError(source(validLayouts.replace("\t- ", "- ")));
  expectLayoutsError(source(validLayouts.replace("\t\t2 ", "\t2 ")));
  expectLayoutsError(source(validLayouts.replace(" (7)", "(7)")));
  expectLayoutsError(source(validLayouts.replace("\t\t2 ", "\t\t2  ")));
  expectLayoutsError(source(validLayouts.replace("\r\n\t\t12", "\r\n\r\n\t\t12")));
});

test("rejects malformed identifiers, pool references, numbers, duplicate IDs, and non-positive or unsafe values", () => {
  for (const replacement of [
    "\t-  (7)",
    "\t-  Fictional Layout (7)",
    "\t- Fictional Layout  (7)",
    "\t- Fictional Layout (07)",
    "\t- Fictional Layout (0)",
    "\t- Fictional Layout (-1)",
    "\t- Fictional Layout (9007199254740992)",
    "\t- Fictional\u0080Layout (7)",
    "\t- Fictional Cafe\u0301 (7)",
    "\t\t0 Fictional Alpha Pool",
    "\t\t-1 Fictional Alpha Pool",
    "\t\t9007199254740992 Fictional Alpha Pool",
    "\t\t02 Fictional Alpha Pool",
    "\t\t2  Fictional Alpha Pool",
    "\t\t2 Fictional Alpha Pool ",
    "\t\t2 Fictional Alpha\u0000Pool",
    "\t\t2 Fictional Alpha\u009fPool",
    "\t\t2 Fictional Cafe\u0301 Pool"
  ]) {
    const layouts = replacement.startsWith("\t-")
      ? validLayouts.replace("\t- Fictional Layout (7)", replacement)
      : validLayouts.replace("\t\t2 Fictional Alpha Pool", replacement);
    expectLayoutsError(source(layouts));
  }
  expectLayoutsError(source(`${validLayouts}\r\n\t- Fictional Layout (1)\r\n\t\t14 Fictional Gamma Pool`));
});

test("requires the directly represented fourteen-visible-card structural total for each layout", () => {
  expectLayoutsError(source(validLayouts.replace("\t\t12", "\t\t11")));
  expectLayoutsError(source("\t- Fictional Layout (7)\r\n\t\t14 Fictional Alpha Pool\r\n\t\t1 Fictional Beta Pool"));
});

test("enforces published Layout outcome coefficients, slot shapes, and exact integer derived totals", () => {
  const fixture = aggregateFixture();
  assert.equal(validateOmensRecipeLayoutsAggregate(fixture), fixture);
  const derived = { secondRare: 326400, secondMajestic: 134400, rfcommon: 382464, rfrare: 69120, rfmajestic: 9216 };
  assert.equal(validateOmensRecipeDerivedTotals(derived), undefined);
  for (const key of Object.keys(derived)) assert.throws(
    () => validateOmensRecipeDerivedTotals({ ...derived, [key]: derived[key] + 1 }),
    OmensRecipeLayoutsError
  );
  const replace = (index, change) => Object.freeze({ layouts: Object.freeze(fixture.layouts.map((layout, current) =>
    current === index ? Object.freeze({ ...layout, ...change }) : layout
  )) });
  const alteredSlots = (index, mutate) => {
    const slots = structuredClone(fixture.layouts[index].slots);
    mutate(slots);
    return replace(index, { slots: Object.freeze(slots.map(Object.freeze)) });
  };
  const wrongCoefficient = Object.freeze({ layouts: Object.freeze(fixture.layouts.map((layout, index) =>
    [0, 1, 3, 4].includes(index) ? Object.freeze({ ...layout, weight: layout.weight + ([1, -1, -1, 1][[0, 1, 3, 4].indexOf(index)]) }) : layout
  )) });
  const duplicateOutcome = Object.freeze({ layouts: Object.freeze(fixture.layouts.map((layout, index) => {
    if (index !== 1 && index !== 6) return layout;
    const slots = structuredClone(layout.slots);
    slots.at(-1).pool = index === 1 ? "Rfcommon" : "RFRare";
    return Object.freeze({ ...layout, weight: index === 1 ? 1411 : 255, slots: Object.freeze(slots.map(Object.freeze)) });
  })) });
  const wrongRfClassification = alteredSlots(0, (slots) => { slots.at(-1).pool = "RFRare"; });
  const wrongRarityShape = alteredSlots(0, (slots) => { slots[6] = { count: 1, pool: "Rare" }; });
  const wrongCommonTotal = alteredSlots(0, (slots) => { slots[0].count = 2; });
  const wrongEquipmentCount = alteredSlots(0, (slots) => { slots[5].count = 2; slots[0].count = 2; });
  const changedCommonStructure = alteredSlots(6, (slots) => { slots[0].count = 2; slots[1].count = 3; });
  const wrongTotal = replace(227, { weight: fixture.layouts[227].weight + 1 });
  const overflow = replace(0, { weight: Number.MAX_SAFE_INTEGER });

  for (const invalid of [
    Object.freeze({ layouts: Object.freeze(fixture.layouts.slice(1)) }), wrongCoefficient, duplicateOutcome,
    wrongRfClassification, wrongRarityShape, wrongCommonTotal, wrongEquipmentCount, changedCommonStructure,
    wrongTotal, overflow
  ]) assert.throws(() => validateOmensRecipeLayoutsAggregate(invalid), OmensRecipeLayoutsError);
});

test("validates the Settings and CustomCards boundaries while leaving following pool bodies uninterpreted", () => {
  assert.deepEqual(
    parseOmensLayoutsFromTrustedBytes(source(validLayouts, "{ definitely not valid pool data [Layouts] }")),
    parseOmensLayoutsFromTrustedBytes(source(validLayouts))
  );
  expectLayoutsError(Buffer.from(`\ufeff[Settings]\r\n${settings}\r\n[CustomCards]\r\n[]\r\n[Layouts]\r\n${validLayouts}\r\n[Pools]\r\nopaque`, "utf8"));
});

test("layouts errors never disclose source evidence", () => {
  assert.throws(() => parseOmensLayoutsFromTrustedBytes(source(validLayouts.replace("Fictional Layout", " Private Secret Layout"))), (error) => {
    const disclosure = `${error.message}\n${error.stack}\n${JSON.stringify(error)}`;
    assert.doesNotMatch(disclosure, /private|secret|fictional|pool|\//i);
    return true;
  });
});

test("the public layouts parser requires a pinned verified Omens recipe", () => {
  assert.throws(() => parseVerifiedOmensLayouts(Object.freeze({})), TypeError);
});

test("private Layouts parse passed", { skip: !privateEvidencePath ? "private acceptance contract did not run; set OMENS_RECIPE_EVIDENCE_PATH or use npm run test:evidence" : false }, () => {
  const schema = parseVerifiedOmensLayouts(verifyOmensRecipeBytes(readFileSync(privateEvidencePath)));
  assert.ok(Object.isFrozen(schema));
  assert.ok(Object.isFrozen(schema.layouts));
  assert.ok(schema.layouts.every((layout) => Object.isFrozen(layout) && Object.isFrozen(layout.slots) && layout.slots.every(Object.isFrozen)));
});
