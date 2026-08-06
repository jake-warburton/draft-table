import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { pathToFileURL } from "node:url";
import {
  OmnSourceProjectionError,
  projectSchemaValidatedFabEnglishCardDataForOmn
} from "../src/schema-validation.ts";
import {
  projectOmnSourceRecordsForTest,
  validateOmnSourceProjectionAggregateForTest
} from "../src/omn-source-projection.ts";
import {
  validateFabCardSchemaDocumentFromTrustedBytes,
  validateFabEnglishCardDocumentFromTrustedBytes
} from "../src/public-source-document.ts";
import { validateFabCardDataDocumentsForSchema } from "../src/public-source-schema-validation.ts";

const bytes = (value) => new TextEncoder().encode(JSON.stringify(value));
const card = (value) => validateFabEnglishCardDocumentFromTrustedBytes(bytes(value));
const schema = (value) => validateFabCardSchemaDocumentFromTrustedBytes(bytes(value));
const sourcePrinting = (overrides = {}) => ({
  unique_id: "printing-1", set_printing_unique_id: "set-printing-1", id: "1", set_id: "OMN",
  edition: "First Edition", foiling: "Rainbow Foil", rarity: "Common", expansion_slot: false,
  image_url: "https://images.example.invalid/card.jpg", ...overrides
});
const sourceCard = (overrides = {}) => ({ unique_id: "card-1", name: "Fictional", types: ["Fictional Class", "Action"], printings: [sourcePrinting()], ...overrides });
const fixtureSchema = {
  $schema: "http://json-schema.org/draft-04/schema#", type: "array",
  items: { type: "object", properties: { unique_id: { type: "string" }, name: { type: "string" }, types: { type: "array" }, printings: { type: "array" } }, required: ["unique_id", "name", "types", "printings"] }
};
const projected = (cards) => projectOmnSourceRecordsForTest(cards);
const snapshotMutation = (sourcePath, mutated, label) => {
  let directory;
  try {
    directory = mkdtempSync(join(tmpdir(), `draft-table-${label}-`));
    const sourceDirectory = new URL("./", sourcePath);
    const isolated = mutated.replace(/from "(\.\/[^"\n]+)"/gu, (_match, specifier) => `from ${JSON.stringify(new URL(specifier, sourceDirectory).href)}`);
    const path = join(directory, "module.ts");
    writeFileSync(path, isolated);
    return { directory, path };
  } catch (error) {
    if (directory !== undefined) rmSync(directory, { force: true, recursive: true });
    throw error;
  }
};
const expectError = (action) => assert.throws(action, (error) => {
  assert.ok(error instanceof OmnSourceProjectionError);
  assert.equal(error.code, "OMN_SOURCE_PROJECTION_FAILED");
  assert.equal(error.message, "OMN source projection failed.");
  assert.equal(error.stack, "OmnSourceProjectionError: OMN source projection failed.");
  assert.deepEqual(JSON.parse(JSON.stringify(error)), { name: "OmnSourceProjectionError", code: "OMN_SOURCE_PROJECTION_FAILED" });
  assert.doesNotMatch(`${error.message}${error.stack}${JSON.stringify(error)}`, /fictional|field|index|https?:|\\|\//i);
  return true;
});

test("OMN projection exactly filters mixed-set printings, maps source fields, and preserves source order", () => {
  const result = projected([
    sourceCard({ unique_id: "card-b", name: "Second", printings: [sourcePrinting({ unique_id: "p-no", set_printing_unique_id: "sp-no", set_id: "IAR" }), sourcePrinting({ unique_id: "p-b", id: "2" })] }),
    sourceCard({ unique_id: "card-a", name: "First", printings: [sourcePrinting({ unique_id: "p-a2", id: "1", foiling: "Cold Foil" }), sourcePrinting({ unique_id: "p-a1", id: "1" })] })
  ]);
  assert.deepEqual(result, [
    { unique_id: "card-b", name: "Second", types: ["Fictional Class", "Action"], printings: [{ unique_id: "p-b", set_printing_unique_id: "set-printing-1", id: "2", set_id: "OMN", edition: "First Edition", foiling: "Rainbow Foil", rarity: "Common", expansion_slot: false, image_url: "https://images.example.invalid/card.jpg" }] },
    { unique_id: "card-a", name: "First", types: ["Fictional Class", "Action"], printings: [
      { unique_id: "p-a2", set_printing_unique_id: "set-printing-1", id: "1", set_id: "OMN", edition: "First Edition", foiling: "Cold Foil", rarity: "Common", expansion_slot: false, image_url: "https://images.example.invalid/card.jpg" },
      { unique_id: "p-a1", set_printing_unique_id: "set-printing-1", id: "1", set_id: "OMN", edition: "First Edition", foiling: "Rainbow Foil", rarity: "Common", expansion_slot: false, image_url: "https://images.example.invalid/card.jpg" }
    ] }
  ]);
  assert.equal(new Set(result.flatMap((entry) => entry.printings.map((printing) => printing.id))).size, 2);
});

test("OMN projection preserves legitimate same collector and foiling collisions", () => {
  const input = [sourceCard({ printings: [
    sourcePrinting({ unique_id: "printing-first", id: "shared-collector", foiling: "Rainbow Foil", rarity: "Common" }),
    sourcePrinting({ unique_id: "printing-second", id: "shared-collector", foiling: "Rainbow Foil", rarity: "Common" })
  ] })];
  const result = projected(input);
  const printings = result[0].printings;
  assert.equal(printings.length, 2);
  assert.deepEqual(printings.map(({ unique_id, id, foiling, rarity }) => ({ unique_id, id, foiling, rarity })), [
    { unique_id: "printing-first", id: "shared-collector", foiling: "Rainbow Foil", rarity: "Common" },
    { unique_id: "printing-second", id: "shared-collector", foiling: "Rainbow Foil", rarity: "Common" }
  ]);
  assert.equal(new Set(printings.map(({ unique_id }) => unique_id)).size, 2);
  assert.equal(new Set(printings.map(({ set_printing_unique_id }) => set_printing_unique_id)).size, 1);
  assert.ok(printings.every((printing) => Object.isFrozen(printing)));
});

test("OMN collision contract fails under semantic (id, foiling) deduplication", () => {
  const sourcePath = new URL("../src/omn-source-projection.ts", import.meta.url);
  const original = readFileSync(sourcePath, "utf8");
  const before = "printings.push(frozen({";
  const after = "if (!printings.some((candidate) => candidate.id === id && candidate.foiling === foiling)) printings.push(frozen({";
  const mutated = original.replace(before, after);
  assert.notEqual(mutated, original);
  const snapshot = snapshotMutation(sourcePath, mutated, "omn-source-projection-collision");
  try {
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", `import { projectOmnSourceRecordsForTest } from ${JSON.stringify(pathToFileURL(snapshot.path).href)}; const p = (o={}) => ({unique_id:'p',set_printing_unique_id:'sp',id:'shared',set_id:'OMN',edition:'e',foiling:'Rainbow Foil',rarity:'r',expansion_slot:false,image_url:'https://x.invalid/a',...o}); const output=projectOmnSourceRecordsForTest([{unique_id:'c',name:'n',types:['Action'],printings:[p({unique_id:'first'}),p({unique_id:'second'})]}]); const actual=output[0].printings.map(({unique_id,id,foiling,rarity})=>({unique_id,id,foiling,rarity})); const expected=[{unique_id:'first',id:'shared',foiling:'Rainbow Foil',rarity:'r'},{unique_id:'second',id:'shared',foiling:'Rainbow Foil',rarity:'r'}]; if (JSON.stringify(actual) !== JSON.stringify(expected)) process.exit(42);`], { encoding: "utf8" });
    assert.equal(result.status, 42, result.stderr);
  } finally { rmSync(snapshot.directory, { force: true, recursive: true }); }
});

test("OMN projection deep-freezes copied output independently from the source tree", () => {
  const input = [sourceCard()];
  const result = projected(input);
  assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result[0])); assert.ok(Object.isFrozen(result[0].printings)); assert.ok(Object.isFrozen(result[0].printings[0]));
  input[0].name = "Changed"; input[0].printings[0].image_url = "https://images.example.invalid/changed.jpg";
  assert.equal(result[0].name, "Fictional"); assert.equal(result[0].printings[0].image_url, "https://images.example.invalid/card.jpg");
  assert.throws(() => { result[0].printings[0].id = "changed"; }, TypeError);
});

test("OMN projection independently rejects malformed values, zero OMN rows, and each duplicate identity class", () => {
  const malformed = [
    sourceCard({ unique_id: "" }), sourceCard({ name: null }), sourceCard({ printings: null }),
    sourceCard({ printings: [sourcePrinting({ id: "" })] }), sourceCard({ printings: [sourcePrinting({ set_printing_unique_id: "" })] }), sourceCard({ printings: [sourcePrinting({ image_url: "http://images.example.invalid/card.jpg" })] }),
    sourceCard({ printings: [sourcePrinting({ expansion_slot: "false" })] })
  ];
  for (const entry of malformed) expectError(() => projected([entry]));
  for (const types of [null, [], "Action", [""], [" padded "], ["e\u0301"], ["line\nfeed"], ["Action", "Action"], [null], [{}], Object.assign(["Action"], { 1: undefined, length: 2 })]) {
    expectError(() => projected([sourceCard({ types })]));
  }
  const unsafeText = [" padded ", "e\u0301", "line\nfeed"];
  const cardFields = ["unique_id", "name"];
  const printingFields = ["unique_id", "set_printing_unique_id", "id", "edition", "foiling", "rarity", "image_url"];
  for (const value of unsafeText) {
    for (const field of cardFields) expectError(() => projected([sourceCard({ [field]: value })]));
    for (const field of printingFields) expectError(() => projected([sourceCard({ printings: [sourcePrinting({ [field]: value })] })]));
  }
  expectError(() => projected([sourceCard({ printings: [sourcePrinting({ set_id: "IAR" })] })]));
  expectError(() => projected([sourceCard(), sourceCard({ name: "Duplicate card", printings: [sourcePrinting({ unique_id: "p-2" })] })]));
  expectError(() => projected([sourceCard(), sourceCard({ unique_id: "card-2", printings: [sourcePrinting({ unique_id: "p-2", set_printing_unique_id: "other-set-printing" })] })]));
  expectError(() => projected([sourceCard(), sourceCard({ unique_id: "card-2", printings: [sourcePrinting()] })]));
});

test("aggregate validation is separate for compact fixtures and enforces all public count guards", () => {
  const result = projected([sourceCard()]);
  assert.doesNotThrow(() => validateOmnSourceProjectionAggregateForTest(result, { cardRecords: 1, printingRows: 1, collectorIds: 1 }));
  for (const expected of [{ cardRecords: 2, printingRows: 1, collectorIds: 1 }, { cardRecords: 1, printingRows: 2, collectorIds: 1 }, { cardRecords: 1, printingRows: 1, collectorIds: 2 }])
    expectError(() => validateOmnSourceProjectionAggregateForTest(result, expected));
});

test("only the schema-validated capability reaches the public OMN projection entry point", () => {
  const capability = validateFabCardDataDocumentsForSchema(card([sourceCard()]), schema(fixtureSchema));
  expectError(() => projectSchemaValidatedFabEnglishCardDataForOmn(capability));
  expectError(() => projectSchemaValidatedFabEnglishCardDataForOmn(Object.freeze({})));
  const source = readFileSync(new URL("../src/schema-validation.ts", import.meta.url), "utf8");
  assert.match(source, /readSchemaValidatedFabEnglishCardDataForParser/);
  assert.match(source, /projectOmnSourceRecords/);
  assert.doesNotMatch(source, /JSON\.parse|Ajv/);
});

test("semantic mutation contracts prove exact set filtering and each aggregate guard", () => {
  const sourcePath = new URL("../src/omn-source-projection.ts", import.meta.url);
  const original = readFileSync(sourcePath, "utf8");
  const mutations = [
    ["set filter", 'printing.set_id !== "OMN"', 'printing.set_id !== "IAR"', "mixed set filtering", 1],
    ["card aggregate", "records.length !== expected.cardRecords", "false", "card aggregate", 0],
    ["printing aggregate", "printingRows.length !== expected.printingRows", "false", "printing aggregate", 0],
    ["collector aggregate", "collectorIds.size !== expected.collectorIds", "false", "collector aggregate", 0]
  ];
  for (const [name, before, after, contract, expectedStatus] of mutations) {
    const mutated = original.replace(before, after); assert.notEqual(mutated, original, name);
    const snapshot = snapshotMutation(sourcePath, mutated, `omn-source-projection-${name.replaceAll(" ", "-")}`);
    try {
      const result = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", `import { projectOmnSourceRecordsForTest, validateOmnSourceProjectionAggregateForTest } from ${JSON.stringify(pathToFileURL(snapshot.path).href)}; const p = (o={}) => ({unique_id:'p',set_printing_unique_id:'sp',id:'1',set_id:'OMN',edition:'e',foiling:'f',rarity:'r',expansion_slot:false,image_url:'https://x.invalid/a',...o}); const c = (o={}) => ({unique_id:'c',name:'n',types:['Action'],printings:[p()],...o}); ${name === "set filter" ? "const output=projectOmnSourceRecordsForTest([c({printings:[p(),p({unique_id:'iar',set_printing_unique_id:'sp',set_id:'IAR'})]})]); if (output.length !== 1 || output[0].printings.length !== 1 || output[0].printings[0].unique_id !== 'p') process.exit(1);" : `const output=projectOmnSourceRecordsForTest([c()]); validateOmnSourceProjectionAggregateForTest(output, ${name === "card aggregate" ? "{cardRecords:2,printingRows:1,collectorIds:1}" : name === "printing aggregate" ? "{cardRecords:1,printingRows:2,collectorIds:1}" : "{cardRecords:1,printingRows:1,collectorIds:2}"});`}`], { encoding: "utf8" });
      assert.equal(result.status, expectedStatus, `${contract}: ${result.stderr}`);
    } finally { rmSync(snapshot.directory, { force: true, recursive: true }); }
  }
});
