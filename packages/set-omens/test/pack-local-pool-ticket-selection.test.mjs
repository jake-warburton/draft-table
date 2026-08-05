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
import { compileOmensCollationWeightTablesForTest } from "../src/collation-weight-tables.ts";
import { initializeOmensPackLocalPoolDrawState, removeOmensPackLocalPoolOfficialIdentity } from "../src/pack-local-pool-draw-state.ts";
import { OmensPackLocalPoolTicketSelectionError, selectOmensPackLocalPoolOfficialIdentityByTicket } from "../src/pack-local-pool-ticket-selection.ts";

const settings = JSON.stringify({ showSlots: true, withReplacement: false, cardBack: "https://cards.invalid/back.png" });
const cards = Object.freeze([
  ["Fictional Wizard A", "OMN100", "common"], ["Fictional Wizard B", "OMN101", "common"], ["Fictional Wizard C", "OMN102", "common"],
  ["Fictional Illusionist", "OMN103", "common"], ["Fictional Runeblade", "OMN104", "common"], ["Fictional Lightning", "OMN105", "common"],
  ["Fictional Generic", "OMN106", "common"], ["Fictional Equipment", "OMN107", "common"], ["Fictional Rare", "OMN108", "rare"], ["Fictional Majestic", "OMN109", "mythic"]
]);
const pools = Object.freeze([
  ["Wizard", [[2, "Fictional Wizard A"], [3, "Fictional Wizard B"], [5, "Fictional Wizard C"]]], ["Illusionist", [[7, "Fictional Illusionist"]]],
  ["Runeblade", [[4, "Fictional Runeblade"]]], ["Lightning", [[6, "Fictional Lightning"]]], ["Generic", [[8, "Fictional Generic"]]],
  ["Equipment", [[9, "Fictional Equipment"]]], ["Rare", [[10, "Fictional Rare"]]], ["Majestic", [[11, "Fictional Majestic"]]],
  ["Rfcommon", [[12, "Fictional Wizard A"]]], ["RFRare", [[13, "Fictional Rare"]]], ["RFMajestic", [[14, "Fictional Majestic"]]]
]);
const card = ([name, collector_number, rarity]) => ({ name, collector_number, mana_cost: "2", rarity, type: "action", image_uris: { en: "https://cards.invalid/a.png" } });
const layout = (index) => `\t- Fictional Layout ${index + 1} (${index === 227 ? 6800 : 2000})\r\n\t\t3 Wizard\r\n\t\t2 Illusionist\r\n\t\t2 Runeblade\r\n\t\t1 Lightning\r\n\t\t1 Generic\r\n\t\t2 Equipment\r\n\t\t1 Rare\r\n\t\t1 ${index < 114 ? "Rare" : "Majestic"}\r\n\t\t1 ${["Rfcommon", "RFRare", "RFMajestic"][index % 3]}`;
const recipeBytes = () => Buffer.from(`\ufeff[Settings]\r\n${settings}\r\n[CustomCards]\r\n${JSON.stringify(cards.map(card))}\r\n[Layouts]\r\n${Array.from({ length: 228 }, (_, index) => layout(index)).join("\r\n")}\r\n${pools.map(([label, entries]) => `[${label}]\r\n${entries.map(([weight, reference]) => `${weight} ${reference}`).join("\r\n")}`).join("\r\n")}`, "utf8");
const forms = Object.freeze([...cards.map(([, id]) => Object.freeze({ officialPrintId: id, baseCollectorId: id, sourceSet: "OMN", suffixMarker: null })), Object.freeze({ officialPrintId: "IAR200-MV", baseCollectorId: "IAR200", sourceSet: "IAR", suffixMarker: "MV" })]);

const capabilities = (modules = {
  custom: { completeOmensRecipeCustomCardsAggregateForTest, parseOmensCustomCardsFromTrustedBytes }, eligibility: { classifyOmensDraftEligibilityForTest },
  layouts: { parseOmensLayoutsFromTrustedBytes }, upstream: { reconcileOfficialUpstreamIdRecordsForTest }, pools: { completeOmensRecipePoolsForTest, parseOmensPoolsFromTrustedBytes },
  identity: { reconcileOmensRecipeOfficialIdentityRecordsForTest }, poolResolution: { resolveOmensRecipePoolsToDraftableOfficialIdentitiesForTest },
  layoutResolution: { resolveOmensRecipeLayoutsToOfficialIdentityPoolsForTest }, compiler: { compileOmensCollationWeightTablesForTest }
}) => {
  const bytes = recipeBytes(), references = modules.custom.completeOmensRecipeCustomCardsAggregateForTest(modules.custom.parseOmensCustomCardsFromTrustedBytes(bytes), { common: 8, rare: 1, mythic: 1 });
  const layouts = modules.layouts.parseOmensLayoutsFromTrustedBytes(bytes), completedPools = modules.pools.completeOmensRecipePoolsForTest(modules.pools.parseOmensPoolsFromTrustedBytes(bytes), layouts, references);
  const names = new Map([...cards.map(([name, id]) => [id, name]), ["IAR200", "Excluded"]]);
  const source = forms.map((form, index) => ({ unique_id: `fictional-card-${index}`, name: names.get(form.baseCollectorId), pitch: "", printings: [{ unique_id: `fictional-printing-${index}`, set_printing_unique_id: `fictional-set-${form.sourceSet}`, id: form.baseCollectorId, set_id: form.sourceSet, edition: "standard", foiling: "standard", rarity: "C", expansion_slot: false, image_url: "https://cards.invalid/a.png", art_variations: [] }] }));
  const official = modules.upstream.reconcileOfficialUpstreamIdRecordsForTest(forms, source, { entries: 11, omnEntries: 10, iarEntries: 1, omnPrintings: 10, iarPrintings: 1 });
  const identities = modules.identity.reconcileOmensRecipeOfficialIdentityRecordsForTest(references, official, { recipeEntries: 10, officialEntries: 11, candidateEntries: 10, mappedEntries: 10, unmappedEntries: 1, unmappedOmn: 0, unmappedIar: 1, unmappedUnsuffixed: 0, unmappedRf: 0, unmappedCf: 0, unmappedMv: 1 });
  const eligibility = modules.eligibility.classifyOmensDraftEligibilityForTest(identities, official, { officialEntries: 11, mappedEntries: 10, mappedIarEntries: 0, excludedEntries: 1, excludedIarEntries: 1, excludedNonIarEntries: 0, unclassifiedEntries: 0, unclassifiedOmnEntries: 0, unclassifiedIarEntries: 0, unclassifiedUnsuffixed: 0, unclassifiedRf: 0, unclassifiedCf: 0, unclassifiedMv: 0 });
  const resolvedPools = modules.poolResolution.resolveOmensRecipePoolsToDraftableOfficialIdentitiesForTest(completedPools, identities, eligibility), resolvedLayouts = modules.layoutResolution.resolveOmensRecipeLayoutsToOfficialIdentityPoolsForTest(layouts, resolvedPools);
  return { tables: modules.compiler.compileOmensCollationWeightTablesForTest(resolvedLayouts, resolvedPools) };
};
const removeAt = (state, poolIndex, choiceIndex, remove = removeOmensPackLocalPoolOfficialIdentity) => remove(state, state.poolStates[poolIndex].poolReference, state.poolStates[poolIndex].officialIdentityChoices[choiceIndex].officialIdentityReference);
const safe = (action) => assert.throws(action, (error) => {
  assert.ok(error instanceof OmensPackLocalPoolTicketSelectionError); assert.equal(error.code, "OMENS_PACK_LOCAL_POOL_TICKET_SELECTION_FAILED");
  assert.equal(error.message, "Omens pack local pool ticket selection failed."); assert.equal(error.stack, "OmensPackLocalPoolTicketSelectionError: Omens pack local pool ticket selection failed.");
  assert.deepEqual(JSON.parse(JSON.stringify(error)), { name: "OmensPackLocalPoolTicketSelectionError", code: "OMENS_PACK_LOCAL_POOL_TICKET_SELECTION_FAILED" });
  assert.doesNotMatch(`${error.message}${error.stack}${JSON.stringify(error)}`, /Fictional|OMN|IAR|Wizard|[0-9]|https?:|\\|\//iu); return true;
});

const assertHistogram = (state, poolIndex, select = selectOmensPackLocalPoolOfficialIdentityByTicket) => {
  const pool = state.poolStates[poolIndex], counts = new Map(pool.officialIdentityChoices.map((choice) => [choice.officialIdentityReference, 0]));
  for (let ticket = 0; ticket < pool.poolTotalWeight; ticket++) {
    const identity = select(state, pool.poolReference, ticket); counts.set(identity, counts.get(identity) + 1);
  }
  for (const choice of pool.officialIdentityChoices) assert.equal(counts.get(choice.officialIdentityReference), choice.weight);
  return counts;
};

test("pack-local ticket selection has exact half-open source-order boundaries without changing fresh state", () => {
  const { tables } = capabilities(), state = initializeOmensPackLocalPoolDrawState(tables), before = structuredClone(state), pool = state.poolStates[0];
  assert.equal(selectOmensPackLocalPoolOfficialIdentityByTicket(state, pool.poolReference, 0), pool.officialIdentityChoices[0].officialIdentityReference);
  for (let index = 0; index < pool.officialIdentityChoices.length; index++) {
    const choice = pool.officialIdentityChoices[index], priorEnd = index === 0 ? 0 : pool.officialIdentityChoices[index - 1].cumulativeExclusiveEnd;
    assert.equal(selectOmensPackLocalPoolOfficialIdentityByTicket(state, pool.poolReference, priorEnd), choice.officialIdentityReference);
    assert.equal(selectOmensPackLocalPoolOfficialIdentityByTicket(state, pool.poolReference, choice.cumulativeExclusiveEnd - 1), choice.officialIdentityReference);
  }
  assert.equal(selectOmensPackLocalPoolOfficialIdentityByTicket(state, pool.poolReference, pool.poolTotalWeight - 1), pool.officialIdentityChoices.at(-1).officialIdentityReference);
  for (let poolIndex = 0; poolIndex < state.poolStates.length; poolIndex++) assertHistogram(state, poolIndex);
  assert.deepEqual(state, before);
});

test("pack-local ticket selection keeps retained weights and removes first middle and final identities from reachability", () => {
  const { tables } = capabilities();
  for (const index of [0, 1, 2]) {
    const state = initializeOmensPackLocalPoolDrawState(tables), removed = state.poolStates[0].officialIdentityChoices[index], next = removeAt(state, 0, index), pool = next.poolStates[0];
    const counts = assertHistogram(next, 0); assert.equal(counts.has(removed.officialIdentityReference), false);
    for (let ticket = 0; ticket < pool.poolTotalWeight; ticket++) assert.notEqual(selectOmensPackLocalPoolOfficialIdentityByTicket(next, pool.poolReference, ticket), removed.officialIdentityReference);
    assert.equal(next.poolStates[0].officialIdentityChoices.reduce((total, choice) => total + choice.weight, 0), pool.poolTotalWeight);
  }
});

test("pack-local ticket selection is deterministic read-only and rejects exhausted states invalid scope capabilities and overrides", () => {
  const first = capabilities(), second = capabilities(), state = initializeOmensPackLocalPoolDrawState(first.tables), foreign = initializeOmensPackLocalPoolDrawState(second.tables), pool = state.poolStates[0], snapshot = structuredClone(state);
  assert.equal(selectOmensPackLocalPoolOfficialIdentityByTicket(state, pool.poolReference, 2), selectOmensPackLocalPoolOfficialIdentityByTicket(state, pool.poolReference, 2)); assert.deepEqual(state, snapshot);
  const exhausted = removeAt(state, 1, 0), exhaustedPool = exhausted.poolStates[1]; safe(() => selectOmensPackLocalPoolOfficialIdentityByTicket(exhausted, exhaustedPool.poolReference, 0));
  for (const ticket of [-1, pool.poolTotalWeight, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, "0", null, undefined]) safe(() => selectOmensPackLocalPoolOfficialIdentityByTicket(state, pool.poolReference, ticket));
  safe(() => selectOmensPackLocalPoolOfficialIdentityByTicket()); safe(() => selectOmensPackLocalPoolOfficialIdentityByTicket(state, pool.poolReference, 0, "override"));
  safe(() => selectOmensPackLocalPoolOfficialIdentityByTicket(structuredClone(state), pool.poolReference, 0)); safe(() => selectOmensPackLocalPoolOfficialIdentityByTicket(Object.freeze({ ...state }), pool.poolReference, 0));
  safe(() => selectOmensPackLocalPoolOfficialIdentityByTicket(state, structuredClone(pool.poolReference), 0)); safe(() => selectOmensPackLocalPoolOfficialIdentityByTicket(state, foreign.poolStates[0].poolReference, 0));
  safe(() => selectOmensPackLocalPoolOfficialIdentityByTicket(state, state.poolStates[1].poolReference, 8));
  safe(() => selectOmensPackLocalPoolOfficialIdentityByTicket(Object.freeze({ poolStates: Object.freeze([]) }), pool.poolReference, 0));
  const gap = structuredClone(state); gap.poolStates[0].officialIdentityChoices[1].cumulativeExclusiveEnd++;
  const order = structuredClone(state); [order.poolStates[0].officialIdentityChoices[0], order.poolStates[0].officialIdentityChoices[1]] = [order.poolStates[0].officialIdentityChoices[1], order.poolStates[0].officialIdentityChoices[0]];
  const total = structuredClone(state); total.poolStates[0].poolTotalWeight++;
  safe(() => selectOmensPackLocalPoolOfficialIdentityByTicket(gap, pool.poolReference, 0));
  safe(() => selectOmensPackLocalPoolOfficialIdentityByTicket(order, pool.poolReference, 0));
  safe(() => selectOmensPackLocalPoolOfficialIdentityByTicket(total, pool.poolReference, 0));
});

test("pack-local ticket selector consumes dynamic state only and owns no samples retries removal or sequencing", () => {
  const source = readFileSync(new URL("../src/pack-local-pool-ticket-selection.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /collation-weight-tables|sample|uint32|retry|remove|random|layout|slot|pack construction|card instance|rear|treatment|printing|image|snapshot|room|simulation/iu);
});

const mutationModuleKey = "DRAFT_TABLE_TEST_PACK_LOCAL_POOL_TICKET_SELECTION_MODULE";
const sourcePath = new URL("../src/pack-local-pool-ticket-selection.ts", import.meta.url);
const withCanonicalSnapshot = (action) => {
  let directory;
  try {
    directory = mkdtempSync(join(tmpdir(), "draft-table-pack-local-pool-ticket-selection-mutation-"));
    const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url));
    for (const file of readdirSync(sourceDirectory).filter((file) => file.endsWith(".ts"))) copyFileSync(join(sourceDirectory, file), join(directory, file));
    symlinkSync(join(sourceDirectory, "../../../node_modules"), join(directory, "node_modules"), "dir"); return action(directory);
  } finally { if (directory !== undefined) rmSync(directory, { recursive: true, force: true }); }
};
const loadMutationModules = async () => {
  const moduleUrl = process.env[mutationModuleKey] ?? sourcePath.href, directory = new URL("./", moduleUrl);
  return {
    selection: await import(moduleUrl), state: await import(new URL("pack-local-pool-draw-state.ts", directory)), compiler: await import(new URL("collation-weight-tables.ts", directory)),
    custom: await import(new URL("custom-cards.ts", directory)), eligibility: await import(new URL("draft-eligibility-classification.ts", directory)), layouts: await import(new URL("layouts.ts", directory)),
    upstream: await import(new URL("official-upstream-id-reconciliation.ts", directory)), pools: await import(new URL("pools.ts", directory)), identity: await import(new URL("recipe-official-identity-reconciliation.ts", directory)),
    poolResolution: await import(new URL("recipe-pool-identity-resolution.ts", directory)), layoutResolution: await import(new URL("recipe-layout-pool-resolution.ts", directory))
  };
};
const runMutation = (mutated, contractName, marker, failure) => withCanonicalSnapshot((directory) => {
  const path = join(directory, "pack-local-pool-ticket-selection.ts"); writeFileSync(path, mutated);
  const environment = { ...process.env, [mutationModuleKey]: pathToFileURL(path).href }; delete environment.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--test-name-pattern", exactTestNamePattern(contractName), fileURLToPath(import.meta.url)], { encoding: "utf8", env: environment });
  const lines = result.stdout.split(/\r?\n/u); assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.equal(lines.filter((line) => line === `# ${marker}`).length, 1); assert.equal(lines.filter((line) => /^not ok \d+ - /u.test(line) && line.replace(/^not ok \d+ - /u, "") === contractName).length, 1); assert.equal(lines.filter((line) => line.includes(failure)).length, 1);
});

const currentStateContract = "pack-local ticket selection owns the exact selected dynamic state pool", currentStateMarker = "PACK_LOCAL_TICKET_CURRENT_STATE_CONTRACT_EXECUTED";
test(currentStateContract, async () => {
  console.log(currentStateMarker); const m = await loadMutationModules(), { tables } = capabilities(m), state = m.state.initializeOmensPackLocalPoolDrawState(tables), pool = state.poolStates[1];
  assert.equal(m.selection.selectOmensPackLocalPoolOfficialIdentityByTicket(state, pool.poolReference, 0), pool.officialIdentityChoices[0].officialIdentityReference, "EXACT_DYNAMIC_STATE_POOL_MUST_OWN_SELECTION");
});
test("current-state semantic mutation fails its exact named contract", () => {
  const original = readFileSync(sourcePath, "utf8");
  const mutated = original.replace("scope.choices, scope.scopedTotal, inputs[2]", "inputs[0].poolStates[0].officialIdentityChoices, inputs[0].poolStates[0].poolTotalWeight, inputs[2]");
  assert.notEqual(mutated, original); runMutation(mutated, currentStateContract, currentStateMarker, "EXACT_DYNAMIC_STATE_POOL_MUST_OWN_SELECTION");
});

const exclusiveEndContract = "pack-local ticket selection advances at each exclusive end", exclusiveEndMarker = "PACK_LOCAL_TICKET_EXCLUSIVE_END_CONTRACT_EXECUTED";
test(exclusiveEndContract, async () => {
  console.log(exclusiveEndMarker); const m = await loadMutationModules(), { tables } = capabilities(m), state = m.state.initializeOmensPackLocalPoolDrawState(tables), pool = state.poolStates[0], end = pool.officialIdentityChoices[0].cumulativeExclusiveEnd;
  assert.equal(m.selection.selectOmensPackLocalPoolOfficialIdentityByTicket(state, pool.poolReference, end), pool.officialIdentityChoices[1].officialIdentityReference, "EXCLUSIVE_END_MUST_ADVANCE_TO_FOLLOWING_REMAINING_CHOICE");
});
test("exclusive-end semantic mutation fails its exact named contract", () => {
  const original = readFileSync(sourcePath, "utf8");
  const mutated = original.replace("> ticket", ">= ticket"); assert.notEqual(mutated, original);
  runMutation(mutated, exclusiveEndContract, exclusiveEndMarker, "EXCLUSIVE_END_MUST_ADVANCE_TO_FOLLOWING_REMAINING_CHOICE");
});

const finalChoiceContract = "pack-local ticket selection retains the final remaining choice", finalChoiceMarker = "PACK_LOCAL_TICKET_FINAL_CHOICE_CONTRACT_EXECUTED";
test(finalChoiceContract, async () => {
  console.log(finalChoiceMarker); const m = await loadMutationModules(), { tables } = capabilities(m), state = m.state.initializeOmensPackLocalPoolDrawState(tables), next = m.state.removeOmensPackLocalPoolOfficialIdentity(state, state.poolStates[0].poolReference, state.poolStates[0].officialIdentityChoices[0].officialIdentityReference), pool = next.poolStates[0];
  assert.equal(m.selection.selectOmensPackLocalPoolOfficialIdentityByTicket(next, pool.poolReference, pool.poolTotalWeight - 1), pool.officialIdentityChoices.at(-1).officialIdentityReference, "FINAL_REMAINING_CHOICE_MUST_BE_REACHABLE");
});
test("final-choice semantic mutation fails its exact named contract", () => {
  const original = readFileSync(sourcePath, "utf8");
  const mutated = original.replace("let upper = choices.length;", "let upper = choices.length - 1;").replace("return choices[lower];", "return choices[Math.min(lower, choices.length - 2)];");
  assert.notEqual(mutated, original); runMutation(mutated, finalChoiceContract, finalChoiceMarker, "FINAL_REMAINING_CHOICE_MUST_BE_REACHABLE");
});

const exhaustedContract = "pack-local ticket selection rejects an exhausted dynamic pool", exhaustedMarker = "PACK_LOCAL_TICKET_EXHAUSTED_POOL_CONTRACT_EXECUTED";
test(exhaustedContract, async () => {
  console.log(exhaustedMarker); const m = await loadMutationModules(), { tables } = capabilities(m), state = m.state.initializeOmensPackLocalPoolDrawState(tables), next = m.state.removeOmensPackLocalPoolOfficialIdentity(state, state.poolStates[1].poolReference, state.poolStates[1].officialIdentityChoices[0].officialIdentityReference), pool = next.poolStates[1];
  assert.throws(() => m.selection.selectOmensPackLocalPoolOfficialIdentityByTicket(next, pool.poolReference, 0), { code: "OMENS_PACK_LOCAL_POOL_TICKET_SELECTION_FAILED" }, "EXHAUSTED_DYNAMIC_POOL_MUST_REJECT_TICKET");
});
test("exhausted-pool semantic mutation fails its exact named contract", () => {
  const original = readFileSync(sourcePath, "utf8");
  const mutated = original.replace("const choice = choiceForTicket(scope.choices, scope.scopedTotal, inputs[2]);", "if (scope.scopedTotal === 0) return undefined as OfficialIdentityReference;\n    const choice = choiceForTicket(scope.choices, scope.scopedTotal, inputs[2]);");
  assert.notEqual(mutated, original); runMutation(mutated, exhaustedContract, exhaustedMarker, "EXHAUSTED_DYNAMIC_POOL_MUST_REJECT_TICKET");
});

test("pack-local ticket mutation snapshots are file-local OS-temp canonical copies and always clean", () => {
  let snapshot; withCanonicalSnapshot((directory) => { snapshot = directory; assert.ok(directory.startsWith(tmpdir())); assert.equal(directory.startsWith(`${resolvePath(fileURLToPath(new URL("../../..", import.meta.url)))}${sep}`), false); }); assert.equal(existsSync(snapshot), false);
  let failed; assert.throws(() => withCanonicalSnapshot((directory) => { failed = directory; throw new Error("body"); })); assert.equal(existsSync(failed), false);
});
