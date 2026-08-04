import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  OfficialSuffixFoilingClassificationError,
  classifyOfficialSuffixFoilingForTest
} from "../src/official-suffix-foiling-classification.ts";
import { reconcileOfficialUpstreamIdRecordsForTest } from "../src/official-upstream-id-reconciliation.ts";

const forms = Object.freeze([
  Object.freeze({ officialPrintId: "OMN000", baseCollectorId: "OMN000", sourceSet: "OMN", suffixMarker: null }),
  Object.freeze({ officialPrintId: "OMN001-RF", baseCollectorId: "OMN001", sourceSet: "OMN", suffixMarker: "RF" }),
  Object.freeze({ officialPrintId: "OMN002-CF", baseCollectorId: "OMN002", sourceSet: "OMN", suffixMarker: "CF" }),
  Object.freeze({ officialPrintId: "IAR000-MV", baseCollectorId: "IAR000", sourceSet: "IAR", suffixMarker: "MV" }),
  Object.freeze({ officialPrintId: "IAR001-MV", baseCollectorId: "IAR001", sourceSet: "IAR", suffixMarker: "MV" })
]);
const p = (id, unique_id, foiling) => ({ unique_id, set_printing_unique_id: id.startsWith("IAR") ? "sp-iar" : "sp-omn", id, set_id: id.slice(0, 3), edition: "e", foiling, rarity: "r", expansion_slot: false, image_url: "https://images.example.invalid/a" });
const c = (unique_id, printings) => ({ unique_id, name: "Fictional", printings });
const source = () => [
  c("card-0", [p("OMN000", "p-0-c", "C"), p("OMN000", "p-0-r", "R")]),
  c("card-1", [p("OMN001", "p-1-c", "C"), p("OMN001", "p-1-r", "R")]),
  c("card-2", [p("OMN002", "p-2-c", "C")]),
  c("card-3", [p("IAR000", "p-3-c-a", "C"), p("IAR000", "p-3-c-b", "C")]),
  c("card-4", [p("IAR001", "p-4-c", "C")])
];
const reconciliationAggregate = Object.freeze({ entries: 5, omnEntries: 3, iarEntries: 2, omnPrintings: 5, iarPrintings: 3 });
const aggregate = Object.freeze({ unspecifiedEntries: 1, unspecifiedCandidates: 2, rfEntries: 1, rfCandidates: 2, rfSelected: 1, cfEntries: 1, cfCandidates: 1, cfSelected: 1, mvEntries: 2, mvCandidates: 3, mvSelected: 3, mvOneRowEntries: 1, mvTwoRowEntries: 1, suffixEntries: 4, suffixCandidates: 6, selected: 5 });
const reconciliation = (input = source(), inputForms = forms) => reconcileOfficialUpstreamIdRecordsForTest(inputForms, input, Object.freeze({ ...reconciliationAggregate,
  omnPrintings: input.filter((card) => card.printings[0].set_id === "OMN").flatMap((card) => card.printings).length,
  iarPrintings: input.filter((card) => card.printings[0].set_id === "IAR").flatMap((card) => card.printings).length
}));
const classify = (input = source(), inputForms = forms, expected = aggregate) => classifyOfficialSuffixFoilingForTest(reconciliation(input, inputForms), expected);
const safe = (action) => assert.throws(action, (error) => {
  assert.ok(error instanceof OfficialSuffixFoilingClassificationError);
  assert.equal(error.code, "OFFICIAL_SUFFIX_FOILING_CLASSIFICATION_FAILED");
  assert.equal(error.message, "Official suffix foiling classification failed.");
  assert.equal(error.stack, "OfficialSuffixFoilingClassificationError: Official suffix foiling classification failed.");
  assert.deepEqual(JSON.parse(JSON.stringify(error)), { name: "OfficialSuffixFoilingClassificationError", code: "OFFICIAL_SUFFIX_FOILING_CLASSIFICATION_FAILED" });
  assert.doesNotMatch(`${error.message}${error.stack}${JSON.stringify(error)}`, /OMN|IAR|Fictional|[0-9]|https?:|\\|\//);
  return true;
});

test("capability-bound fictional marker correspondences preserve official order and select only observed upstream foiling rows", () => {
  const result = classify();
  assert.deepEqual(result.map((entry) => entry.officialPrintId), forms.map((form) => form.officialPrintId));
  const unspecified = result[0], rf = result[1], cf = result[2], mv = result[3];
  assert.deepEqual({ classification: unspecified.classification, requiredUpstreamFoiling: unspecified.requiredUpstreamFoiling, selected: unspecified.selectedCorrespondencePrintings.length }, { classification: "unspecified", requiredUpstreamFoiling: null, selected: 0 });
  assert.deepEqual(rf.candidatePrintings.map((row) => row.foiling), ["C", "R"]);
  assert.deepEqual(rf.selectedCorrespondencePrintings.map((row) => row.foiling), ["R"]);
  assert.deepEqual(cf.selectedCorrespondencePrintings.map((row) => row.foiling), ["C"]);
  assert.deepEqual(mv.selectedCorrespondencePrintings.map((row) => row.foiling), ["C", "C"]);
  assert.equal(result[4].selectedCorrespondencePrintings.length, 1);
});

test("classification is deeply immutable, fresh, and copy-safe", () => {
  const input = source(); const result = classify(input); const again = classify();
  assert.ok(Object.isFrozen(result)); assert.ok(result.every(Object.isFrozen));
  assert.ok(result.every((entry) => Object.isFrozen(entry.candidatePrintings) && Object.isFrozen(entry.selectedCorrespondencePrintings)));
  assert.ok(result.every((entry) => entry.candidatePrintings.every(Object.isFrozen) && entry.selectedCorrespondencePrintings.every(Object.isFrozen)));
  input[1].printings[1].foiling = "C";
  assert.equal(result[1].selectedCorrespondencePrintings[0].foiling, "R");
  assert.notEqual(result, again); assert.notEqual(result[1], again[1]);
  assert.throws(() => { result[1].selectedCorrespondencePrintings[0].foiling = "C"; }, TypeError);
});

test("forgery and every marker, row-selection, multiplicity, uniqueness, and aggregate drift fail safely", async () => {
  safe(() => classifyOfficialSuffixFoilingForTest(Object.freeze([]), aggregate));
  const forged = await import("../src/schema-validation.ts");
  safe(() => forged.classifyOfficialCardVaultSuffixFoiling(Object.freeze([])));
  const cases = [
    () => { const x = source(); x[1].printings[1].foiling = "C"; return x; },
    () => { const x = source(); x[1].printings.push(p("OMN001", "p-1-r-2", "R")); return x; },
    () => { const x = source(); x[2].printings[0].foiling = "R"; return x; },
    () => { const x = source(); x[2].printings.push(p("OMN002", "p-2-c-2", "C")); return x; },
    () => { const x = source(); x[3].printings[1].foiling = "R"; return x; },
    () => { const x = source(); x[3].printings.pop(); return x; },
    () => { const x = source(); x[4].printings.push(p("IAR001", "p-4-c-2", "C")); return x; },
    () => { const x = source(); x[1].printings[0].foiling = "X"; return x; }
  ];
  for (const mutate of cases) safe(() => classify(mutate()));
  for (const key of Object.keys(aggregate)) safe(() => classify(source(), forms, { ...aggregate, [key]: aggregate[key] + 1 }));
});

test("semantic mutations prove every named classification guard owns its focused contract", () => {
  const sourcePath = new URL("../src/official-suffix-foiling-classification.ts", import.meta.url);
  const original = readFileSync(sourcePath, "utf8");
  const mutations = [
    ["mapping", [['if (rows.some((row) => row.foiling !== "C")) fail();', 'if (false && rows.some((row) => row.foiling !== "C")) fail();']], "x[3].printings[1].foiling='R'", {}],
    ["selection", [['if (rows.length !== 1 || selected.length !== 1) fail();', 'if (rows.length !== 1 || false) fail();']], "x[2].printings[0].foiling='R'", { cfSelected: 0, selected: 4 }],
    ["multiplicity", [['if (rows.length !== 1 && rows.length !== 2) fail();', 'if (false) fail();']], "x[3].printings.push(p('IAR000','u3c','C'))", { mvCandidates: 4, mvSelected: 4, suffixCandidates: 7, selected: 6 }],
    ["uniqueness", [
      ['selected = rows.filter((row) => row.foiling === "C");', 'selected = record.suffixMarker === "CF" ? [rows[0], rows[0]] : rows.filter((row) => row.foiling === "C");'],
      ['if (rows.length !== 1 || selected.length !== 1) fail();', 'if (rows.length !== 1 || false) fail();'],
      ['if (selectedIds.has(row.unique_id)) fail();', 'if (false) fail();']
    ], "", { cfSelected: 2 }],
    ["aggregate", [['selectedIds.size !== expected.selected', 'false']], "", { selected: 6 }]
  ];
  for (const [name, replacements, mutate, expectedOverrides] of mutations) {
    let mutated = original;
    for (const [before, after] of replacements) {
      const next = mutated.replace(before, after); assert.notEqual(next, mutated, `${name}: guard present`); mutated = next;
    }
    const path = `${dirname(fileURLToPath(sourcePath))}/suffix-foiling-mutation-${process.pid}-${name}.ts`; writeFileSync(path, mutated);
    try {
      const program = `import { reconcileOfficialUpstreamIdRecordsForTest as r } from ${JSON.stringify(new URL("../src/official-upstream-id-reconciliation.ts", import.meta.url).href)}; import { classifyOfficialSuffixFoilingForTest as c } from ${JSON.stringify(new URL(`file://${path}`).href)}; const p=(id,u,f)=>({unique_id:u,set_printing_unique_id:id.slice(0,3)==='IAR'?'si':'so',id,set_id:id.slice(0,3),edition:'e',foiling:f,rarity:'r',expansion_slot:false,image_url:'https://x.invalid/a'}); const f=[{officialPrintId:'OMN000',baseCollectorId:'OMN000',sourceSet:'OMN',suffixMarker:null},{officialPrintId:'OMN001-RF',baseCollectorId:'OMN001',sourceSet:'OMN',suffixMarker:'RF'},{officialPrintId:'OMN002-CF',baseCollectorId:'OMN002',sourceSet:'OMN',suffixMarker:'CF'},{officialPrintId:'IAR000-MV',baseCollectorId:'IAR000',sourceSet:'IAR',suffixMarker:'MV'},{officialPrintId:'IAR001-MV',baseCollectorId:'IAR001',sourceSet:'IAR',suffixMarker:'MV'}]; const x=[['a',[p('OMN000','u0','C'),p('OMN000','u0r','R')]],['b',[p('OMN001','u1c','C'),p('OMN001','u1r','R')]],['c',[p('OMN002','u2','C')]],['d',[p('IAR000','p-3-c-a','C'),p('IAR000','u3b','C')]],['e',[p('IAR001','u4','C')]]].map(([unique_id,printings])=>({unique_id,name:'n',printings})); ${mutate}; const q=r(f,x,{entries:5,omnEntries:3,iarEntries:2,omnPrintings:x.slice(0,3).flatMap(a=>a.printings).length,iarPrintings:x.slice(3).flatMap(a=>a.printings).length}); const e={unspecifiedEntries:1,unspecifiedCandidates:2,rfEntries:1,rfCandidates:2,rfSelected:1,cfEntries:1,cfCandidates:1,cfSelected:1,mvEntries:2,mvCandidates:3,mvSelected:3,mvOneRowEntries:1,mvTwoRowEntries:1,suffixEntries:4,suffixCandidates:6,selected:5,...${JSON.stringify(expectedOverrides)}}; c(q,e); console.log('MUTATION_ACCEPTED:${name}');`;
      const result = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", program], { encoding: "utf8" });
      assert.equal(result.status, 0, `${name}: intended mutation executed\n${result.stderr}`); assert.equal(result.stdout.trim(), `MUTATION_ACCEPTED:${name}`);
    } finally { rmSync(path, { force: true }); }
  }
});
