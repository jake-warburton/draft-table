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
import { initializeOmensPackLocalPoolDrawState, removeOmensPackLocalPoolOfficialIdentity } from "../src/pack-local-pool-draw-state.ts";
import {
  OmensPackLocalPoolSampleSelectionError,
  selectOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample,
  selectOmensPackLocalPoolOfficialIdentityFromOneUnsigned32SampleForTest
} from "../src/pack-local-pool-sample-selection.ts";

const settings = JSON.stringify({ showSlots: true, withReplacement: false, cardBack: "https://cards.invalid/back.png" });
const cards = Object.freeze([["Fictional A", "OMN100", "common"], ["Fictional B", "OMN101", "common"], ["Fictional C", "OMN102", "common"], ["Fictional I", "OMN103", "common"], ["Fictional R", "OMN104", "common"], ["Fictional L", "OMN105", "common"], ["Fictional G", "OMN106", "common"], ["Fictional E", "OMN107", "common"], ["Fictional Rare", "OMN108", "rare"], ["Fictional Majestic", "OMN109", "mythic"]]);
const pools = Object.freeze([["Wizard", [[2, "Fictional A"], [3, "Fictional B"], [3, "Fictional C"]]], ["Illusionist", [[7, "Fictional I"]]], ["Runeblade", [[4, "Fictional R"]]], ["Lightning", [[6, "Fictional L"]]], ["Generic", [[8, "Fictional G"]]], ["Equipment", [[9, "Fictional E"]]], ["Rare", [[10, "Fictional Rare"]]], ["Majestic", [[11, "Fictional Majestic"]]], ["Rfcommon", [[12, "Fictional A"]]], ["RFRare", [[13, "Fictional Rare"]]], ["RFMajestic", [[14, "Fictional Majestic"]]]]);
const card = ([name, collector_number, rarity]) => ({ name, collector_number, mana_cost: "2", rarity, type: "action", image_uris: { en: "https://cards.invalid/a.png" } });
const layout = (index) => `\t- Fictional Layout ${index + 1} (${index === 227 ? 6800 : 2000})\r\n\t\t3 Wizard\r\n\t\t2 Illusionist\r\n\t\t2 Runeblade\r\n\t\t1 Lightning\r\n\t\t1 Generic\r\n\t\t2 Equipment\r\n\t\t1 Rare\r\n\t\t1 ${index < 114 ? "Rare" : "Majestic"}\r\n\t\t1 ${["Rfcommon", "RFRare", "RFMajestic"][index % 3]}`;
const recipeBytes = () => Buffer.from(`\ufeff[Settings]\r\n${settings}\r\n[CustomCards]\r\n${JSON.stringify(cards.map(card))}\r\n[Layouts]\r\n${Array.from({ length: 228 }, (_, index) => layout(index)).join("\r\n")}\r\n${pools.map(([label, entries]) => `[${label}]\r\n${entries.map(([weight, reference]) => `${weight} ${reference}`).join("\r\n")}`).join("\r\n")}`, "utf8");
const forms = Object.freeze([...cards.map(([, id]) => Object.freeze({ officialPrintId: id, baseCollectorId: id, sourceSet: "OMN", suffixMarker: null })), Object.freeze({ officialPrintId: "IAR200-MV", baseCollectorId: "IAR200", sourceSet: "IAR", suffixMarker: "MV" })]);

const capabilities = (modules = { custom: { completeOmensRecipeCustomCardsAggregateForTest, parseOmensCustomCardsFromTrustedBytes }, eligibility: { classifyOmensDraftEligibilityForTest }, layouts: { parseOmensLayoutsFromTrustedBytes }, upstream: { reconcileOfficialUpstreamIdRecordsForTest }, pools: { completeOmensRecipePoolsForTest, parseOmensPoolsFromTrustedBytes }, identity: { reconcileOmensRecipeOfficialIdentityRecordsForTest }, poolResolution: { resolveOmensRecipePoolsToDraftableOfficialIdentitiesForTest }, layoutResolution: { resolveOmensRecipeLayoutsToOfficialIdentityPoolsForTest }, compiler: { compileOmensCollationWeightTablesForTest } }) => {
  const bytes = recipeBytes(), references = modules.custom.completeOmensRecipeCustomCardsAggregateForTest(modules.custom.parseOmensCustomCardsFromTrustedBytes(bytes), { common: 8, rare: 1, mythic: 1 }), layouts = modules.layouts.parseOmensLayoutsFromTrustedBytes(bytes), completedPools = modules.pools.completeOmensRecipePoolsForTest(modules.pools.parseOmensPoolsFromTrustedBytes(bytes), layouts, references);
  const names = new Map([...cards.map(([name, id]) => [id, name]), ["IAR200", "Excluded"]]), source = forms.map((form, index) => ({ unique_id: `fictional-card-${index}`, name: names.get(form.baseCollectorId), pitch: "", printings: [{ unique_id: `fictional-printing-${index}`, set_printing_unique_id: `fictional-set-${form.sourceSet}`, id: form.baseCollectorId, set_id: form.sourceSet, edition: "standard", foiling: "standard", rarity: "C", expansion_slot: false, image_url: "https://cards.invalid/a.png", art_variations: [] }] }));
  const official = modules.upstream.reconcileOfficialUpstreamIdRecordsForTest(forms, source, { entries: 11, omnEntries: 10, iarEntries: 1, omnPrintings: 10, iarPrintings: 1 }), identities = modules.identity.reconcileOmensRecipeOfficialIdentityRecordsForTest(references, official, { recipeEntries: 10, officialEntries: 11, candidateEntries: 10, mappedEntries: 10, unmappedEntries: 1, unmappedOmn: 0, unmappedIar: 1, unmappedUnsuffixed: 0, unmappedRf: 0, unmappedCf: 0, unmappedMv: 1 }), eligibility = modules.eligibility.classifyOmensDraftEligibilityForTest(identities, official, { officialEntries: 11, mappedEntries: 10, mappedIarEntries: 0, excludedEntries: 1, excludedIarEntries: 1, excludedNonIarEntries: 0, unclassifiedEntries: 0, unclassifiedOmnEntries: 0, unclassifiedIarEntries: 0, unclassifiedUnsuffixed: 0, unclassifiedRf: 0, unclassifiedCf: 0, unclassifiedMv: 0 });
  const resolvedPools = modules.poolResolution.resolveOmensRecipePoolsToDraftableOfficialIdentitiesForTest(completedPools, identities, eligibility), resolvedLayouts = modules.layoutResolution.resolveOmensRecipeLayoutsToOfficialIdentityPoolsForTest(layouts, resolvedPools);
  return { tables: modules.compiler.compileOmensCollationWeightTablesForTest(resolvedLayouts, resolvedPools) };
};
const removeAt = (state, poolIndex, choiceIndex) => removeOmensPackLocalPoolOfficialIdentity(state, state.poolStates[poolIndex].poolReference, state.poolStates[poolIndex].officialIdentityChoices[choiceIndex].officialIdentityReference);
const cutoff = (bound) => UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END % bound;
const safe = (action) => assert.throws(action, (error) => { assert.ok(error instanceof OmensPackLocalPoolSampleSelectionError); assert.equal(error.code, "OMENS_PACK_LOCAL_POOL_SAMPLE_SELECTION_FAILED"); assert.equal(error.message, "Omens one-sample pack local pool selection failed."); assert.equal(error.stack, "OmensPackLocalPoolSampleSelectionError: Omens one-sample pack local pool selection failed."); assert.deepEqual(JSON.parse(JSON.stringify(error)), { name: "OmensPackLocalPoolSampleSelectionError", code: "OMENS_PACK_LOCAL_POOL_SAMPLE_SELECTION_FAILED" }); assert.doesNotMatch(`${error.message}${error.stack}${JSON.stringify(error)}`, /Fictional|OMN|IAR|[0-9]|https?:|\\|\//iu); return true; });
const assertRetry = (result) => { assert.deepEqual(result, { state: "retry" }); assert.ok(Object.isFrozen(result)); assert.throws(() => { result.state = "selected"; }, TypeError); };

const assertAnalyticalPreimages = (state, poolIndex) => {
  const pool = state.poolStates[poolIndex], multiplier = Math.floor(UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END / pool.poolTotalWeight), accepted = cutoff(pool.poolTotalWeight);
  assert.equal(accepted, pool.poolTotalWeight * multiplier); assert.equal(UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - accepted, UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END % pool.poolTotalWeight);
  for (const choice of pool.officialIdentityChoices) assert.equal(choice.weight * multiplier, choice.weight * Math.floor(UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END / pool.poolTotalWeight));
  assert.equal(pool.officialIdentityChoices.reduce((sum, choice) => sum + choice.weight * multiplier, 0), accepted);
};

test("one pack-local uint32 sample selects current first and last identities through fresh and first middle last removals", () => {
  const { tables } = capabilities();
  for (const removeIndex of [undefined, 0, 1, 2]) {
    const initial = initializeOmensPackLocalPoolDrawState(tables), state = removeIndex === undefined ? initial : removeAt(initial, 0, removeIndex), pool = state.poolStates[0], before = structuredClone(state), accepted = cutoff(pool.poolTotalWeight);
    const first = selectOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample(state, pool.poolReference, 0), last = selectOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample(state, pool.poolReference, accepted - 1);
    assert.equal(first.state, "selected"); assert.equal(first.officialIdentityReference, pool.officialIdentityChoices[0].officialIdentityReference); assert.equal(last.state, "selected"); assert.equal(last.officialIdentityReference, pool.officialIdentityChoices.at(-1).officialIdentityReference);
    assert.deepEqual(Object.keys(first).sort(), ["officialIdentityReference", "state"]); assert.ok(Object.isFrozen(first)); assert.ok(Object.isFrozen(first.officialIdentityReference)); if (accepted < UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END) { assertRetry(selectOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample(state, pool.poolReference, accepted)); assertRetry(selectOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample(state, pool.poolReference, UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - 1)); } else assert.equal(selectOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample(state, pool.poolReference, UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - 1).state, "selected"); assert.deepEqual(state, before); assertAnalyticalPreimages(state, 0);
  }
});

test("one pack-local sample propagates cutoff retry without ticket selection removal or fallback", () => {
  const { tables } = capabilities(), state = initializeOmensPackLocalPoolDrawState(tables), pool = state.poolStates[1], before = structuredClone(state); let calls = 0;
  const retry = selectOmensPackLocalPoolOfficialIdentityFromOneUnsigned32SampleForTest(state, pool.poolReference, cutoff(pool.poolTotalWeight), () => { calls++; throw new Error("must not select"); });
  assertRetry(retry); assertRetry(selectOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample(state, pool.poolReference, UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - 1)); assert.equal(calls, 0); assert.deepEqual(state, before);
  const selected = selectOmensPackLocalPoolOfficialIdentityFromOneUnsigned32SampleForTest(state, pool.poolReference, 4, (actualState, actualPool, ticket) => { calls++; assert.equal(actualState, state); assert.equal(actualPool, pool.poolReference); assert.equal(ticket, 4); return pool.officialIdentityChoices[0].officialIdentityReference; });
  assert.equal(selected.officialIdentityReference, pool.officialIdentityChoices[0].officialIdentityReference); assert.equal(calls, 1); assert.deepEqual(state, before);
});

test("post-removal current totals make removed identities unreachable with exact analytical preimages", () => {
  const { tables } = capabilities(), initial = initializeOmensPackLocalPoolDrawState(tables);
  for (const choiceIndex of [0, 1, 2]) {
    const removed = initial.poolStates[0].officialIdentityChoices[choiceIndex], state = removeAt(initial, 0, choiceIndex), pool = state.poolStates[0], multiplier = Math.floor(UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END / pool.poolTotalWeight), counts = new Map(pool.officialIdentityChoices.map((choice) => [choice.officialIdentityReference, 0]));
    for (let ticket = 0; ticket < pool.poolTotalWeight; ticket++) { const result = selectOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample(state, pool.poolReference, ticket); assert.equal(result.state, "selected"); counts.set(result.officialIdentityReference, counts.get(result.officialIdentityReference) + multiplier); assert.notEqual(result.officialIdentityReference, removed.officialIdentityReference); }
    for (const choice of pool.officialIdentityChoices) assert.equal(counts.get(choice.officialIdentityReference), choice.weight * multiplier);
    assertAnalyticalPreimages(state, 0); if (cutoff(pool.poolTotalWeight) < UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END) assertRetry(selectOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample(state, pool.poolReference, cutoff(pool.poolTotalWeight)));
  }
});

test("exhausted invalid copied forged and cross-capability inputs fail safely without mutation", () => {
  const first = capabilities(), second = capabilities(), state = initializeOmensPackLocalPoolDrawState(first.tables), foreign = initializeOmensPackLocalPoolDrawState(second.tables), pool = state.poolStates[0], exhausted = removeAt(state, 1, 0), snapshot = structuredClone(state);
  safe(() => selectOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample(exhausted, exhausted.poolStates[1].poolReference, 0));
  for (const sample of [-1, 0.5, NaN, Infinity, UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END, "0", null, undefined]) safe(() => selectOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample(state, pool.poolReference, sample));
  safe(() => selectOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample()); safe(() => selectOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample(state, pool.poolReference, 0, "override")); safe(() => selectOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample(structuredClone(state), pool.poolReference, 0)); safe(() => selectOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample(state, structuredClone(pool.poolReference), 0)); safe(() => selectOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample(state, foreign.poolStates[0].poolReference, 0)); safe(() => selectOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample(Object.freeze({ poolStates: Object.freeze([]) }), pool.poolReference, 0));
  assert.deepEqual(state, snapshot); const one = selectOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample(state, pool.poolReference, 2), two = selectOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample(state, pool.poolReference, 2); assert.notEqual(one, two); assert.deepEqual(one, two); assert.equal(one.officialIdentityReference, two.officialIdentityReference);
});

test("pack-local one-sample composition owns no entropy loop modulo removal pack or runtime behavior", () => {
  const source = readFileSync(new URL("../src/pack-local-pool-sample-selection.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Math\.random|crypto|randomBytes|randomUUID|while\s*\(|for\s*\(|%|remove|layout|slot|pack construction|card instance|rear|treatment|printing|image|snapshot|room|simulation|console\.|process\./iu);
});

const mutationModuleKey = "DRAFT_TABLE_TEST_PACK_LOCAL_POOL_SAMPLE_SELECTION_MODULE";
const sourcePath = new URL("../src/pack-local-pool-sample-selection.ts", import.meta.url);
const withCanonicalSnapshot = (action) => { let directory; try { directory = mkdtempSync(join(tmpdir(), "draft-table-pack-local-pool-sample-selection-mutation-")); const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url)); for (const file of readdirSync(sourceDirectory).filter((file) => file.endsWith(".ts"))) copyFileSync(join(sourceDirectory, file), join(directory, file)); symlinkSync(join(sourceDirectory, "../../../node_modules"), join(directory, "node_modules"), "dir"); return action(directory); } finally { if (directory !== undefined) rmSync(directory, { recursive: true, force: true }); } };
const loadMutationModules = async () => { const moduleUrl = process.env[mutationModuleKey] ?? sourcePath.href, directory = new URL("./", moduleUrl); return { selection: await import(moduleUrl), state: await import(new URL("pack-local-pool-draw-state.ts", directory)), compiler: await import(new URL("collation-weight-tables.ts", directory)), custom: await import(new URL("custom-cards.ts", directory)), eligibility: await import(new URL("draft-eligibility-classification.ts", directory)), layouts: await import(new URL("layouts.ts", directory)), upstream: await import(new URL("official-upstream-id-reconciliation.ts", directory)), pools: await import(new URL("pools.ts", directory)), identity: await import(new URL("recipe-official-identity-reconciliation.ts", directory)), poolResolution: await import(new URL("recipe-pool-identity-resolution.ts", directory)), layoutResolution: await import(new URL("recipe-layout-pool-resolution.ts", directory)) }; };
const runMutation = (mutated, contractName, marker, failure) => withCanonicalSnapshot((directory) => { const path = join(directory, "pack-local-pool-sample-selection.ts"); writeFileSync(path, mutated); const environment = { ...process.env, [mutationModuleKey]: pathToFileURL(path).href }; delete environment.NODE_TEST_CONTEXT; const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--test-name-pattern", exactTestNamePattern(contractName), fileURLToPath(import.meta.url)], { encoding: "utf8", env: environment }), lines = result.stdout.split(/\r?\n/u); assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`); assert.equal(lines.filter((line) => line === `# ${marker}`).length, 1); assert.equal(lines.filter((line) => /^not ok \d+ - /u.test(line) && line.replace(/^not ok \d+ - /u, "") === contractName).length, 1); assert.equal(lines.filter((line) => line.includes(failure)).length, 1); });

const currentBoundContract = "pack-local one-sample composition maps against the exact post-removal current pool total", currentBoundMarker = "PACK_LOCAL_SAMPLE_CURRENT_BOUND_CONTRACT_EXECUTED";
test(currentBoundContract, async () => { console.log(currentBoundMarker); const m = await loadMutationModules(), { tables } = capabilities(m), initial = m.state.initializeOmensPackLocalPoolDrawState(tables), state = m.state.removeOmensPackLocalPoolOfficialIdentity(initial, initial.poolStates[0].poolReference, initial.poolStates[0].officialIdentityChoices[0].officialIdentityReference), pool = state.poolStates[0]; assert.equal(m.selection.selectOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample(state, pool.poolReference, cutoff(pool.poolTotalWeight)).state, "retry", "POST_REMOVAL_CURRENT_POOL_BOUND_MUST_OWN_MAPPING"); });
test("current-bound semantic mutation fails its exact named contract", () => { const original = readFileSync(sourcePath, "utf8"); const mutated = original.replace("scope.scopedTotal", "poolReference.entries.reduce((total, entry) => total + entry.weight, 0)"); assert.notEqual(mutated, original); runMutation(mutated, currentBoundContract, currentBoundMarker, "POST_REMOVAL_CURRENT_POOL_BOUND_MUST_OWN_MAPPING"); });

const retryFallbackContract = "pack-local one-sample retry cannot become ticket-zero fallback", retryFallbackMarker = "PACK_LOCAL_SAMPLE_RETRY_NO_FALLBACK_CONTRACT_EXECUTED";
test(retryFallbackContract, async () => { console.log(retryFallbackMarker); const m = await loadMutationModules(), { tables } = capabilities(m), state = m.state.initializeOmensPackLocalPoolDrawState(tables), pool = state.poolStates[1]; assert.equal(m.selection.selectOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample(state, pool.poolReference, cutoff(pool.poolTotalWeight)).state, "retry", "RETRY_MUST_NOT_BECOME_TICKET_ZERO_SELECTION"); });
test("retry-fallback semantic mutation fails its exact named contract", () => { const original = readFileSync(sourcePath, "utf8"); const mutated = original.replace("if (mapping.state === \"retry\") return retry();", "if (mapping.state === \"retry\") return selected(selectOfficialIdentity(state, poolReference, 0));"); assert.notEqual(mutated, original); runMutation(mutated, retryFallbackContract, retryFallbackMarker, "RETRY_MUST_NOT_BECOME_TICKET_ZERO_SELECTION"); });

const currentIdentityContract = "pack-local one-sample selected identity comes from the current state", currentIdentityMarker = "PACK_LOCAL_SAMPLE_CURRENT_IDENTITY_CONTRACT_EXECUTED";
test(currentIdentityContract, async () => { console.log(currentIdentityMarker); const m = await loadMutationModules(), { tables } = capabilities(m), initial = m.state.initializeOmensPackLocalPoolDrawState(tables), removed = initial.poolStates[0].officialIdentityChoices[0], state = m.state.removeOmensPackLocalPoolOfficialIdentity(initial, initial.poolStates[0].poolReference, removed.officialIdentityReference), pool = state.poolStates[0], result = m.selection.selectOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample(state, pool.poolReference, 0); assert.notEqual(result.officialIdentityReference, removed.officialIdentityReference, "CURRENT_STATE_SELECTOR_MUST_EXCLUDE_REMOVED_IDENTITY"); });
test("current-identity semantic mutation fails its exact named contract", () => { const original = readFileSync(sourcePath, "utf8"); const mutated = original.replace("selectOfficialIdentity(state, poolReference, mapping.ticket)", "poolReference.entries[0].officialIdentity"); assert.notEqual(mutated, original); runMutation(mutated, currentIdentityContract, currentIdentityMarker, "CURRENT_STATE_SELECTOR_MUST_EXCLUDE_REMOVED_IDENTITY"); });

test("pack-local sample mutation snapshots are file-local OS-temp canonical copies and always clean", () => { let snapshot; withCanonicalSnapshot((directory) => { snapshot = directory; assert.ok(directory.startsWith(tmpdir())); assert.equal(directory.startsWith(`${resolvePath(fileURLToPath(new URL("../../..", import.meta.url)))}${sep}`), false); }); assert.equal(existsSync(snapshot), false); let failed; assert.throws(() => withCanonicalSnapshot((directory) => { failed = directory; throw new Error("body"); })); assert.equal(existsSync(failed), false); });
