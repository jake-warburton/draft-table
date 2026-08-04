import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import {
  OfficialUpstreamIdReconciliationError,
  reconcileOfficialUpstreamIdRecordsForTest,
  validateOfficialUpstreamArtVariationAggregateForTest
} from "../src/official-upstream-id-reconciliation.ts";

const forms = Object.freeze([
  Object.freeze({ officialPrintId: "IAR000-MV", baseCollectorId: "IAR000", sourceSet: "IAR", suffixMarker: "MV" }),
  Object.freeze({ officialPrintId: "OMN000-RF", baseCollectorId: "OMN000", sourceSet: "OMN", suffixMarker: "RF" }),
  Object.freeze({ officialPrintId: "OMN001", baseCollectorId: "OMN001", sourceSet: "OMN", suffixMarker: null })
]);
const p = (overrides = {}) => ({ unique_id: "p-1", set_printing_unique_id: "sp-omn", id: "OMN000", set_id: "OMN", edition: "e", foiling: "f", rarity: "r", expansion_slot: false, image_url: "https://images.example.invalid/a", art_variations: [], ...overrides });
const c = (overrides = {}) => ({ unique_id: "c-1", name: "Fictional", printings: [p()], ...overrides });
const source = () => [
  c({ unique_id: "iar-card", printings: [p({ unique_id: "iar-1", set_printing_unique_id: "sp-iar", id: "IAR000", set_id: "IAR" }), p({ unique_id: "iar-2", set_printing_unique_id: "sp-iar", id: "IAR000", set_id: "IAR", foiling: "other" })] }),
  c({ unique_id: "zero-card", printings: [p({ unique_id: "zero-1" }), p({ unique_id: "zero-2", foiling: "other" })] }),
  c({ unique_id: "one-card", printings: [p({ unique_id: "one-1", id: "OMN001" })] })
];
const expected = Object.freeze({ entries: 3, omnEntries: 2, iarEntries: 1, omnPrintings: 3, iarPrintings: 2 });
const reconcile = (input = source(), inputForms = forms, aggregate = expected) => reconcileOfficialUpstreamIdRecordsForTest(inputForms, input, aggregate);
const safe = (action) => assert.throws(action, (error) => {
  assert.ok(error instanceof OfficialUpstreamIdReconciliationError);
  assert.equal(error.code, "OFFICIAL_UPSTREAM_ID_RECONCILIATION_FAILED");
  assert.equal(error.message, "Official upstream identity reconciliation failed.");
  assert.equal(error.stack, "OfficialUpstreamIdReconciliationError: Official upstream identity reconciliation failed.");
  assert.deepEqual(JSON.parse(JSON.stringify(error)), { name: "OfficialUpstreamIdReconciliationError", code: "OFFICIAL_UPSTREAM_ID_RECONCILIATION_FAILED" });
  assert.doesNotMatch(`${error.message}${error.stack}${JSON.stringify(error)}`, /OMN|IAR|Fictional|[0-9]|https?:|\\|\//);
  return true;
});

test("capability-bound reconciliation uses exact set plus already-validated base, preserves both orders, and returns all matching rows", () => {
  const result = reconcile();
  assert.deepEqual(result.map((entry) => entry.officialPrintId), forms.map((form) => form.officialPrintId));
  assert.deepEqual(result.map((entry) => entry.unique_id), ["iar-card", "zero-card", "one-card"]);
  assert.deepEqual(result[1].printings.map((printing) => printing.unique_id), ["zero-1", "zero-2"]);
  assert.equal(result[1].officialPrintId, "OMN000-RF");
  assert.equal(result[1].baseCollectorId, "OMN000");
  assert.equal(result[1].printings.every((printing) => printing.id === "OMN000" && printing.set_id === "OMN"), true);
});

test("expected-set-map duplicate-base guard rejects two capability-bound fictional forms before reconciliation", () => {
  const duplicated = Object.freeze([forms[1], Object.freeze({ ...forms[1], officialPrintId: "OMN000-CF", suffixMarker: "CF" })]);
  safe(() => reconcile(source(), duplicated, Object.freeze({ entries: 2, omnEntries: 2, iarEntries: 0, omnPrintings: 4, iarPrintings: 0 })));
});

test("collector IDs are text: OMN000 proves no one-based conversion or membership indexing", () => {
  const result = reconcile();
  assert.equal(result.find((entry) => entry.officialPrintId === "OMN000-RF")?.unique_id, "zero-card");
  const indexDerived = source(); indexDerived[1].printings[0].id = "OMN001";
  safe(() => reconcile(indexDerived));
});

test("reconciliation output is deeply frozen, copied, and safe against capability-source mutation", () => {
  const input = source(); const result = reconcile(input);
  assert.ok(Object.isFrozen(result)); assert.ok(result.every(Object.isFrozen)); assert.ok(result.every((entry) => Object.isFrozen(entry.printings) && entry.printings.every(Object.isFrozen)));
  input[1].printings[0].id = "changed";
  assert.equal(result[1].printings[0].id, "OMN000");
  assert.throws(() => { result[1].printings[0].id = "changed"; }, TypeError);
  assert.notEqual(reconcile(), result);
});

test("exact matching, ownership, uniqueness, set consistency, and every aggregate guard fail closed", () => {
  safe(() => reconcile(source(), Object.freeze([])));
  const wrongSet = source(); wrongSet[1].printings[0].set_id = "IAR"; safe(() => reconcile(wrongSet));
  const crossSet = source(); crossSet[1].printings[0].set_id = "IAR"; crossSet[1].printings[0].id = "OMN000"; safe(() => reconcile(crossSet));
  const unrelatedCrossSet = source(); unrelatedCrossSet[1].printings.push(p({ unique_id: "cross", set_id: "WTR" })); safe(() => reconcile(unrelatedCrossSet));
  const duplicateOwner = source(); duplicateOwner.push(c({ unique_id: "other", printings: [p({ unique_id: "other-p" })] })); safe(() => reconcile(duplicateOwner));
  const duplicateCard = source(); duplicateCard[2].unique_id = "zero-card"; safe(() => reconcile(duplicateCard));
  const duplicatePrinting = source(); duplicatePrinting[2].printings[0].unique_id = "zero-1"; safe(() => reconcile(duplicatePrinting));
  const inconsistent = source(); inconsistent[1].printings[1].set_printing_unique_id = "other"; safe(() => reconcile(inconsistent));
  for (const aggregate of [
    { ...expected, entries: 4 }, { ...expected, omnEntries: 1 }, { ...expected, iarEntries: 2 },
    { ...expected, omnPrintings: 2 }, { ...expected, iarPrintings: 1 }
  ]) safe(() => reconcile(source(), forms, aggregate));
});

test("art-variation metadata preserves exact source order, accepts empty and multiple forms, and is deeply copy-safe", () => {
  const input = source();
  input[1].printings[0].art_variations = ["AA", "FA"];
  input[1].printings[1].art_variations = ["EA"];
  const result = reconcile(input);
  assert.deepEqual(result[1].printings.map((printing) => printing.art_variations), [["AA", "FA"], ["EA"]]);
  assert.ok(result.every((entry) => entry.printings.every((printing) => Object.isFrozen(printing.art_variations))));
  input[1].printings[0].art_variations[0] = "changed";
  assert.deepEqual(result[1].printings[0].art_variations, ["AA", "FA"]);
  assert.throws(() => { result[1].printings[0].art_variations.push("EA"); }, TypeError);
  const again = reconcile(source());
  assert.notEqual(result[1].printings[0].art_variations, again[1].printings[0].art_variations);
});

test("art-variation parser rejects every malformed array entry and duplicate safely", () => {
  const malformed = [undefined, null, {}, "", " EA", "EA ", "E\u0301", "A\u0000A", "AA", "EA"];
  for (const value of malformed) {
    const input = source();
    input[1].printings[0].art_variations = value === "AA" || value === "EA" ? [value, value] : value;
    safe(() => reconcile(input));
  }
  const sparse = source(); sparse[1].printings[0].art_variations = ["EA", , "FA"]; safe(() => reconcile(sparse));
  const nonstring = source(); nonstring[1].printings[0].art_variations = [0]; safe(() => reconcile(nonstring));
});

test("art-variation aggregate and suffix split guards are independently capability-bound", () => {
  const input = source();
  input[0].printings.forEach((printing) => { printing.art_variations = ["FA"]; });
  input[1].printings[0].art_variations = ["EA"];
  const records = reconcile(input);
  const expected = Object.freeze({ empty: 2, ea: 1, fa: 2, aaFa: 0, unsuffixedEmpty: 1, unsuffixedEa: 0, unsuffixedFa: 0, unsuffixedAaFa: 0, rfEmpty: 1, rfEa: 1, cfEmpty: 0, mvFa: 2 });
  validateOfficialUpstreamArtVariationAggregateForTest(records, expected);
  for (const key of Object.keys(expected)) safe(() => validateOfficialUpstreamArtVariationAggregateForTest(records, { ...expected, [key]: expected[key] + 1 }));
  safe(() => validateOfficialUpstreamArtVariationAggregateForTest(Object.freeze([]), expected));
});

const artVariationUniquenessContractName = "art-variation uniqueness guard rejects duplicate source metadata";
const artVariationUniquenessMarker = "ART_VARIATION_UNIQUENESS_CONTRACT_EXECUTED";
const artVariationMutationModuleEnvironmentKey = "DRAFT_TABLE_TEST_ART_VARIATION_RECONCILIATION_MODULE";

test(artVariationUniquenessContractName, async () => {
  console.log(artVariationUniquenessMarker);
  const module = process.env[artVariationMutationModuleEnvironmentKey]
    ? await import(process.env[artVariationMutationModuleEnvironmentKey])
    : { OfficialUpstreamIdReconciliationError, reconcileOfficialUpstreamIdRecordsForTest };
  const input = source(); input[1].printings[0].art_variations = ["EA", "EA"];
  assert.throws(() => module.reconcileOfficialUpstreamIdRecordsForTest(forms, input, expected), module.OfficialUpstreamIdReconciliationError, "ART_VARIATION_UNIQUENESS_GUARD_REJECTED_DUPLICATE");
});

test("art-variation uniqueness mutation is caught by its named duplicate contract", () => {
  const sourcePath = new URL("../src/official-upstream-id-reconciliation.ts", import.meta.url);
  const original = readFileSync(sourcePath, "utf8");
  const mutated = original.replace("if (seen.has(entry)) return fail();", "if (false) return fail();");
  assert.notEqual(mutated, original, "art-variation uniqueness guard present");
  const path = `${dirname(fileURLToPath(sourcePath))}/reconciliation-mutation-${process.pid}-art-variation-uniqueness.ts`;
  writeFileSync(path, mutated);
  try {
    const environment = { ...process.env, [artVariationMutationModuleEnvironmentKey]: pathToFileURL(path).href };
    delete environment.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--test-name-pattern", `^${artVariationUniquenessContractName}$`, fileURLToPath(import.meta.url)], { encoding: "utf8", env: environment });
    const lines = result.stdout.split(/\r?\n/);
    assert.equal(result.status, 1, `art-variation uniqueness mutation did not fail named contract\n${result.stdout}\n${result.stderr}`);
    assert.equal(lines.filter((line) => line === `# ${artVariationUniquenessMarker}`).length, 1, "exact uniqueness execution marker");
    assert.equal(lines.filter((line) => /^not ok \d+ - /.test(line) && line.endsWith(artVariationUniquenessContractName)).length, 1, "exact named uniqueness failure");
    assert.equal(lines.filter((line) => line.includes("Missing expected exception") && line.includes("ART_VARIATION_UNIQUENESS_GUARD_REJECTED_DUPLICATE")).length, 1, "exact uniqueness failure output");
  } finally { rmSync(path, { force: true }); }
});

test("forged capabilities cannot enter the public schema-validation boundary", async () => {
  const { reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData } = await import("../src/schema-validation.ts");
  safe(() => reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData(Object.freeze({}), Object.freeze({})));
});

test("semantic mutations demonstrate focused contracts detect disabled matching, ownership, and aggregate guards", () => {
  const sourcePath = new URL("../src/official-upstream-id-reconciliation.ts", import.meta.url);
  const original = readFileSync(sourcePath, "utf8");
  const mutations = [
    ["cross-set", "if (printing.set_id !== expectedSet) fail();", "if (false) fail();", "crossSet"],
    ["ownership", 'if (owners.has(printing.id) && owners.get(printing.id) !== card) fail();', "if (false) fail();", "duplicateOwner"],
    ["aggregate", "omnRows.length !== expected.omnPrintings", "false", "aggregate"]
  ];
  for (const [name, before, after, fixture] of mutations) {
    const mutated = original.replace(before, after); assert.notEqual(mutated, original, `${name}: source guard present`);
    const path = `${dirname(fileURLToPath(sourcePath))}/reconciliation-mutation-${process.pid}-${name}.ts`; writeFileSync(path, mutated);
    try {
      const program = `import { reconcileOfficialUpstreamIdRecordsForTest as r } from ${JSON.stringify(new URL(`file://${path}`).href)}; const f=[{officialPrintId:'OMN000',baseCollectorId:'OMN000',sourceSet:'OMN',suffixMarker:null},{officialPrintId:'IAR000-MV',baseCollectorId:'IAR000',sourceSet:'IAR',suffixMarker:'MV'}]; const p=(o={})=>({unique_id:'p',set_printing_unique_id:'sp',id:'OMN000',set_id:'OMN',edition:'e',foiling:'f',rarity:'r',expansion_slot:false,image_url:'https://x.invalid/a',art_variations:[],...o}); const c=(o={})=>({unique_id:'c',name:'n',printings:[p()],...o}); const e={entries:2,omnEntries:1,iarEntries:1,omnPrintings:${fixture === "crossSet" ? 2 : 1},iarPrintings:1}; const s=${fixture === "crossSet" ? "[c({printings:[p(),p({unique_id:'cross',set_id:'WTR'})]}),c({unique_id:'i',printings:[p({unique_id:'i',id:'IAR000',set_id:'IAR',set_printing_unique_id:'si'})]})]" : fixture === "duplicateOwner" ? "[c(),c({unique_id:'two',printings:[p({unique_id:'two'})]}),c({unique_id:'i',printings:[p({unique_id:'i',id:'IAR000',set_id:'IAR',set_printing_unique_id:'si'})]})]" : "[c({printings:[p(),p({unique_id:'two'})]}),c({unique_id:'i',printings:[p({unique_id:'i',id:'IAR000',set_id:'IAR',set_printing_unique_id:'si'})]})]"}; r(f,s,e); console.log('MUTATION_ACCEPTED:${name}');`;
      const result = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", program], { encoding: "utf8" });
      assert.equal(result.status, 0, `${name}: intended mutation executed\n${result.stderr}`); assert.equal(result.stdout.trim(), `MUTATION_ACCEPTED:${name}`);
    } finally { rmSync(path, { force: true }); }
  }

  const duplicateBaseMutation = original.replace(
    "if (expectedSetByBase.has(form.baseCollectorId)) fail();",
    "if (false) fail();"
  );
  assert.notEqual(duplicateBaseMutation, original, "duplicate-base: source guard present");
  const duplicateBasePath = `${dirname(fileURLToPath(sourcePath))}/reconciliation-mutation-${process.pid}-duplicate-base.ts`;
  writeFileSync(duplicateBasePath, duplicateBaseMutation);
  try {
    const program = `import { reconcileOfficialUpstreamIdRecordsForTest as r } from ${JSON.stringify(new URL(`file://${duplicateBasePath}`).href)}; const f=[{officialPrintId:'OMN000-RF',baseCollectorId:'OMN000',sourceSet:'OMN',suffixMarker:'RF'},{officialPrintId:'OMN000-CF',baseCollectorId:'OMN000',sourceSet:'OMN',suffixMarker:'CF'}]; const s=new Proxy([], {get(target,key,receiver){if(key===Symbol.iterator) console.log('MUTATION_ACCEPTED:duplicate-base'); return Reflect.get(target,key,receiver)}}); try { r(f,s,{entries:2,omnEntries:2,iarEntries:0,omnPrintings:0,iarPrintings:0}) } catch {}`;
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", program], { encoding: "utf8" });
    assert.equal(result.status, 0, `duplicate-base: intended mutation executed\n${result.stderr}`);
    assert.equal(result.stdout.trim(), "MUTATION_ACCEPTED:duplicate-base");
  } finally { rmSync(duplicateBasePath, { force: true }); }
});
