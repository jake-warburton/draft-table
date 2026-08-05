import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { completeOmensRecipeCustomCardsAggregateForTest, parseOmensCustomCardsFromTrustedBytes } from "../src/custom-cards.ts";
import { reconcileOfficialUpstreamIdRecordsForTest } from "../src/official-upstream-id-reconciliation.ts";
import { reconcileOmensRecipeOfficialIdentityRecordsForTest } from "../src/recipe-official-identity-reconciliation.ts";
import {
  OmensRecipeRarityCorrespondenceError,
  reconcileOmensRecipeRarityCorrespondenceForTest
} from "../src/recipe-rarity-correspondence.ts";

const settings = JSON.stringify({ showSlots: true, withReplacement: false, cardBack: "https://cards.invalid/back.png" });
const card = (name, collector_number, rarity) => ({ name, collector_number, mana_cost: "2", rarity, type: "action", image_uris: { en: "https://cards.invalid/a.png" } });
const recipeBytes = (cards) => Buffer.from(`\ufeff[Settings]\r\n${settings}\r\n[CustomCards]\r\n${JSON.stringify(cards)}\r\n[Layouts]\r\nopaque`, "utf8");
const cards = Object.freeze([
  card("Exact Common", "TST100", "common"), card("First Anomaly", "TST101", "common"),
  card("Exact Rare", "TST102", "rare"), card("Second Anomaly", "TST103", "common"), card("Exact Majestic", "TST104", "mythic")
]);
const forms = Object.freeze([
  Object.freeze({ officialPrintId: "TST105", baseCollectorId: "TST105", sourceSet: "OMN", suffixMarker: null }),
  Object.freeze({ officialPrintId: "IAR200-MV", baseCollectorId: "IAR200", sourceSet: "IAR", suffixMarker: "MV" }),
  ...cards.map((entry) => Object.freeze({ officialPrintId: entry.collector_number, baseCollectorId: entry.collector_number, sourceSet: "OMN", suffixMarker: null }))
]);
const rarityById = new Map([["TST100", ["C", "C"]], ["TST101", ["C", "V"]], ["TST102", ["R"]], ["TST103", ["C", "V"]], ["TST104", ["M"]], ["TST105", ["unsupported"]], ["IAR200", ["also-unsupported"]]]);
const source = (rarities = rarityById, inputForms = forms) => inputForms.map((form, cardIndex) => ({
  unique_id: `card-${cardIndex}`, name: cards.find((entry) => entry.collector_number === form.officialPrintId || entry.collector_number === form.baseCollectorId)?.name ?? "Outside Candidate", pitch: "",
  printings: (rarities.get(form.baseCollectorId) ?? []).map((rarity, rowIndex) => ({ unique_id: `printing-${cardIndex}-${rowIndex}`, set_printing_unique_id: `set-printing-${form.sourceSet}`, id: form.baseCollectorId, set_id: form.sourceSet, edition: "standard", foiling: "standard", rarity, expansion_slot: false, image_url: "https://images.invalid/a.png", art_variations: [] }))
}));
const recipe = () => completeOmensRecipeCustomCardsAggregateForTest(parseOmensCustomCardsFromTrustedBytes(recipeBytes(cards)), { common: 3, rare: 1, mythic: 1 });
const officialExpected = Object.freeze({ entries: 7, omnEntries: 6, iarEntries: 1, omnPrintings: 9, iarPrintings: 1 });
const official = (rarities = rarityById, inputForms = forms, inputSource = source(rarities, inputForms)) => reconcileOfficialUpstreamIdRecordsForTest(inputForms, inputSource, { ...officialExpected, omnPrintings: inputForms.filter((form) => form.sourceSet === "OMN").reduce((sum, form) => sum + (rarities.get(form.baseCollectorId)?.length ?? 0), 0) });
const identityExpected = Object.freeze({ recipeEntries: 5, officialEntries: 7, candidateEntries: 6, mappedEntries: 5, unmappedEntries: 2, unmappedOmn: 1, unmappedIar: 1, unmappedUnsuffixed: 1, unmappedRf: 0, unmappedCf: 0, unmappedMv: 1 });
const identities = (records = official()) => reconcileOmensRecipeOfficialIdentityRecordsForTest(recipe(), records, identityExpected);
const expected = Object.freeze({ entries: 5, exactCommonC: 1, anomalousCommonCV: 2, exactRareR: 1, exactMajesticM: 1, anomalyOfficialPrintIds: Object.freeze(["TST101", "TST103"]) });
const reconcile = (identity = identities(), records = official(), aggregate = expected) => reconcileOmensRecipeRarityCorrespondenceForTest(identity, records, aggregate);
const safe = (action) => assert.throws(action, (error) => {
  assert.ok(error instanceof OmensRecipeRarityCorrespondenceError);
  assert.equal(error.code, "OMENS_RECIPE_RARITY_CORRESPONDENCE_FAILED");
  assert.equal(error.message, "Omens recipe rarity correspondence failed.");
  assert.equal(error.stack, "OmensRecipeRarityCorrespondenceError: Omens recipe rarity correspondence failed.");
  assert.doesNotMatch(`${error.message}${error.stack}${JSON.stringify(error)}`, /Exact|Anomaly|TST|common|rare|mythic|unsupported|[0-9]|https?:|\\|\//i);
  return true;
});

test("three exact correspondences and two pinned common anomalies retain recipe order and every exact code", () => {
  assert.deepEqual(reconcile(), [
    { recipeCollectorNumber: "TST100", recipeRarityLabel: "common", fabRarity: "common", officialPrintId: "TST100", exactUpstreamRarityStrings: ["C", "C"], firstObservedUniqueUpstreamRarityStrings: ["C"], observedCorrespondenceClass: "exact-common-C", requiresDraftabilityTreatmentClassification: false },
    { recipeCollectorNumber: "TST101", recipeRarityLabel: "common", fabRarity: "common", officialPrintId: "TST101", exactUpstreamRarityStrings: ["C", "V"], firstObservedUniqueUpstreamRarityStrings: ["C", "V"], observedCorrespondenceClass: "pinned-common-C-V-anomaly", requiresDraftabilityTreatmentClassification: true },
    { recipeCollectorNumber: "TST102", recipeRarityLabel: "rare", fabRarity: "rare", officialPrintId: "TST102", exactUpstreamRarityStrings: ["R"], firstObservedUniqueUpstreamRarityStrings: ["R"], observedCorrespondenceClass: "exact-rare-R", requiresDraftabilityTreatmentClassification: false },
    { recipeCollectorNumber: "TST103", recipeRarityLabel: "common", fabRarity: "common", officialPrintId: "TST103", exactUpstreamRarityStrings: ["C", "V"], firstObservedUniqueUpstreamRarityStrings: ["C", "V"], observedCorrespondenceClass: "pinned-common-C-V-anomaly", requiresDraftabilityTreatmentClassification: true },
    { recipeCollectorNumber: "TST104", recipeRarityLabel: "mythic", fabRarity: "majestic", officialPrintId: "TST104", exactUpstreamRarityStrings: ["M"], firstObservedUniqueUpstreamRarityStrings: ["M"], observedCorrespondenceClass: "exact-majestic-M", requiresDraftabilityTreatmentClassification: false }
  ]);
});

test("every printing row code and a separate first-observed unique code set are retained", () => {
  assert.deepEqual(reconcile()[0].exactUpstreamRarityStrings, ["C", "C"]);
  assert.deepEqual(reconcile()[0].firstObservedUniqueUpstreamRarityStrings, ["C"]);
});

test("output is deeply immutable, fresh, and copy-independent", () => {
  const first = reconcile(), second = reconcile(); assert.ok(Object.isFrozen(first)); assert.notEqual(first, second);
  for (let index = 0; index < first.length; index++) { assert.ok(Object.isFrozen(first[index])); assert.ok(Object.isFrozen(first[index].exactUpstreamRarityStrings)); assert.ok(Object.isFrozen(first[index].firstObservedUniqueUpstreamRarityStrings)); assert.notEqual(first[index], second[index]); assert.notEqual(first[index].exactUpstreamRarityStrings, second[index].exactUpstreamRarityStrings); assert.notEqual(first[index].firstObservedUniqueUpstreamRarityStrings, second[index].firstObservedUniqueUpstreamRarityStrings); }
  assert.throws(() => first[0].exactUpstreamRarityStrings.push("V"), TypeError); assert.throws(() => first[0].firstObservedUniqueUpstreamRarityStrings.push("V"), TypeError); assert.throws(() => { first[0].recipeRarityLabel = "rare"; }, TypeError);
});

test("only both registered opaque reconciliation capabilities are accepted", () => {
  const identity = identities(), records = official(); safe(() => reconcile(Object.freeze([...identity.mapped]), records)); safe(() => reconcile(identity, Object.freeze([...records])));
  safe(() => reconcile(Object.freeze({ mapped: identity.mapped, unmapped: identity.unmapped }), records));
});

test("exact one-to-one official, base, and card ownership is required across genuine opaque capabilities", () => {
  const records = official(), identity = identities(records);
  for (const key of ["officialPrintId", "officialBaseCollectorId", "officialCardUniqueId"]) {
    const forgedMapped = identity.mapped.map((entry, index) => Object.freeze(index === 0 ? { ...entry, [key]: identity.mapped[1][key] } : entry));
    safe(() => reconcile(Object.freeze({ mapped: Object.freeze(forgedMapped), unmapped: identity.unmapped }), records));
  }
  const printForms = Object.freeze(forms.map((form) => form.officialPrintId === "TST100" ? Object.freeze({ ...form, officialPrintId: "OTHER100" }) : form));
  safe(() => reconcile(identity, official(rarityById, printForms)));
  const baseForms = Object.freeze(forms.map((form) => form.officialPrintId === "TST100" ? Object.freeze({ ...form, baseCollectorId: "ALT100" }) : form));
  const baseRarities = new Map(rarityById); baseRarities.set("ALT100", baseRarities.get("TST100")); baseRarities.delete("TST100");
  safe(() => reconcile(identity, official(baseRarities, baseForms)));
  const ownerSource = source(); ownerSource.find((record) => record.name === "Exact Common").unique_id = "changed-card-owner";
  safe(() => reconcile(identity, official(rarityById, forms, ownerSource)));
});

test("zero rows, unsupported values, wrong pairs, normalization drift, mixed non-anomalies, and anomaly code drift fail", () => {
  const cases = [
    new Map(rarityById).set("TST100", []), new Map(rarityById).set("TST100", ["X"]), new Map(rarityById).set("TST100", ["c"]),
    new Map(rarityById).set("TST100", [" C"]), new Map(rarityById).set("TST100", ["R"]), new Map(rarityById).set("TST100", ["C", "V"]),
    new Map(rarityById).set("TST101", ["C"]), new Map(rarityById).set("TST101", ["C", "V", "M"])
  ];
  for (const rarities of cases) { let records; try { records = official(rarities); } catch { continue; } safe(() => reconcile(identities(records), records)); }
});

test("pinned anomaly code sets are order-independent while both retained sequences preserve source order", () => {
  const reversed = new Map(rarityById).set("TST101", ["V", "C", "V"]); const records = official(reversed);
  const entry = reconcile(identities(records), records)[1];
  assert.deepEqual(entry.exactUpstreamRarityStrings, ["V", "C", "V"]);
  assert.deepEqual(entry.firstObservedUniqueUpstreamRarityStrings, ["V", "C"]);
});

test("changed anomaly ownership, a third mixed identity, and every aggregate redistribution fail", () => {
  safe(() => reconcile(identities(), official(), { ...expected, anomalyOfficialPrintIds: Object.freeze(["TST100", "TST103"]) }));
  const third = new Map(rarityById).set("TST100", ["C", "V"]); const records = official(third); safe(() => reconcile(identities(records), records, { ...expected, exactCommonC: 0, anomalousCommonCV: 3, anomalyOfficialPrintIds: Object.freeze(["TST100", "TST101", "TST103"]) }));
  for (const key of ["entries", "exactCommonC", "anomalousCommonCV", "exactRareR", "exactMajesticM"]) safe(() => reconcile(identities(), official(), { ...expected, [key]: expected[key] + 1 }));
  safe(() => reconcile(identities(), official(), { ...expected, exactCommonC: 0, exactRareR: 2 }));
});

test("unmapped identities are outside correspondence even with unsupported mixed source rows", () => assert.equal(reconcile().length, 5));

const moduleEnvironmentKey = "DRAFT_TABLE_TEST_RECIPE_RARITY_CORRESPONDENCE_MODULE";
const sourcePath = new URL("../src/recipe-rarity-correspondence.ts", import.meta.url);
const withCanonicalSnapshot = (action) => { let directory; try { directory = mkdtempSync(join(tmpdir(), "draft-table-recipe-rarity-mutation-")); const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url)); for (const file of readdirSync(sourceDirectory).filter((file) => file.endsWith(".ts"))) copyFileSync(join(sourceDirectory, file), join(directory, file)); symlinkSync(join(sourceDirectory, "../../../node_modules"), join(directory, "node_modules"), "dir"); return action(directory); } finally { if (directory) rmSync(directory, { recursive: true, force: true }); } };
const mutationRun = (mutated, contractName, marker, failure) => withCanonicalSnapshot((directory) => { const path = join(directory, "recipe-rarity-correspondence.ts"); writeFileSync(path, mutated); const env = { ...process.env, [moduleEnvironmentKey]: pathToFileURL(path).href }; delete env.NODE_TEST_CONTEXT; const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--test-name-pattern", `^${contractName}$`, fileURLToPath(import.meta.url)], { encoding: "utf8", env }); const lines = result.stdout.split(/\r?\n/); assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`); assert.equal(lines.filter((line) => line === `# ${marker}`).length, 1); assert.equal(lines.filter((line) => /^not ok \d+ - /.test(line) && line.endsWith(contractName)).length, 1); assert.equal(lines.filter((line) => line.includes(failure)).length, 1); });
const loadMutationModule = async () => { const moduleUrl = process.env[moduleEnvironmentKey] ?? sourcePath.href; const loaded = await import(moduleUrl); const directory = new URL("./", moduleUrl); return { loaded, custom: await import(new URL("custom-cards.ts", directory)), upstream: await import(new URL("official-upstream-id-reconciliation.ts", directory)), identity: await import(new URL("recipe-official-identity-reconciliation.ts", directory)) }; };
const mutationCapabilities = (modules, rarities = rarityById) => { const references = modules.custom.completeOmensRecipeCustomCardsAggregateForTest(modules.custom.parseOmensCustomCardsFromTrustedBytes(recipeBytes(cards)), { common: 3, rare: 1, mythic: 1 }); const records = modules.upstream.reconcileOfficialUpstreamIdRecordsForTest(forms, source(rarities), { ...officialExpected, omnPrintings: forms.filter((form) => form.sourceSet === "OMN").reduce((sum, form) => sum + (rarities.get(form.baseCollectorId)?.length ?? 0), 0) }); return { records, identities: modules.identity.reconcileOmensRecipeOfficialIdentityRecordsForTest(references, records, identityExpected) }; };

const mappingContract = "label to code mapping requires exact rare R correspondence", mappingMarker = "RECIPE_RARITY_LABEL_CODE_CONTRACT_EXECUTED";
test(mappingContract, async () => { console.log(mappingMarker); const m = await loadMutationModule(), c = mutationCapabilities(m); assert.doesNotThrow(() => m.loaded.reconcileOmensRecipeRarityCorrespondenceForTest(c.identities, c.records, expected), "RARE_LABEL_MUST_MAP_TO_EXACT_R_CODE"); });
test("label to code mapping mutation fails its exact named contract", () => { const original = requireSource(); const mutated = original.replace('key === translation.correspondingUpstreamCode && fabRarity === "rare"', 'key === "C" && fabRarity === "rare"'); assert.notEqual(mutated, original); mutationRun(mutated, mappingContract, mappingMarker, "RARE_LABEL_MUST_MAP_TO_EXACT_R_CODE"); });

const consistencyContract = "row consistency rejects an unpinned common C V identity", consistencyMarker = "RECIPE_RARITY_ROW_CONSISTENCY_CONTRACT_EXECUTED";
test(consistencyContract, async () => { console.log(consistencyMarker); const m = await loadMutationModule(), changed = new Map(rarityById); changed.set("TST100", ["C", "V"]); changed.set("TST101", ["C"]); const c = mutationCapabilities(m, changed); assert.throws(() => m.loaded.reconcileOmensRecipeRarityCorrespondenceForTest(c.identities, c.records, expected), m.loaded.OmensRecipeRarityCorrespondenceError, "UNPINNED_MIXED_ROWS_MUST_FAIL"); });
test("row consistency mutation fails its exact named contract", () => { const original = requireSource(); const mutated = original.replace('const isPinnedAnomaly = (officialPrintId: string): boolean => anomalyIds.has(officialPrintId);', 'const isPinnedAnomaly = (_officialPrintId: string): boolean => true;'); assert.notEqual(mutated, original); mutationRun(mutated, consistencyContract, consistencyMarker, "UNPINNED_MIXED_ROWS_MUST_FAIL"); });

const multiplicityContract = "retained rarity codes preserve every upstream printing row", multiplicityMarker = "RECIPE_RARITY_ROW_MULTIPLICITY_CONTRACT_EXECUTED";
test(multiplicityContract, async () => { console.log(multiplicityMarker); const m = await loadMutationModule(), c = mutationCapabilities(m); const result = m.loaded.reconcileOmensRecipeRarityCorrespondenceForTest(c.identities, c.records, expected); assert.deepEqual(result[0].exactUpstreamRarityStrings, ["C", "C"], "EVERY_UPSTREAM_ROW_CODE_MUST_BE_RETAINED"); });
test("row multiplicity mutation fails its exact named contract", () => { const original = requireSource(); const mutated = original.replace("const rarityStrings = record.printings.map((row) => row.rarity);", "const rarityStrings = [...new Set(record.printings.map((row) => row.rarity))];"); assert.notEqual(mutated, original); mutationRun(mutated, multiplicityContract, multiplicityMarker, "EVERY_UPSTREAM_ROW_CODE_MUST_BE_RETAINED"); });

const scopeContract = "mapped candidate scoping ignores all unmapped rarity rows", scopeMarker = "RECIPE_RARITY_MAPPED_SCOPE_CONTRACT_EXECUTED";
test(scopeContract, async () => { console.log(scopeMarker); const m = await loadMutationModule(), c = mutationCapabilities(m); assert.doesNotThrow(() => m.loaded.reconcileOmensRecipeRarityCorrespondenceForTest(c.identities, c.records, expected), "UNMAPPED_ROWS_MUST_REMAIN_OUTSIDE_RARITY_CORRESPONDENCE"); });
test("mapped scoping mutation fails its exact named contract", () => { const original = requireSource(); const mutated = original.replace("const candidates = identities.mapped;", "const candidates = [...identities.mapped, ...identities.unmapped] as typeof identities.mapped;"); assert.notEqual(mutated, original); mutationRun(mutated, scopeContract, scopeMarker, "UNMAPPED_ROWS_MUST_REMAIN_OUTSIDE_RARITY_CORRESPONDENCE"); });

function requireSource() { return Buffer.from((awaitImportRead())()).toString(); }
function awaitImportRead() { return () => { const fs = process.getBuiltinModule("node:fs"); return fs.readFileSync(sourcePath); }; }

test("mutation snapshots are file-local OS-temp canonical copies and always clean", () => { let snapshot; withCanonicalSnapshot((directory) => { snapshot = directory; assert.ok(directory.startsWith(tmpdir())); assert.equal(directory.startsWith(`${resolve(fileURLToPath(new URL("../../..", import.meta.url)))}${sep}`), false); }); assert.equal(existsSync(snapshot), false); let failed; assert.throws(() => withCanonicalSnapshot((directory) => { failed = directory; throw new Error("body"); })); assert.equal(existsSync(failed), false); });
