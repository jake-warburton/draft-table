import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  OmensRecipeChecksumError,
  OmensRecipePoolsError,
  parseVerifiedOmensPools,
  verifyOmensRecipeBytes
} from "../src/index.ts";
import { parseOmensPoolsFromTrustedBytes, validateOmensRecipePoolsAggregate } from "../src/pools.ts";

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
const layouts = "\t- Fictional Layout (7)\r\n\t\t2 Fictional Alpha Pool\r\n\t\t12 Fictional Beta Pool";
const source = (pools) => Buffer.from(
  `\ufeff[Settings]\r\n${settings}\r\n[CustomCards]\r\n${cards}\r\n[Layouts]\r\n${layouts}\r\n${pools}`,
  "utf8"
);
const validPools = "[FictionalAlpha]\r\n3 Fictional Aster (OMN-001)\r\n1 Fictional Beryl\r\n[FictionalBeta]\r\n2 Fictional Cinder (OMN-003)";

const expectPoolsError = (bytes) => {
  assert.throws(() => parseOmensPoolsFromTrustedBytes(bytes), (error) => {
    assert.ok(error instanceof OmensRecipePoolsError);
    assert.equal(error.code, "OMENS_RECIPE_POOLS_INVALID");
    assert.equal(error.message, "Omens recipe pools are invalid.");
    assert.equal(error.stack, "OmensRecipePoolsError: Omens recipe pools are invalid.");
    assert.deepEqual(JSON.parse(JSON.stringify(error)), {
      code: "OMENS_RECIPE_POOLS_INVALID",
      name: "OmensRecipePoolsError"
    });
    return true;
  });
};

test("parses the observed pool section grammar into a minimal immutable opaque schema", () => {
  const bytes = source(validPools);
  const schema = parseOmensPoolsFromTrustedBytes(bytes);
  bytes.fill(0);

  assert.deepEqual(schema, {
    pools: [
      { name: "FictionalAlpha", entries: [{ weight: 3, reference: "Fictional Aster (OMN-001)" }, { weight: 1, reference: "Fictional Beryl" }] },
      { name: "FictionalBeta", entries: [{ weight: 2, reference: "Fictional Cinder (OMN-003)" }] }
    ]
  });
  assert.ok(Object.isFrozen(schema));
  assert.ok(Object.isFrozen(schema.pools));
  assert.ok(schema.pools.every((pool) => Object.isFrozen(pool) && Object.isFrozen(pool.entries) && pool.entries.every(Object.isFrozen)));
  assert.throws(() => { schema.pools[0].name = "changed"; }, TypeError);
  assert.throws(() => { schema.pools[0].entries.push({}); }, TypeError);
});

test("rejects pool framing, headers, ordering, empty sections, and blank or extra lines", () => {
  expectPoolsError(source(""));
  expectPoolsError(source("[Fictional Alpha]\r\n1 Fictional Aster"));
  expectPoolsError(source("[FictionalAlpha]\r\n"));
  expectPoolsError(source(validPools.replace("\r\n[FictionalBeta]", "\r\n\r\n[FictionalBeta]")));
  expectPoolsError(source(validPools.replace("[FictionalBeta]", "not a header\r\n[FictionalBeta]")));
  expectPoolsError(Buffer.from(`\ufeff[Settings]\r\n${settings}\r\n[CustomCards]\r\n${cards}\r\n[FictionalAlpha]\r\n1 Fictional Aster`, "utf8"));
  expectPoolsError(source(validPools.replace("[FictionalBeta]", "[FictionalAlpha]")));
});

test("rejects every pool-entry indentation or delimiter mutation", () => {
  for (const replacement of [
    "\t3 Fictional Aster (OMN-001)",
    " 3 Fictional Aster (OMN-001)",
    "3  Fictional Aster (OMN-001)",
    "3\tFictional Aster (OMN-001)",
    "3 Fictional Aster (OMN-001) ",
    "3"
  ]) {
    expectPoolsError(source(validPools.replace("3 Fictional Aster (OMN-001)", replacement)));
  }
});

test("rejects malformed entry text, numeric fields, and duplicate pool entries without resolving references", () => {
  for (const replacement of [
    "0 Fictional Aster",
    "-1 Fictional Aster",
    "03 Fictional Aster",
    "9007199254740992 Fictional Aster",
    "3 Fictional\u0000Aster",
    "3 Fictional\u0080Aster",
    "3 Fictional Cafe\u0301"
  ]) expectPoolsError(source(validPools.replace("3 Fictional Aster (OMN-001)", replacement)));

  expectPoolsError(source(validPools.replace("1 Fictional Beryl", "1 Fictional Aster (OMN-001)")));
  assert.deepEqual(
    parseOmensPoolsFromTrustedBytes(source("[FictionalAlpha]\r\n3 Unknown External Reference\r\n[FictionalBeta]\r\n1 Another Unresolved Reference")),
    { pools: [{ name: "FictionalAlpha", entries: [{ weight: 3, reference: "Unknown External Reference" }] }, { name: "FictionalBeta", entries: [{ weight: 1, reference: "Another Unresolved Reference" }] }] }
  );
});

test("pool errors never disclose source evidence", () => {
  assert.throws(() => parseOmensPoolsFromTrustedBytes(source(validPools.replace("Fictional Aster (OMN-001)", "Private Secret\u0000"))), (error) => {
    const disclosure = `${error.message}\n${error.stack}\n${JSON.stringify(error)}`;
    assert.doesNotMatch(disclosure, /private|secret|fictional|\//i);
    return true;
  });
});

test("the public pool parser accepts only pinned verified Omens bytes and verifies before parsing", () => {
  assert.throws(() => parseVerifiedOmensPools(Object.freeze({})), TypeError);
  assert.throws(() => parseVerifiedOmensPools(verifyOmensRecipeBytes(source(validPools))), OmensRecipeChecksumError);
});

const aggregateFixture = () => ({ pools: [
  ["Wizard", 24, 159], ["Illusionist", 24, 160], ["Runeblade", 24, 164], ["Lightning", 42, 227],
  ["Generic", 6, 28], ["Equipment", 14, 148], ["Rare", 60, 120], ["Majestic", 15, 30],
  ["Rfcommon", 105, 105], ["RFRare", 59, 59], ["RFMajestic", 7, 7]
].map(([name, count, total]) => ({ name, entries: Array.from({ length: count }, (_, index) => ({ weight: index === 0 ? total - count + 1 : 1, reference: `${name}-${index}` })) })) });

test("validates pinned pool aggregates independently at the internal seam", () => {
  const fixture = aggregateFixture();
  fixture.pools.reverse();
  assert.equal(validateOmensRecipePoolsAggregate(fixture), fixture);
  assert.deepEqual(fixture.pools.map(({ name }) => name), [
    "RFMajestic", "RFRare", "Rfcommon", "Majestic", "Rare", "Equipment",
    "Generic", "Lightning", "Runeblade", "Illusionist", "Wizard"
  ]);

  for (const mutate of [
    (p) => p.pools.pop(),
    (p) => p.pools.push({ name: "Extra", entries: [{ weight: 1, reference: "x" }] }),
    (p) => { p.pools[0].name = "Wrong"; },
    (p) => { p.pools[10] = p.pools[0]; },
    (p) => p.pools[0].entries.pop(),
    (p) => { p.pools[0].entries[0] = { weight: 1, reference: "x" }; },
    (p) => { p.pools[0].entries[0] = { weight: Number.MAX_SAFE_INTEGER, reference: "x" }; }
  ]) {
    const broken = aggregateFixture();
    mutate(broken);
    assert.throws(() => validateOmensRecipePoolsAggregate(broken), (error) => {
      assert.ok(error instanceof OmensRecipePoolsError);
      assert.equal(error.code, "OMENS_RECIPE_POOLS_INVALID");
      assert.equal(error.message, "Omens recipe pools are invalid.");
      assert.equal(error.stack, "OmensRecipePoolsError: Omens recipe pools are invalid.");
      return true;
    });
  }
});

test("private pools parse passed", { skip: !privateEvidencePath ? "private acceptance contract did not run; set OMENS_RECIPE_EVIDENCE_PATH or use npm run test:evidence" : false }, () => {
  const schema = parseVerifiedOmensPools(verifyOmensRecipeBytes(readFileSync(privateEvidencePath)));
  assert.ok(Object.isFrozen(schema));
  assert.ok(Object.isFrozen(schema.pools));
  assert.ok(schema.pools.every((pool) => Object.isFrozen(pool) && Object.isFrozen(pool.entries) && pool.entries.every(Object.isFrozen)));
});
