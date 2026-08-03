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
const aggregateFixture = () => {
  const coefficients = [1, 2, 3, 4, 5, 9];
  const layouts = Array.from({ length: 38 }, (_, group) => {
    const multiplier = group === 37 ? 19163 : 1;
    return coefficients.map((coefficient, outcome) => Object.freeze({
      id: `Synthetic ${group}-${outcome}`,
      weight: coefficient * multiplier,
      slots: Object.freeze([])
    }));
  }).flat();
  return Object.freeze({ layouts: Object.freeze(layouts) });
};

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

test("rejects deliberate pinned Layouts aggregate breaks", () => {
  const fixture = aggregateFixture();
  assert.equal(validateOmensRecipeLayoutsAggregate(fixture), fixture);

  const withWeights = (weights) => Object.freeze({
    layouts: Object.freeze(fixture.layouts.map((layout, index) => Object.freeze({
      ...layout,
      weight: weights[index]
    })))
  });
  const wrongTotal = fixture.layouts.map((layout) => layout.weight);
  wrongTotal[wrongTotal.length - 1] += 1;
  const overflow = fixture.layouts.map((layout) => layout.weight);
  overflow[0] = Number.MAX_SAFE_INTEGER;
  const wrongCoefficients = fixture.layouts.map((layout) => layout.weight);
  wrongCoefficients[0] = 2;
  wrongCoefficients[2] = 2;

  for (const invalid of [
    Object.freeze({ layouts: Object.freeze(fixture.layouts.slice(1)) }),
    withWeights(wrongTotal),
    withWeights(overflow),
    withWeights(wrongCoefficients)
  ]) {
    assert.throws(() => validateOmensRecipeLayoutsAggregate(invalid), OmensRecipeLayoutsError);
  }
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
