import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END } from "@draft-table/engine";
import { exactTestNamePattern } from "./recipe-layout-pool-resolution-test-name.mjs";
import { completeOmensRecipeCustomCardsAggregateForTest, parseOmensCustomCardsFromTrustedBytes } from "../src/custom-cards.ts";
import { classifyOmensDraftEligibilityForTest } from "../src/draft-eligibility-classification.ts";
import { parseOmensLayoutsFromTrustedBytes } from "../src/layouts.ts";
import { reconcileOfficialUpstreamIdRecordsForTest } from "../src/official-upstream-id-reconciliation.ts";
import { completeOmensRecipePoolsForTest, parseOmensPoolsFromTrustedBytes } from "../src/pools.ts";
import { reconcileOmensRecipeOfficialIdentityRecordsForTest } from "../src/recipe-official-identity-reconciliation.ts";
import { resolveOmensRecipeLayoutsToOfficialIdentityPoolsForTest } from "../src/recipe-layout-pool-resolution.ts";
import { resolveOmensRecipePoolsToDraftableOfficialIdentitiesForTest } from "../src/recipe-pool-identity-resolution.ts";
import { compileOmensCollationWeightTablesForTest } from "../src/collation-weight-tables.ts";
import {
  OmensCollationSampleSelectionError,
  selectOmensCollationLayoutFromOneUnsigned32Sample,
  selectOmensCollationLayoutFromOneUnsigned32SampleForTest,
  selectOmensCollationPoolOfficialIdentityFromOneUnsigned32Sample,
  selectOmensCollationPoolOfficialIdentityFromOneUnsigned32SampleForTest
} from "../src/collation-sample-selection.ts";

const settings = JSON.stringify({ showSlots: true, withReplacement: false, cardBack: "https://cards.invalid/back.png" });
const cards = Object.freeze([
  ["Fictional Wizard A", "OMN100", "common"], ["Fictional Wizard B", "OMN101", "common"], ["Fictional Illusionist", "OMN102", "common"],
  ["Fictional Runeblade", "OMN103", "common"], ["Fictional Lightning", "OMN104", "common"], ["Fictional Generic", "OMN105", "common"],
  ["Fictional Equipment", "OMN106", "common"], ["Fictional Rare", "OMN107", "rare"], ["Fictional Majestic", "OMN108", "mythic"]
]);
const pools = Object.freeze([
  ["Wizard", [[2, "Fictional Wizard A"], [3, "Fictional Wizard B"]]], ["Illusionist", [[7, "Fictional Illusionist"]]],
  ["Runeblade", [[4, "Fictional Runeblade"]]], ["Lightning", [[5, "Fictional Lightning"]]], ["Generic", [[6, "Fictional Generic"]]],
  ["Equipment", [[8, "Fictional Equipment"]]], ["Rare", [[9, "Fictional Rare"]]], ["Majestic", [[10, "Fictional Majestic"]]],
  ["Rfcommon", [[11, "Fictional Wizard A"]]], ["RFRare", [[12, "Fictional Rare"]]], ["RFMajestic", [[13, "Fictional Majestic"]]]
]);
const card = ([name, collector_number, rarity]) => ({ name, collector_number, mana_cost: "2", rarity, type: "action", image_uris: { en: "https://cards.invalid/a.png" } });
const layout = (index) => `\t- Fictional Layout ${index + 1} (${index === 227 ? 6800 : 2000})\r\n\t\t3 Wizard\r\n\t\t2 Illusionist\r\n\t\t2 Runeblade\r\n\t\t1 Lightning\r\n\t\t1 Generic\r\n\t\t2 Equipment\r\n\t\t1 Rare\r\n\t\t1 ${index < 114 ? "Rare" : "Majestic"}\r\n\t\t1 ${["Rfcommon", "RFRare", "RFMajestic"][index % 3]}`;
const recipeBytes = () => Buffer.from(`\ufeff[Settings]\r\n${settings}\r\n[CustomCards]\r\n${JSON.stringify(cards.map(card))}\r\n[Layouts]\r\n${Array.from({ length: 228 }, (_, index) => layout(index)).join("\r\n")}\r\n${pools.map(([label, entries]) => `[${label}]\r\n${entries.map(([weight, reference]) => `${weight} ${reference}`).join("\r\n")}`).join("\r\n")}`, "utf8");
const forms = Object.freeze([...cards.map(([, id]) => Object.freeze({ officialPrintId: id, baseCollectorId: id, sourceSet: "OMN", suffixMarker: null })), Object.freeze({ officialPrintId: "IAR200-MV", baseCollectorId: "IAR200", sourceSet: "IAR", suffixMarker: "MV" })]);

const capabilities = (modules = {
  custom: { completeOmensRecipeCustomCardsAggregateForTest, parseOmensCustomCardsFromTrustedBytes }, eligibility: { classifyOmensDraftEligibilityForTest },
  layouts: { parseOmensLayoutsFromTrustedBytes }, upstream: { reconcileOfficialUpstreamIdRecordsForTest }, pools: { completeOmensRecipePoolsForTest, parseOmensPoolsFromTrustedBytes },
  identity: { reconcileOmensRecipeOfficialIdentityRecordsForTest }, poolResolution: { resolveOmensRecipePoolsToDraftableOfficialIdentitiesForTest }, layoutResolution: { resolveOmensRecipeLayoutsToOfficialIdentityPoolsForTest }
}) => {
  const bytes = recipeBytes();
  const references = modules.custom.completeOmensRecipeCustomCardsAggregateForTest(modules.custom.parseOmensCustomCardsFromTrustedBytes(bytes), { common: 7, rare: 1, mythic: 1 });
  const layouts = modules.layouts.parseOmensLayoutsFromTrustedBytes(bytes);
  const completedPools = modules.pools.completeOmensRecipePoolsForTest(modules.pools.parseOmensPoolsFromTrustedBytes(bytes), layouts, references);
  const names = new Map([...cards.map(([name, id]) => [id, name]), ["IAR200", "Excluded"]]);
  const source = forms.map((form, index) => ({ unique_id: `fictional-card-${index}`, name: names.get(form.baseCollectorId), pitch: "", printings: [{ unique_id: `fictional-printing-${index}`, set_printing_unique_id: `fictional-set-${form.sourceSet}`, id: form.baseCollectorId, set_id: form.sourceSet, edition: "standard", foiling: "standard", rarity: "C", expansion_slot: false, image_url: "https://cards.invalid/a.png", art_variations: [] }] }));
  const official = modules.upstream.reconcileOfficialUpstreamIdRecordsForTest(forms, source, { entries: 10, omnEntries: 9, iarEntries: 1, omnPrintings: 9, iarPrintings: 1 });
  const identities = modules.identity.reconcileOmensRecipeOfficialIdentityRecordsForTest(references, official, { recipeEntries: 9, officialEntries: 10, candidateEntries: 9, mappedEntries: 9, unmappedEntries: 1, unmappedOmn: 0, unmappedIar: 1, unmappedUnsuffixed: 0, unmappedRf: 0, unmappedCf: 0, unmappedMv: 1 });
  const eligibility = modules.eligibility.classifyOmensDraftEligibilityForTest(identities, official, { officialEntries: 10, mappedEntries: 9, mappedIarEntries: 0, excludedEntries: 1, excludedIarEntries: 1, excludedNonIarEntries: 0, unclassifiedEntries: 0, unclassifiedOmnEntries: 0, unclassifiedIarEntries: 0, unclassifiedUnsuffixed: 0, unclassifiedRf: 0, unclassifiedCf: 0, unclassifiedMv: 0 });
  const resolvedPools = modules.poolResolution.resolveOmensRecipePoolsToDraftableOfficialIdentitiesForTest(completedPools, identities, eligibility);
  const resolvedLayouts = modules.layoutResolution.resolveOmensRecipeLayoutsToOfficialIdentityPoolsForTest(layouts, resolvedPools);
  return { resolvedPools, resolvedLayouts, tables: modules.compiler?.compileOmensCollationWeightTablesForTest(resolvedLayouts, resolvedPools) ?? compileOmensCollationWeightTablesForTest(resolvedLayouts, resolvedPools) };
};

const safe = (action) => assert.throws(action, (error) => {
  assert.ok(error instanceof OmensCollationSampleSelectionError);
  assert.equal(error.code, "OMENS_COLLATION_SAMPLE_SELECTION_FAILED");
  assert.equal(error.message, "Omens one-sample collation selection failed.");
  assert.equal(error.stack, "OmensCollationSampleSelectionError: Omens one-sample collation selection failed.");
  assert.deepEqual(JSON.parse(JSON.stringify(error)), { name: "OmensCollationSampleSelectionError", code: "OMENS_COLLATION_SAMPLE_SELECTION_FAILED" });
  assert.doesNotMatch(`${error.message}${error.stack}${JSON.stringify(error)}`, /Fictional|OMN|IAR|Wizard|[0-9]|https?:|\\|\//i);
  return true;
});
const cutoff = (bound) => UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END % bound;

const assertRetry = (result) => {
  assert.deepEqual(result, { state: "retry" });
  assert.ok(Object.isFrozen(result));
  assert.throws(() => { result.state = "selected"; }, TypeError);
};

test("one uint32 sample selects exact first and last layout or propagates the retry tail", () => {
  const { tables, resolvedLayouts } = capabilities(), acceptedEnd = cutoff(tables.layoutTotalWeight);
  const first = selectOmensCollationLayoutFromOneUnsigned32Sample(tables, 0);
  const last = selectOmensCollationLayoutFromOneUnsigned32Sample(tables, acceptedEnd - 1);
  assert.deepEqual(Object.keys(first).sort(), ["layoutReference", "state"]);
  assert.equal(first.state, "selected"); assert.equal(first.layoutReference, resolvedLayouts.layouts[0]);
  assert.equal(last.state, "selected"); assert.equal(last.layoutReference, resolvedLayouts.layouts.at(-1));
  assert.ok(Object.isFrozen(first)); assert.ok(Object.isFrozen(last)); assert.ok(Object.isFrozen(first.layoutReference));
  assertRetry(selectOmensCollationLayoutFromOneUnsigned32Sample(tables, acceptedEnd));
  assertRetry(selectOmensCollationLayoutFromOneUnsigned32Sample(tables, UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - 1));
});

test("one uint32 sample uses each exact capability-owned pool bound and reference", () => {
  const { tables } = capabilities(), firstPool = tables.poolTables[0], secondPool = tables.poolTables[1];
  assert.equal(firstPool.poolTotalWeight, 5); assert.equal(secondPool.poolTotalWeight, 7);
  const first = selectOmensCollationPoolOfficialIdentityFromOneUnsigned32Sample(tables, firstPool.poolReference, 0);
  const last = selectOmensCollationPoolOfficialIdentityFromOneUnsigned32Sample(tables, firstPool.poolReference, cutoff(5) - 1);
  assert.deepEqual(Object.keys(first).sort(), ["officialIdentityReference", "state"]);
  assert.equal(first.state, "selected"); assert.equal(first.officialIdentityReference, firstPool.officialIdentityChoices[0].officialIdentityReference);
  assert.equal(last.state, "selected"); assert.equal(last.officialIdentityReference, firstPool.officialIdentityChoices.at(-1).officialIdentityReference);
  assertRetry(selectOmensCollationPoolOfficialIdentityFromOneUnsigned32Sample(tables, firstPool.poolReference, cutoff(5)));
  assert.equal(selectOmensCollationPoolOfficialIdentityFromOneUnsigned32Sample(tables, firstPool.poolReference, cutoff(7)).state, "selected");
  assertRetry(selectOmensCollationPoolOfficialIdentityFromOneUnsigned32Sample(tables, secondPool.poolReference, cutoff(7)));
  assertRetry(selectOmensCollationPoolOfficialIdentityFromOneUnsigned32Sample(tables, firstPool.poolReference, UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - 1));
  assertRetry(selectOmensCollationPoolOfficialIdentityFromOneUnsigned32Sample(tables, secondPool.poolReference, UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - 1));
});

test("composition is deterministic immutable and rejects invalid samples capabilities pool scopes copies and forgeries", () => {
  const { tables } = capabilities(), foreign = capabilities(), pool = tables.poolTables[0];
  const first = selectOmensCollationLayoutFromOneUnsigned32Sample(tables, 12), second = selectOmensCollationLayoutFromOneUnsigned32Sample(tables, 12);
  assert.notEqual(first, second); assert.deepEqual(first, second); assert.equal(first.layoutReference, second.layoutReference);
  const identity = selectOmensCollationPoolOfficialIdentityFromOneUnsigned32Sample(tables, pool.poolReference, 4);
  assert.ok(Object.isFrozen(identity)); assert.ok(Object.isFrozen(identity.officialIdentityReference));
  assert.throws(() => { identity.officialIdentityReference.baseCollectorId = "forged"; }, TypeError);
  for (const sample of [-1, 0.5, NaN, Infinity, UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END, "0", null, undefined]) {
    safe(() => selectOmensCollationLayoutFromOneUnsigned32Sample(tables, sample));
    safe(() => selectOmensCollationPoolOfficialIdentityFromOneUnsigned32Sample(tables, pool.poolReference, sample));
  }
  safe(() => selectOmensCollationLayoutFromOneUnsigned32Sample());
  safe(() => selectOmensCollationLayoutFromOneUnsigned32Sample(tables, 0, "override"));
  safe(() => selectOmensCollationLayoutFromOneUnsigned32Sample(structuredClone(tables), 0));
  safe(() => selectOmensCollationLayoutFromOneUnsigned32Sample(Object.freeze({ ...tables }), 0));
  safe(() => selectOmensCollationPoolOfficialIdentityFromOneUnsigned32Sample(tables, structuredClone(pool.poolReference), 0));
  safe(() => selectOmensCollationPoolOfficialIdentityFromOneUnsigned32Sample(tables, tables.layoutChoices[0].layoutReference, 0));
  safe(() => selectOmensCollationPoolOfficialIdentityFromOneUnsigned32Sample(tables, foreign.tables.poolTables[0].poolReference, 0));
  safe(() => selectOmensCollationPoolOfficialIdentityFromOneUnsigned32Sample(structuredClone(tables), pool.poolReference, 0));
  safe(() => selectOmensCollationPoolOfficialIdentityFromOneUnsigned32Sample(tables, pool.poolReference, 0, "override"));
});

test("analytical composition gives each weighted choice equal ticket preimages and the exact scoped retry tail", () => {
  const { tables } = capabilities();
  for (const { total, choices } of [
    { total: tables.layoutTotalWeight, choices: tables.layoutChoices },
    ...tables.poolTables.map((table) => ({ total: table.poolTotalWeight, choices: table.officialIdentityChoices }))
  ]) {
    const ticketPreimages = Math.floor(UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END / total);
    assert.equal(cutoff(total), ticketPreimages * total);
    assert.equal(UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - cutoff(total), UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END % total);
    assert.ok(choices.every((choice) => choice.weight * ticketPreimages === (choice.cumulativeExclusiveEnd - (choices[choices.indexOf(choice) - 1]?.cumulativeExclusiveEnd ?? 0)) * ticketPreimages));
    assert.equal(choices.reduce((sum, choice) => sum + choice.weight * ticketPreimages, 0), cutoff(total));
  }
});

test("composition source owns no entropy retry loop floating probability normalization or direct modulo", () => {
  const source = readFileSync(sourcePath, "utf8");
  assert.doesNotMatch(source, /Math\.random|crypto|randomBytes|randomUUID|while\s*\(|for\s*\(|setInterval|setTimeout|%|probab|normaliz|console\.|process\./u);
});

test("accepted composition passes the exact mapped ticket and retry never invokes either ticket selector", () => {
  const { tables } = capabilities(), pool = tables.poolTables[0]; let layoutCalls = 0, poolCalls = 0;
  const layoutSelected = selectOmensCollationLayoutFromOneUnsigned32SampleForTest(tables, 2_001, (actualTables, ticket) => {
    layoutCalls++; assert.equal(actualTables, tables); assert.equal(ticket, 2_001); return tables.layoutChoices[1].layoutReference;
  });
  assert.equal(layoutSelected.layoutReference, tables.layoutChoices[1].layoutReference); assert.equal(layoutCalls, 1);
  const poolSelected = selectOmensCollationPoolOfficialIdentityFromOneUnsigned32SampleForTest(tables, pool.poolReference, 4, (actualTables, actualPool, ticket) => {
    poolCalls++; assert.equal(actualTables, tables); assert.equal(actualPool, pool.poolReference); assert.equal(ticket, 4); return pool.officialIdentityChoices[1].officialIdentityReference;
  });
  assert.equal(poolSelected.officialIdentityReference, pool.officialIdentityChoices[1].officialIdentityReference); assert.equal(poolCalls, 1);
  const layoutRetry = selectOmensCollationLayoutFromOneUnsigned32SampleForTest(tables, cutoff(tables.layoutTotalWeight), () => { layoutCalls++; throw new Error("must not run"); });
  const poolRetry = selectOmensCollationPoolOfficialIdentityFromOneUnsigned32SampleForTest(tables, pool.poolReference, cutoff(pool.poolTotalWeight), () => { poolCalls++; throw new Error("must not run"); });
  assertRetry(layoutRetry); assertRetry(poolRetry); assert.equal(layoutCalls, 1); assert.equal(poolCalls, 1);
});

const mutationModuleKey = "DRAFT_TABLE_TEST_COLLATION_SAMPLE_SELECTION_MODULE";
const sourcePath = new URL("../src/collation-sample-selection.ts", import.meta.url);
const withCanonicalSnapshot = (action) => {
  let directory;
  try {
    directory = mkdtempSync(join(tmpdir(), "draft-table-collation-sample-selection-mutation-"));
    const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url));
    for (const file of readdirSync(sourceDirectory).filter((file) => file.endsWith(".ts"))) copyFileSync(join(sourceDirectory, file), join(directory, file));
    symlinkSync(join(sourceDirectory, "../../../node_modules"), join(directory, "node_modules"), "dir");
    return action(directory);
  } finally { if (directory !== undefined) rmSync(directory, { recursive: true, force: true }); }
};
const loadMutationModules = async () => {
  const moduleUrl = process.env[mutationModuleKey] ?? sourcePath.href, directory = new URL("./", moduleUrl);
  return {
    selection: await import(moduleUrl), compiler: await import(new URL("collation-weight-tables.ts", directory)),
    custom: await import(new URL("custom-cards.ts", directory)), eligibility: await import(new URL("draft-eligibility-classification.ts", directory)),
    layouts: await import(new URL("layouts.ts", directory)), upstream: await import(new URL("official-upstream-id-reconciliation.ts", directory)), pools: await import(new URL("pools.ts", directory)),
    identity: await import(new URL("recipe-official-identity-reconciliation.ts", directory)), poolResolution: await import(new URL("recipe-pool-identity-resolution.ts", directory)),
    layoutResolution: await import(new URL("recipe-layout-pool-resolution.ts", directory))
  };
};
const runMutation = (mutated, contractName, marker, failure) => withCanonicalSnapshot((directory) => {
  const path = join(directory, "collation-sample-selection.ts"); writeFileSync(path, mutated);
  const environment = { ...process.env, [mutationModuleKey]: pathToFileURL(path).href }; delete environment.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--test-name-pattern", exactTestNamePattern(contractName), fileURLToPath(import.meta.url)], { encoding: "utf8", env: environment });
  const lines = result.stdout.split(/\r?\n/u);
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.equal(lines.filter((line) => line === `# ${marker}`).length, 1);
  assert.equal(lines.filter((line) => /^not ok \d+ - /u.test(line) && line.replace(/^not ok \d+ - /u, "") === contractName).length, 1);
  assert.equal(lines.filter((line) => line.includes(failure)).length, 1);
});

const directModuloContract = "one-sample composition cannot bypass the unbiased retry cutoff with direct modulo", directModuloMarker = "COLLATION_SAMPLE_DIRECT_MODULO_CONTRACT_EXECUTED";
test(directModuloContract, async () => {
  console.log(directModuloMarker); const m = await loadMutationModules(), { tables } = capabilities({ ...m, compiler: m.compiler });
  assert.equal(m.selection.selectOmensCollationLayoutFromOneUnsigned32Sample(tables, cutoff(tables.layoutTotalWeight)).state, "retry", "DIRECT_MODULO_MUST_NOT_BYPASS_RETRY");
});
test("direct-modulo composition semantic mutation fails its exact named contract", () => {
  const original = readFileSync(sourcePath, "utf8");
  const mutated = original.replace("const mapping = mapUnsigned32SampleToBoundedTicket(sample, scopedTotal);", "const mapping = Object.freeze({ state: \"accepted\", ticket: sample % scopedTotal });");
  assert.notEqual(mutated, original); runMutation(mutated, directModuloContract, directModuloMarker, "DIRECT_MODULO_MUST_NOT_BYPASS_RETRY");
});

const retryFallbackContract = "one-sample composition propagates retry without selecting a fallback", retryFallbackMarker = "COLLATION_SAMPLE_RETRY_NO_FALLBACK_CONTRACT_EXECUTED";
test(retryFallbackContract, async () => {
  console.log(retryFallbackMarker); const m = await loadMutationModules(), { tables } = capabilities({ ...m, compiler: m.compiler });
  assert.equal(m.selection.selectOmensCollationLayoutFromOneUnsigned32Sample(tables, cutoff(tables.layoutTotalWeight)).state, "retry", "RETRY_MUST_NOT_FALL_BACK_TO_A_SELECTION");
});
test("retry-to-fallback semantic mutation fails its exact named contract", () => {
  const original = readFileSync(sourcePath, "utf8");
  const mutated = original.replace("if (mapping.state === \"retry\") return retry();", "if (mapping.state === \"retry\") return selectedLayout(selectLayout(tables, 0));");
  assert.notEqual(mutated, original); runMutation(mutated, retryFallbackContract, retryFallbackMarker, "RETRY_MUST_NOT_FALL_BACK_TO_A_SELECTION");
});

const poolBoundContract = "one-sample pool composition retains the exact selected pool bound", poolBoundMarker = "COLLATION_SAMPLE_POOL_BOUND_CONTRACT_EXECUTED";
test(poolBoundContract, async () => {
  console.log(poolBoundMarker); const m = await loadMutationModules(), { tables } = capabilities({ ...m, compiler: m.compiler }), first = tables.poolTables[0], second = tables.poolTables[1];
  assert.equal(m.selection.selectOmensCollationPoolOfficialIdentityFromOneUnsigned32Sample(tables, first.poolReference, cutoff(second.poolTotalWeight)).state, "selected", "EXACT_SELECTED_POOL_BOUND_MUST_OWN_RETRY");
  assert.equal(m.selection.selectOmensCollationPoolOfficialIdentityFromOneUnsigned32Sample(tables, second.poolReference, cutoff(second.poolTotalWeight)).state, "retry", "EXACT_SELECTED_POOL_BOUND_MUST_OWN_RETRY");
});
test("pool-bound ownership semantic mutation fails its exact named contract", () => {
  const original = readFileSync(sourcePath, "utf8");
  const mutated = original.replace("readOmensCollationPoolWeightTotalForSampleSelection(tables, poolReference)", "readOmensCollationLayoutWeightTotalForSampleSelection(tables)");
  assert.notEqual(mutated, original); runMutation(mutated, poolBoundContract, poolBoundMarker, "EXACT_SELECTED_POOL_BOUND_MUST_OWN_RETRY");
});

test("sample-selection mutation snapshots are file-local OS-temp canonical copies and always clean", () => {
  let snapshot; withCanonicalSnapshot((directory) => { snapshot = directory; assert.ok(directory.startsWith(tmpdir())); assert.equal(directory.startsWith(`${resolvePath(fileURLToPath(new URL("../../..", import.meta.url)))}${sep}`), false); }); assert.equal(existsSync(snapshot), false);
  let failed; assert.throws(() => withCanonicalSnapshot((directory) => { failed = directory; throw new Error("body"); })); assert.equal(existsSync(failed), false);
});
