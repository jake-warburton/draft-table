import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { exactTestNamePattern } from "./recipe-layout-pool-resolution-test-name.mjs";
import { completeOmensRecipeCustomCardsAggregateForTest, parseOmensCustomCardsFromTrustedBytes } from "../src/custom-cards.ts";
import { classifyOmensDraftEligibilityForTest } from "../src/draft-eligibility-classification.ts";
import { parseOmensLayoutsFromTrustedBytes } from "../src/layouts.ts";
import { reconcileOfficialUpstreamIdRecordsForTest } from "../src/official-upstream-id-reconciliation.ts";
import { completeOmensRecipePoolsForTest, parseOmensPoolsFromTrustedBytes } from "../src/pools.ts";
import { reconcileOmensRecipeOfficialIdentityRecordsForTest } from "../src/recipe-official-identity-reconciliation.ts";
import { resolveOmensRecipeLayoutsToOfficialIdentityPoolsForTest } from "../src/recipe-layout-pool-resolution.ts";
import { resolveOmensRecipePoolsToDraftableOfficialIdentitiesForTest } from "../src/recipe-pool-identity-resolution.ts";
import { OmensCollationWeightTablesError, compileOmensCollationWeightTablesForTest, validateOmensCollationWeightPrefixForTest } from "../src/collation-weight-tables.ts";
import { OmensCollationWeightTicketSelectionError, selectOmensCollationLayoutByTicket, selectOmensCollationPoolOfficialIdentityByTicket } from "../src/collation-weight-ticket-selection.ts";

const settings = JSON.stringify({ showSlots: true, withReplacement: false, cardBack: "https://cards.invalid/back.png" });
const cards = Object.freeze([
  ["Fictional Wizard", "OMN100", "common"], ["Fictional Illusionist", "OMN101", "common"], ["Fictional Runeblade", "OMN102", "common"],
  ["Fictional Lightning", "OMN103", "common"], ["Fictional Generic", "OMN104", "common"], ["Fictional Equipment", "OMN105", "common"],
  ["Fictional Rare", "OMN106", "rare"], ["Fictional Majestic", "OMN107", "mythic"]
]);
const pools = Object.freeze([
  ["Wizard", 2, "Fictional Wizard"], ["Illusionist", 3, "Fictional Illusionist"], ["Runeblade", 4, "Fictional Runeblade"], ["Lightning", 5, "Fictional Lightning"],
  ["Generic", 6, "Fictional Generic"], ["Equipment", 7, "Fictional Equipment"], ["Rare", 8, "Fictional Rare"], ["Majestic", 9, "Fictional Majestic"],
  ["Rfcommon", 10, "Fictional Wizard"], ["RFRare", 11, "Fictional Rare"], ["RFMajestic", 12, "Fictional Majestic"]
]);
const card = ([name, collector_number, rarity]) => ({ name, collector_number, mana_cost: "2", rarity, type: "action", image_uris: { en: "https://cards.invalid/a.png" } });
const layout = (index) => `\t- Fictional Layout ${index + 1} (${index === 227 ? 6800 : 2000})\r\n\t\t3 Wizard\r\n\t\t2 Illusionist\r\n\t\t2 Runeblade\r\n\t\t1 Lightning\r\n\t\t1 Generic\r\n\t\t2 Equipment\r\n\t\t1 Rare\r\n\t\t1 ${index < 114 ? "Rare" : "Majestic"}\r\n\t\t1 ${["Rfcommon", "RFRare", "RFMajestic"][index % 3]}`;
const recipeBytes = () => Buffer.from(`\ufeff[Settings]\r\n${settings}\r\n[CustomCards]\r\n${JSON.stringify(cards.map(card))}\r\n[Layouts]\r\n${Array.from({ length: 228 }, (_, index) => layout(index)).join("\r\n")}\r\n${pools.map(([label, weight, reference]) => `[${label}]\r\n${weight} ${reference}`).join("\r\n")}`, "utf8");
const forms = Object.freeze([...cards.map(([, id]) => Object.freeze({ officialPrintId: id, baseCollectorId: id, sourceSet: "OMN", suffixMarker: null })), Object.freeze({ officialPrintId: "IAR200-MV", baseCollectorId: "IAR200", sourceSet: "IAR", suffixMarker: "MV" })]);

const capabilities = (modules = {
  custom: { completeOmensRecipeCustomCardsAggregateForTest, parseOmensCustomCardsFromTrustedBytes }, eligibility: { classifyOmensDraftEligibilityForTest },
  layouts: { parseOmensLayoutsFromTrustedBytes }, upstream: { reconcileOfficialUpstreamIdRecordsForTest }, pools: { completeOmensRecipePoolsForTest, parseOmensPoolsFromTrustedBytes },
  identity: { reconcileOmensRecipeOfficialIdentityRecordsForTest }, poolResolution: { resolveOmensRecipePoolsToDraftableOfficialIdentitiesForTest }, layoutResolution: { resolveOmensRecipeLayoutsToOfficialIdentityPoolsForTest }
}) => {
  const bytes = recipeBytes();
  const references = modules.custom.completeOmensRecipeCustomCardsAggregateForTest(modules.custom.parseOmensCustomCardsFromTrustedBytes(bytes), { common: 6, rare: 1, mythic: 1 });
  const layouts = modules.layouts.parseOmensLayoutsFromTrustedBytes(bytes);
  const completedPools = modules.pools.completeOmensRecipePoolsForTest(modules.pools.parseOmensPoolsFromTrustedBytes(bytes), layouts, references);
  const names = new Map([...cards.map(([name, id]) => [id, name]), ["IAR200", "Excluded"]]);
  const source = forms.map((form, index) => ({ unique_id: `fictional-card-${index}`, name: names.get(form.baseCollectorId), pitch: "", printings: [{ unique_id: `fictional-printing-${index}`, set_printing_unique_id: `fictional-set-${form.sourceSet}`, id: form.baseCollectorId, set_id: form.sourceSet, edition: "standard", foiling: "standard", rarity: "C", expansion_slot: false, image_url: "https://cards.invalid/a.png", art_variations: [] }] }));
  const official = modules.upstream.reconcileOfficialUpstreamIdRecordsForTest(forms, source, { entries: 9, omnEntries: 8, iarEntries: 1, omnPrintings: 8, iarPrintings: 1 });
  const identities = modules.identity.reconcileOmensRecipeOfficialIdentityRecordsForTest(references, official, { recipeEntries: 8, officialEntries: 9, candidateEntries: 8, mappedEntries: 8, unmappedEntries: 1, unmappedOmn: 0, unmappedIar: 1, unmappedUnsuffixed: 0, unmappedRf: 0, unmappedCf: 0, unmappedMv: 1 });
  const eligibility = modules.eligibility.classifyOmensDraftEligibilityForTest(identities, official, { officialEntries: 9, mappedEntries: 8, mappedIarEntries: 0, excludedEntries: 1, excludedIarEntries: 1, excludedNonIarEntries: 0, unclassifiedEntries: 0, unclassifiedOmnEntries: 0, unclassifiedIarEntries: 0, unclassifiedUnsuffixed: 0, unclassifiedRf: 0, unclassifiedCf: 0, unclassifiedMv: 0 });
  const resolvedPools = modules.poolResolution.resolveOmensRecipePoolsToDraftableOfficialIdentitiesForTest(completedPools, identities, eligibility);
  return { resolvedPools, resolvedLayouts: modules.layoutResolution.resolveOmensRecipeLayoutsToOfficialIdentityPoolsForTest(layouts, resolvedPools) };
};
const compile = (parts = capabilities(), compiler = { compileOmensCollationWeightTablesForTest }) => compiler.compileOmensCollationWeightTablesForTest(parts.resolvedLayouts, parts.resolvedPools);
const safe = (action) => assert.throws(action, (error) => {
  assert.ok(error instanceof OmensCollationWeightTablesError);
  assert.equal(error.code, "OMENS_COLLATION_WEIGHT_TABLES_FAILED");
  assert.equal(error.message, "Omens collation weight tables failed.");
  assert.equal(error.stack, "OmensCollationWeightTablesError: Omens collation weight tables failed.");
  assert.deepEqual(JSON.parse(JSON.stringify(error)), { name: "OmensCollationWeightTablesError", code: "OMENS_COLLATION_WEIGHT_TABLES_FAILED" });
  assert.doesNotMatch(`${error.message}${error.stack}${JSON.stringify(error)}`, /Fictional|OMN|IAR|Wizard|[0-9]|https?:|\\|\//i);
  return true;
});

test("collation weight tables retain exact integer prefix sums and source order without selection", () => {
  const parts = capabilities(), result = compile(parts);
  assert.equal(result.layoutTotalWeight, 460800);
  assert.equal(result.layoutChoices.length, 228);
  assert.deepEqual(result.layoutChoices.slice(0, 3).map((choice) => choice.cumulativeExclusiveEnd), [2000, 4000, 6000]);
  assert.equal(result.layoutChoices.at(-1).cumulativeExclusiveEnd, 460800);
  assert.equal(result.layoutChoices[0].layoutReference, parts.resolvedLayouts.layouts[0]);
  assert.equal(result.layoutChoices.at(-1).layoutReference, parts.resolvedLayouts.layouts.at(-1));
  assert.equal(result.poolTables.length, 11);
  assert.deepEqual(result.poolTables.map((table) => table.poolTotalWeight), pools.map(([, weight]) => weight));
  assert.deepEqual(result.poolTables.map((table) => table.officialIdentityChoices[0].cumulativeExclusiveEnd), pools.map(([, weight]) => weight));
  assert.equal(result.poolTables[0].poolReference, parts.resolvedPools[0]);
  assert.equal(result.poolTables[0].officialIdentityChoices[0].officialIdentityReference, parts.resolvedPools[0].entries[0].officialIdentity);
  assert.deepEqual(Object.keys(result.layoutChoices[0]).sort(), ["cumulativeExclusiveEnd", "layoutReference", "weight"]);
  assert.deepEqual(Object.keys(result.poolTables[0].officialIdentityChoices[0]).sort(), ["cumulativeExclusiveEnd", "officialIdentityReference", "weight"]);
});

test("collation weight tables are deeply immutable, fresh, copy-independent, and preserve repeated references", () => {
  const parts = capabilities(), first = compile(parts), second = compile(parts);
  assert.ok(Object.isFrozen(first)); assert.ok(Object.isFrozen(first.layoutChoices)); assert.ok(Object.isFrozen(first.poolTables));
  assert.notEqual(first, second); assert.notEqual(first.layoutChoices, second.layoutChoices); assert.notEqual(first.poolTables, second.poolTables);
  assert.ok(Object.isFrozen(first.layoutChoices[0])); assert.notEqual(first.layoutChoices[0], second.layoutChoices[0]);
  assert.equal(first.layoutChoices[0].layoutReference, second.layoutChoices[0].layoutReference);
  assert.ok(Object.isFrozen(first.poolTables[0])); assert.ok(Object.isFrozen(first.poolTables[0].officialIdentityChoices));
  assert.notEqual(first.poolTables[0], second.poolTables[0]); assert.notEqual(first.poolTables[0].officialIdentityChoices[0], second.poolTables[0].officialIdentityChoices[0]);
  assert.equal(first.poolTables[0].poolReference, second.poolTables[0].poolReference);
  assert.throws(() => first.layoutChoices.push({}), TypeError); assert.throws(() => { first.poolTables[0].poolTotalWeight = 1; }, TypeError);
});

test("collation weight tables reject empty foreign copied duplicate and caller-overridden capabilities", () => {
  const parts = capabilities(), foreign = capabilities();
  safe(() => compile({ resolvedLayouts: structuredClone(parts.resolvedLayouts), resolvedPools: parts.resolvedPools }));
  safe(() => compile({ resolvedLayouts: parts.resolvedLayouts, resolvedPools: structuredClone(parts.resolvedPools) }));
  safe(() => compile({ resolvedLayouts: foreign.resolvedLayouts, resolvedPools: parts.resolvedPools }));
  safe(() => compile({ resolvedLayouts: parts.resolvedLayouts, resolvedPools: foreign.resolvedPools }));
  safe(() => compileOmensCollationWeightTablesForTest());
  safe(() => compileOmensCollationWeightTablesForTest(parts.resolvedLayouts, parts.resolvedPools, { total: 1 }));
});

test("collation compiler owns safe-integer prefix arithmetic, positive weights, and exact scoped totals", () => {
  const parts = capabilities();
  assert.equal(compile(parts).layoutTotalWeight, 460800);
  assert.equal(validateOmensCollationWeightPrefixForTest(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
  for (const weights of [[0], [-1], [1.5], [Number.MAX_SAFE_INTEGER + 1], [Number.MAX_SAFE_INTEGER, 1]]) {
    safe(() => validateOmensCollationWeightPrefixForTest(...weights));
  }
});

const selectionSafe = (action) => assert.throws(action, (error) => {
  assert.ok(error instanceof OmensCollationWeightTicketSelectionError);
  assert.equal(error.code, "OMENS_COLLATION_WEIGHT_TICKET_SELECTION_FAILED");
  assert.equal(error.message, "Omens collation weight ticket selection failed.");
  assert.equal(error.stack, "OmensCollationWeightTicketSelectionError: Omens collation weight ticket selection failed.");
  assert.deepEqual(JSON.parse(JSON.stringify(error)), { name: "OmensCollationWeightTicketSelectionError", code: "OMENS_COLLATION_WEIGHT_TICKET_SELECTION_FAILED" });
  assert.doesNotMatch(`${error.message}${error.stack}${JSON.stringify(error)}`, /Fictional|OMN|IAR|Wizard|[0-9]|https?:|\\|\//i);
  return true;
});

test("registered collation ticket selection owns every exclusive interval boundary in source order", () => {
  const parts = capabilities(), tables = compile(parts);
  assert.equal(selectOmensCollationLayoutByTicket(tables, 0), parts.resolvedLayouts.layouts[0]);
  for (let index = 0; index < tables.layoutChoices.length; index++) {
    const choice = tables.layoutChoices[index], priorEnd = index === 0 ? 0 : tables.layoutChoices[index - 1].cumulativeExclusiveEnd;
    assert.equal(selectOmensCollationLayoutByTicket(tables, priorEnd), choice.layoutReference);
    assert.equal(selectOmensCollationLayoutByTicket(tables, choice.cumulativeExclusiveEnd - 1), choice.layoutReference);
  }
  assert.equal(selectOmensCollationLayoutByTicket(tables, tables.layoutTotalWeight - 1), tables.layoutChoices.at(-1).layoutReference);
  assert.notEqual(tables.layoutChoices[0].layoutReference, tables.layoutChoices[1].layoutReference);
  assert.equal(tables.layoutChoices[0].weight, tables.layoutChoices[1].weight);
  for (const table of tables.poolTables) {
    assert.equal(selectOmensCollationPoolOfficialIdentityByTicket(tables, table.poolReference, 0), table.officialIdentityChoices[0].officialIdentityReference);
    assert.equal(selectOmensCollationPoolOfficialIdentityByTicket(tables, table.poolReference, table.poolTotalWeight - 1), table.officialIdentityChoices.at(-1).officialIdentityReference);
  }
});

test("registered collation ticket selection exhaustively gives every fictional choice its exact integer weight", () => {
  const tables = compile(capabilities());
  const layoutCounts = new Map(tables.layoutChoices.map((choice) => [choice.layoutReference, 0]));
  for (let ticket = 0; ticket < tables.layoutTotalWeight; ticket++) {
    const choice = selectOmensCollationLayoutByTicket(tables, ticket);
    layoutCounts.set(choice, layoutCounts.get(choice) + 1);
  }
  for (const choice of tables.layoutChoices) assert.equal(layoutCounts.get(choice.layoutReference), choice.weight);
  for (const table of tables.poolTables) {
    const counts = new Map(table.officialIdentityChoices.map((choice) => [choice.officialIdentityReference, 0]));
    for (let ticket = 0; ticket < table.poolTotalWeight; ticket++) {
      const choice = selectOmensCollationPoolOfficialIdentityByTicket(tables, table.poolReference, ticket);
      counts.set(choice, counts.get(choice) + 1);
    }
    for (const choice of table.officialIdentityChoices) assert.equal(counts.get(choice.officialIdentityReference), choice.weight);
  }
});

test("registered collation ticket selection rejects invalid tickets, malformed copies, and foreign pool scopes", () => {
  const parts = capabilities(), tables = compile(parts), foreign = compile(capabilities()), pool = tables.poolTables[0];
  for (const ticket of [-1, tables.layoutTotalWeight, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, "0", null, undefined]) {
    selectionSafe(() => selectOmensCollationLayoutByTicket(tables, ticket));
    selectionSafe(() => selectOmensCollationPoolOfficialIdentityByTicket(tables, pool.poolReference, ticket));
  }
  selectionSafe(() => selectOmensCollationLayoutByTicket());
  selectionSafe(() => selectOmensCollationLayoutByTicket(tables, 0, "override"));
  selectionSafe(() => selectOmensCollationLayoutByTicket(structuredClone(tables), 0));
  selectionSafe(() => selectOmensCollationLayoutByTicket(Object.freeze({ ...tables }), 0));
  selectionSafe(() => selectOmensCollationLayoutByTicket(Object.freeze({ layoutTotalWeight: 1, layoutChoices: Object.freeze([]), poolTables: Object.freeze([]) }), 0));
  selectionSafe(() => selectOmensCollationPoolOfficialIdentityByTicket(Object.freeze({ layoutTotalWeight: 1, layoutChoices: Object.freeze([]), poolTables: Object.freeze([Object.freeze({ poolReference: pool.poolReference, poolTotalWeight: 1, officialIdentityChoices: Object.freeze([]) })]) }), pool.poolReference, 0));
  selectionSafe(() => selectOmensCollationPoolOfficialIdentityByTicket(tables, structuredClone(pool.poolReference), 0));
  selectionSafe(() => selectOmensCollationPoolOfficialIdentityByTicket(tables, foreign.poolTables[0].poolReference, 0));
  selectionSafe(() => selectOmensCollationPoolOfficialIdentityByTicket(structuredClone(tables), pool.poolReference, 0));
  selectionSafe(() => selectOmensCollationPoolOfficialIdentityByTicket(tables, pool.poolReference, 0, "override"));
});

test("registered collation ticket selection returns only deeply immutable capability-owned references", () => {
  const parts = capabilities(), tables = compile(parts), pool = tables.poolTables[0];
  const layout = selectOmensCollationLayoutByTicket(tables, 0);
  const identity = selectOmensCollationPoolOfficialIdentityByTicket(tables, pool.poolReference, 0);
  assert.equal(layout, parts.resolvedLayouts.layouts[0]); assert.ok(Object.isFrozen(layout));
  assert.equal(identity, parts.resolvedPools[0].entries[0].officialIdentity); assert.ok(Object.isFrozen(identity));
  assert.throws(() => { layout.weight = 1; }, TypeError);
  assert.throws(() => { identity.baseCollectorId = "forged"; }, TypeError);
});

const mutationModuleKey = "DRAFT_TABLE_TEST_COLLATION_WEIGHT_TABLES_MODULE";
const sourcePath = new URL("../src/collation-weight-tables.ts", import.meta.url);
const withCanonicalSnapshot = (action) => {
  let directory;
  try {
    directory = mkdtempSync(join(tmpdir(), "draft-table-collation-weight-tables-mutation-"));
    const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url));
    for (const file of readdirSync(sourceDirectory).filter((file) => file.endsWith(".ts"))) copyFileSync(join(sourceDirectory, file), join(directory, file));
    symlinkSync(join(sourceDirectory, "../../../node_modules"), join(directory, "node_modules"), "dir");
    return action(directory);
  } finally { if (directory !== undefined) rmSync(directory, { recursive: true, force: true }); }
};
const loadMutationModules = async () => {
  const moduleUrl = process.env[mutationModuleKey] ?? sourcePath.href, directory = new URL("./", moduleUrl);
  return {
    compiler: await import(moduleUrl), custom: await import(new URL("custom-cards.ts", directory)), eligibility: await import(new URL("draft-eligibility-classification.ts", directory)),
    layouts: await import(new URL("layouts.ts", directory)), upstream: await import(new URL("official-upstream-id-reconciliation.ts", directory)), pools: await import(new URL("pools.ts", directory)),
    identity: await import(new URL("recipe-official-identity-reconciliation.ts", directory)), poolResolution: await import(new URL("recipe-pool-identity-resolution.ts", directory)), layoutResolution: await import(new URL("recipe-layout-pool-resolution.ts", directory))
  };
};
const runMutation = (mutated, contractName, marker, failure) => withCanonicalSnapshot((directory) => {
  const path = join(directory, "collation-weight-tables.ts"); writeFileSync(path, mutated);
  const environment = { ...process.env, [mutationModuleKey]: pathToFileURL(path).href }; delete environment.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--test-name-pattern", exactTestNamePattern(contractName), fileURLToPath(import.meta.url)], { encoding: "utf8", env: environment });
  const lines = result.stdout.split(/\r?\n/);
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.equal(lines.filter((line) => line === `# ${marker}`).length, 1);
  assert.equal(lines.filter((line) => /^not ok \d+ - /.test(line) && line.replace(/^not ok \d+ - /, "") === contractName).length, 1);
  assert.equal(lines.filter((line) => line.includes(failure)).length, 1);
});

const selectionMutationModuleKey = "DRAFT_TABLE_TEST_COLLATION_WEIGHT_TICKET_SELECTION_MODULE";
const selectionSourcePath = new URL("../src/collation-weight-ticket-selection.ts", import.meta.url);
const loadSelectionMutationModules = async () => {
  const moduleUrl = process.env[selectionMutationModuleKey] ?? selectionSourcePath.href, directory = new URL("./", moduleUrl);
  return {
    selection: await import(moduleUrl), compiler: await import(new URL("collation-weight-tables.ts", directory)), custom: await import(new URL("custom-cards.ts", directory)),
    eligibility: await import(new URL("draft-eligibility-classification.ts", directory)), layouts: await import(new URL("layouts.ts", directory)),
    upstream: await import(new URL("official-upstream-id-reconciliation.ts", directory)), pools: await import(new URL("pools.ts", directory)),
    identity: await import(new URL("recipe-official-identity-reconciliation.ts", directory)), poolResolution: await import(new URL("recipe-pool-identity-resolution.ts", directory)),
    layoutResolution: await import(new URL("recipe-layout-pool-resolution.ts", directory))
  };
};
const runSelectionMutation = (mutated, contractName, marker, failure) => withCanonicalSnapshot((directory) => {
  const path = join(directory, "collation-weight-ticket-selection.ts"); writeFileSync(path, mutated);
  const environment = { ...process.env, [selectionMutationModuleKey]: pathToFileURL(path).href }; delete environment.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--test-name-pattern", exactTestNamePattern(contractName), fileURLToPath(import.meta.url)], { encoding: "utf8", env: environment });
  const lines = result.stdout.split(/\r?\n/);
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.equal(lines.filter((line) => line === `# ${marker}`).length, 1);
  assert.equal(lines.filter((line) => /^not ok \d+ - /.test(line) && line.replace(/^not ok \d+ - /, "") === contractName).length, 1);
  assert.equal(lines.filter((line) => line.includes(failure)).length, 1);
});

const exclusiveEndContract = "collation ticket selection assigns an exclusive end to the following layout choice", exclusiveEndMarker = "COLLATION_TICKET_EXCLUSIVE_END_CONTRACT_EXECUTED";
test(exclusiveEndContract, async () => {
  console.log(exclusiveEndMarker); const m = await loadSelectionMutationModules(), parts = capabilities(m), tables = compile(parts, m.compiler);
  assert.equal(m.selection.selectOmensCollationLayoutByTicket(tables, tables.layoutChoices[0].cumulativeExclusiveEnd), tables.layoutChoices[1].layoutReference, "EXCLUSIVE_END_MUST_ADVANCE_TO_FOLLOWING_CHOICE");
});
test("exclusive-end semantic mutation fails its exact named contract", () => {
  const original = readFileSync(selectionSourcePath, "utf8"), mutated = original.replace("> boundedTicket", ">= boundedTicket");
  assert.notEqual(mutated, original); runSelectionMutation(mutated, exclusiveEndContract, exclusiveEndMarker, "EXCLUSIVE_END_MUST_ADVANCE_TO_FOLLOWING_CHOICE");
});

const finalChoiceContract = "collation ticket selection retains the final layout choice without fallback", finalChoiceMarker = "COLLATION_TICKET_FINAL_CHOICE_CONTRACT_EXECUTED";
test(finalChoiceContract, async () => {
  console.log(finalChoiceMarker); const m = await loadSelectionMutationModules(), parts = capabilities(m), tables = compile(parts, m.compiler);
  assert.equal(m.selection.selectOmensCollationLayoutByTicket(tables, tables.layoutTotalWeight - 1), tables.layoutChoices.at(-1).layoutReference, "FINAL_CHOICE_MUST_NOT_BE_DROPPED_OR_FALL_BACK");
});
test("final-choice semantic mutation fails its exact named contract", () => {
  const original = readFileSync(selectionSourcePath, "utf8"), mutated = original
    .replace("let upper = choices.length;", "let upper = choices.length - 1;")
    .replace("return choices[lower];", "return choices[Math.min(lower, choices.length - 2)];");
  assert.notEqual(mutated, original); runSelectionMutation(mutated, finalChoiceContract, finalChoiceMarker, "FINAL_CHOICE_MUST_NOT_BE_DROPPED_OR_FALL_BACK");
});

const poolScopeContract = "collation ticket selection retains exact named pool ownership", poolScopeMarker = "COLLATION_TICKET_POOL_SCOPE_CONTRACT_EXECUTED";
test(poolScopeContract, async () => {
  console.log(poolScopeMarker); const m = await loadSelectionMutationModules(), parts = capabilities(m), tables = compile(parts, m.compiler), table = tables.poolTables[0];
  assert.equal(m.selection.selectOmensCollationPoolOfficialIdentityByTicket(tables, table.poolReference, 0), table.officialIdentityChoices[0].officialIdentityReference, "EXACT_NAMED_POOL_OWNERSHIP_MUST_BE_RETAINED");
});
const runPoolScopeMutation = (mutated, contractName, marker, failure) => withCanonicalSnapshot((directory) => {
  const path = join(directory, "collation-weight-tables.ts"); writeFileSync(path, mutated);
  const environment = { ...process.env, [selectionMutationModuleKey]: pathToFileURL(join(directory, "collation-weight-ticket-selection.ts")).href }; delete environment.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--test-name-pattern", exactTestNamePattern(contractName), fileURLToPath(import.meta.url)], { encoding: "utf8", env: environment });
  const lines = result.stdout.split(/\r?\n/);
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.equal(lines.filter((line) => line === `# ${marker}`).length, 1);
  assert.equal(lines.filter((line) => /^not ok \d+ - /.test(line) && line.replace(/^not ok \d+ - /, "") === contractName).length, 1);
  assert.equal(lines.filter((line) => line.includes(failure)).length, 1);
});
test("pool-scope semantic mutation fails its exact named contract", () => {
  const original = readFileSync(sourcePath, "utf8"), mutated = original.replace("candidate.poolReference === poolReference", "candidate.poolReference !== poolReference");
  assert.notEqual(mutated, original); runPoolScopeMutation(mutated, poolScopeContract, poolScopeMarker, "EXACT_NAMED_POOL_OWNERSHIP_MUST_BE_RETAINED");
});

const prefixContract = "collation choices obey exact positive safe-integer prefix recurrence", prefixMarker = "COLLATION_PREFIX_RECURRENCE_CONTRACT_EXECUTED";
test(prefixContract, async () => {
  console.log(prefixMarker); const m = await loadMutationModules(), parts = capabilities(m);
  const result = m.compiler.compileOmensCollationWeightTablesForTest(parts.resolvedLayouts, parts.resolvedPools);
  assert.equal(result.layoutChoices[1].cumulativeExclusiveEnd, result.layoutChoices[0].cumulativeExclusiveEnd + result.layoutChoices[1].weight, "EXACT_PREFIX_RECURRENCE_MUST_BE_RETAINED");
});
test("prefix recurrence semantic mutation fails its exact named contract", () => {
  const original = readFileSync(sourcePath, "utf8"); const mutated = original
    .replace("const next = prior + weight;", "const next = prior + weight - 1;")
    .replace("if (layoutChoices.length !== EXPECTED_LAYOUT_COUNT || layoutTotalWeight !== EXPECTED_LAYOUT_TOTAL_WEIGHT) fail();", "if (false) fail();")
    .replace("if (officialIdentityChoices.length === 0 || prior !== poolTotalWeight) fail();", "if (false) fail();");
  assert.notEqual(mutated, original); runMutation(mutated, prefixContract, prefixMarker, "EXACT_PREFIX_RECURRENCE_MUST_BE_RETAINED");
});

const orderContract = "collation tables retain source-order capability ownership without copied references", orderMarker = "COLLATION_SOURCE_ORDER_OWNERSHIP_CONTRACT_EXECUTED";
test(orderContract, async () => {
  console.log(orderMarker); const m = await loadMutationModules(), parts = capabilities(m);
  const result = m.compiler.compileOmensCollationWeightTablesForTest(parts.resolvedLayouts, parts.resolvedPools);
  assert.equal(result.layoutChoices[0].layoutReference, parts.resolvedLayouts.layouts[0], "EXACT_SOURCE_ORDER_OWNERSHIP_MUST_BE_RETAINED");
  assert.equal(result.poolTables[0].poolReference, parts.resolvedPools[0], "EXACT_SOURCE_ORDER_OWNERSHIP_MUST_BE_RETAINED");
});
test("source-order ownership semantic mutation fails its exact named contract", () => {
  const original = readFileSync(sourcePath, "utf8"); const mutated = original.replace("for (const layout of layouts.layouts)", "for (const layout of [...layouts.layouts].reverse())");
  assert.notEqual(mutated, original); runMutation(mutated, orderContract, orderMarker, "EXACT_SOURCE_ORDER_OWNERSHIP_MUST_BE_RETAINED");
});

const totalContract = "collation pool totals remain scoped to each exact capability-owned pool", totalMarker = "COLLATION_POOL_TOTAL_SCOPING_CONTRACT_EXECUTED";
test(totalContract, async () => {
  console.log(totalMarker); const m = await loadMutationModules(), parts = capabilities(m);
  const result = m.compiler.compileOmensCollationWeightTablesForTest(parts.resolvedLayouts, parts.resolvedPools);
  assert.equal(result.poolTables[0].poolTotalWeight, result.poolTables[0].officialIdentityChoices.at(-1).cumulativeExclusiveEnd, "EXACT_PER_POOL_FINAL_TOTAL_MUST_BE_RETAINED");
});
test("per-pool final-total scoping semantic mutation fails its exact named contract", () => {
  const original = readFileSync(sourcePath, "utf8"); const mutated = original
    .replace("if (officialIdentityChoices.length === 0 || prior !== poolTotalWeight) fail();", "if (false) fail();")
    .replace("poolTables.push(frozen({ poolReference: pool, poolTotalWeight, officialIdentityChoices: frozen(officialIdentityChoices) }));", "poolTables.push(frozen({ poolReference: pool, poolTotalWeight: poolTotalWeight + 1, officialIdentityChoices: frozen(officialIdentityChoices) }));");
  assert.notEqual(mutated, original); runMutation(mutated, totalContract, totalMarker, "EXACT_PER_POOL_FINAL_TOTAL_MUST_BE_RETAINED");
});

test("mutation snapshots are file-local OS-temp canonical copies and always clean", () => {
  let snapshot; withCanonicalSnapshot((directory) => { snapshot = directory; assert.ok(directory.startsWith(tmpdir())); assert.equal(directory.startsWith(`${resolvePath(fileURLToPath(new URL("../../..", import.meta.url)))}${sep}`), false); }); assert.equal(existsSync(snapshot), false);
  let failed; assert.throws(() => withCanonicalSnapshot((directory) => { failed = directory; throw new Error("body"); })); assert.equal(existsSync(failed), false);
});
