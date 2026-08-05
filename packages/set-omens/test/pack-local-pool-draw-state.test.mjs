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
import {
  OmensPackLocalPoolDrawStateError,
  initializeOmensPackLocalPoolDrawState,
  removeOmensPackLocalPoolOfficialIdentity
} from "../src/pack-local-pool-draw-state.ts";

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
  const bytes = recipeBytes();
  const references = modules.custom.completeOmensRecipeCustomCardsAggregateForTest(modules.custom.parseOmensCustomCardsFromTrustedBytes(bytes), { common: 8, rare: 1, mythic: 1 });
  const layouts = modules.layouts.parseOmensLayoutsFromTrustedBytes(bytes);
  const completedPools = modules.pools.completeOmensRecipePoolsForTest(modules.pools.parseOmensPoolsFromTrustedBytes(bytes), layouts, references);
  const names = new Map([...cards.map(([name, id]) => [id, name]), ["IAR200", "Excluded"]]);
  const source = forms.map((form, index) => ({ unique_id: `fictional-card-${index}`, name: names.get(form.baseCollectorId), pitch: "", printings: [{ unique_id: `fictional-printing-${index}`, set_printing_unique_id: `fictional-set-${form.sourceSet}`, id: form.baseCollectorId, set_id: form.sourceSet, edition: "standard", foiling: "standard", rarity: "C", expansion_slot: false, image_url: "https://cards.invalid/a.png", art_variations: [] }] }));
  const official = modules.upstream.reconcileOfficialUpstreamIdRecordsForTest(forms, source, { entries: 11, omnEntries: 10, iarEntries: 1, omnPrintings: 10, iarPrintings: 1 });
  const identities = modules.identity.reconcileOmensRecipeOfficialIdentityRecordsForTest(references, official, { recipeEntries: 10, officialEntries: 11, candidateEntries: 10, mappedEntries: 10, unmappedEntries: 1, unmappedOmn: 0, unmappedIar: 1, unmappedUnsuffixed: 0, unmappedRf: 0, unmappedCf: 0, unmappedMv: 1 });
  const eligibility = modules.eligibility.classifyOmensDraftEligibilityForTest(identities, official, { officialEntries: 11, mappedEntries: 10, mappedIarEntries: 0, excludedEntries: 1, excludedIarEntries: 1, excludedNonIarEntries: 0, unclassifiedEntries: 0, unclassifiedOmnEntries: 0, unclassifiedIarEntries: 0, unclassifiedUnsuffixed: 0, unclassifiedRf: 0, unclassifiedCf: 0, unclassifiedMv: 0 });
  const resolvedPools = modules.poolResolution.resolveOmensRecipePoolsToDraftableOfficialIdentitiesForTest(completedPools, identities, eligibility);
  const resolvedLayouts = modules.layoutResolution.resolveOmensRecipeLayoutsToOfficialIdentityPoolsForTest(layouts, resolvedPools);
  return { resolvedPools, tables: modules.compiler.compileOmensCollationWeightTablesForTest(resolvedLayouts, resolvedPools) };
};

const safe = (action) => assert.throws(action, (error) => {
  assert.ok(error instanceof OmensPackLocalPoolDrawStateError);
  assert.equal(error.code, "OMENS_PACK_LOCAL_POOL_DRAW_STATE_FAILED");
  assert.equal(error.message, "Omens pack local pool draw state failed.");
  assert.equal(error.stack, "OmensPackLocalPoolDrawStateError: Omens pack local pool draw state failed.");
  assert.deepEqual(JSON.parse(JSON.stringify(error)), { name: "OmensPackLocalPoolDrawStateError", code: "OMENS_PACK_LOCAL_POOL_DRAW_STATE_FAILED" });
  assert.doesNotMatch(`${error.message}${error.stack}${JSON.stringify(error)}`, /Fictional|OMN|IAR|Wizard|[0-9]|https?:|\\|\//iu);
  return true;
});
const removeAt = (state, poolIndex, choiceIndex, operation = removeOmensPackLocalPoolOfficialIdentity) => operation(
  state,
  state.poolStates[poolIndex].poolReference,
  state.poolStates[poolIndex].officialIdentityChoices[choiceIndex].officialIdentityReference
);
const assertRecurrence = (poolState) => {
  let prior = 0;
  for (const choice of poolState.officialIdentityChoices) {
    assert.equal(choice.cumulativeExclusiveEnd, prior + choice.weight);
    prior = choice.cumulativeExclusiveEnd;
  }
  assert.equal(prior, poolState.poolTotalWeight);
};

test("pack-local draw-state initialization projects all exact registered pool tables deeply immutably", () => {
  const { tables } = capabilities(), state = initializeOmensPackLocalPoolDrawState(tables);
  assert.ok(Object.isFrozen(state)); assert.ok(Object.isFrozen(state.poolStates)); assert.equal(state.poolStates.length, 11);
  for (let index = 0; index < state.poolStates.length; index++) {
    const poolState = state.poolStates[index], table = tables.poolTables[index];
    assert.ok(Object.isFrozen(poolState)); assert.ok(Object.isFrozen(poolState.officialIdentityChoices));
    assert.equal(poolState.poolReference, table.poolReference); assert.equal(poolState.poolTotalWeight, table.poolTotalWeight);
    assert.deepEqual(poolState.officialIdentityChoices, table.officialIdentityChoices); assertRecurrence(poolState);
    for (let choiceIndex = 0; choiceIndex < poolState.officialIdentityChoices.length; choiceIndex++) {
      assert.equal(poolState.officialIdentityChoices[choiceIndex].officialIdentityReference, table.officialIdentityChoices[choiceIndex].officialIdentityReference);
      assert.ok(Object.isFrozen(poolState.officialIdentityChoices[choiceIndex]));
    }
  }
  assert.throws(() => state.poolStates.push({}), TypeError); assert.throws(() => { state.poolStates[0].poolTotalWeight = 1; }, TypeError);
});

test("first middle and last removals recompile exact prefixes and preserve original and unrelated pools", () => {
  for (const choiceIndex of [0, 1, 2]) {
    const { tables } = capabilities(), state = initializeOmensPackLocalPoolDrawState(tables), original = structuredClone(state), source = structuredClone(tables);
    const selectedPool = state.poolStates[0], selected = selectedPool.officialIdentityChoices[choiceIndex], next = removeAt(state, 0, choiceIndex);
    assert.notEqual(next, state); assert.notEqual(next.poolStates, state.poolStates); assert.notEqual(next.poolStates[0], selectedPool);
    assert.equal(next.poolStates[0].poolReference, selectedPool.poolReference);
    assert.equal(next.poolStates[0].poolTotalWeight, selectedPool.poolTotalWeight - selected.weight);
    assert.deepEqual(next.poolStates[0].officialIdentityChoices.map((choice) => choice.officialIdentityReference), selectedPool.officialIdentityChoices.filter((_, index) => index !== choiceIndex).map((choice) => choice.officialIdentityReference));
    assert.deepEqual(next.poolStates[0].officialIdentityChoices.map((choice) => choice.weight), selectedPool.officialIdentityChoices.filter((_, index) => index !== choiceIndex).map((choice) => choice.weight));
    assertRecurrence(next.poolStates[0]);
    for (let index = 1; index < state.poolStates.length; index++) assert.equal(next.poolStates[index], state.poolStates[index]);
    assert.deepEqual(state, original); assert.deepEqual(tables, source);
  }
});

test("one-entry removal creates an explicit immutable exhausted pool with no fallback", () => {
  const { tables } = capabilities(), state = initializeOmensPackLocalPoolDrawState(tables), next = removeAt(state, 1, 0);
  assert.equal(next.poolStates[1].poolTotalWeight, 0); assert.deepEqual(next.poolStates[1].officialIdentityChoices, []);
  assert.ok(Object.isFrozen(next.poolStates[1])); assert.ok(Object.isFrozen(next.poolStates[1].officialIdentityChoices)); assertRecurrence(next.poolStates[1]);
  safe(() => removeOmensPackLocalPoolOfficialIdentity(next, next.poolStates[1].poolReference, state.poolStates[1].officialIdentityChoices[0].officialIdentityReference));
});

test("removal rejects repeats foreign members copies forgeries cross-capability mixing and overrides", () => {
  const first = capabilities(), second = capabilities(), state = initializeOmensPackLocalPoolDrawState(first.tables), foreignState = initializeOmensPackLocalPoolDrawState(second.tables);
  const pool = state.poolStates[0], identity = pool.officialIdentityChoices[0].officialIdentityReference, next = removeAt(state, 0, 0);
  safe(() => removeOmensPackLocalPoolOfficialIdentity(next, pool.poolReference, identity));
  safe(() => removeOmensPackLocalPoolOfficialIdentity(state, pool.poolReference, state.poolStates[1].officialIdentityChoices[0].officialIdentityReference));
  safe(() => removeOmensPackLocalPoolOfficialIdentity(state, structuredClone(pool.poolReference), identity));
  safe(() => removeOmensPackLocalPoolOfficialIdentity(state, pool.poolReference, structuredClone(identity)));
  safe(() => removeOmensPackLocalPoolOfficialIdentity(structuredClone(state), pool.poolReference, identity));
  safe(() => removeOmensPackLocalPoolOfficialIdentity(Object.freeze({ ...state }), pool.poolReference, identity));
  safe(() => removeOmensPackLocalPoolOfficialIdentity(state, foreignState.poolStates[0].poolReference, identity));
  safe(() => removeOmensPackLocalPoolOfficialIdentity(state, pool.poolReference, foreignState.poolStates[0].officialIdentityChoices[0].officialIdentityReference));
  safe(() => initializeOmensPackLocalPoolDrawState(structuredClone(first.tables)));
  safe(() => initializeOmensPackLocalPoolDrawState(first.tables, { total: 1 }));
  safe(() => removeOmensPackLocalPoolOfficialIdentity());
  safe(() => removeOmensPackLocalPoolOfficialIdentity(state, pool.poolReference, identity, { weight: 1 }));
});

test("removing one identity is exact-pool scoped even when the same identity is in a rainbow-foil pool", () => {
  const { tables } = capabilities(), state = initializeOmensPackLocalPoolDrawState(tables), normal = state.poolStates[0], rainbow = state.poolStates[8];
  assert.deepEqual(normal.officialIdentityChoices[0].officialIdentityReference, rainbow.officialIdentityChoices[0].officialIdentityReference);
  assert.notEqual(normal.officialIdentityChoices[0].officialIdentityReference, rainbow.officialIdentityChoices[0].officialIdentityReference);
  const next = removeAt(state, 0, 0);
  assert.equal(next.poolStates[8], rainbow); assert.deepEqual(next.poolStates[8], state.poolStates[8]);
  assert.equal(next.poolStates[8].officialIdentityChoices[0].officialIdentityReference, rainbow.officialIdentityChoices[0].officialIdentityReference);
});

test("independent pack initialization is fresh and isolated from prior pack transitions", () => {
  const { tables } = capabilities(), first = initializeOmensPackLocalPoolDrawState(tables), changed = removeAt(first, 0, 1), second = initializeOmensPackLocalPoolDrawState(tables);
  assert.notEqual(first, second); assert.notEqual(first.poolStates, second.poolStates); assert.notEqual(changed, second);
  assert.deepEqual(second.poolStates.map((pool) => [pool.poolTotalWeight, pool.officialIdentityChoices.length]), first.poolStates.map((pool) => [pool.poolTotalWeight, pool.officialIdentityChoices.length]));
  assert.equal(second.poolStates[0].officialIdentityChoices[1].officialIdentityReference, first.poolStates[0].officialIdentityChoices[1].officialIdentityReference);
});

test("small-table properties conserve exact order weights recurrence and total delta for every removal", () => {
  const { tables } = capabilities(), initial = initializeOmensPackLocalPoolDrawState(tables);
  for (let poolIndex = 0; poolIndex < initial.poolStates.length; poolIndex++) {
    const sourcePool = initial.poolStates[poolIndex];
    for (let choiceIndex = 0; choiceIndex < sourcePool.officialIdentityChoices.length; choiceIndex++) {
      const fresh = initializeOmensPackLocalPoolDrawState(tables), selected = fresh.poolStates[poolIndex].officialIdentityChoices[choiceIndex], next = removeAt(fresh, poolIndex, choiceIndex), output = next.poolStates[poolIndex];
      assert.equal(output.poolTotalWeight + selected.weight, fresh.poolStates[poolIndex].poolTotalWeight);
      assert.deepEqual(output.officialIdentityChoices.map((choice) => [choice.officialIdentityReference, choice.weight]), fresh.poolStates[poolIndex].officialIdentityChoices.filter((_, index) => index !== choiceIndex).map((choice) => [choice.officialIdentityReference, choice.weight]));
      assert.equal(output.officialIdentityChoices.reduce((total, choice) => total + choice.weight, 0), output.poolTotalWeight);
      assertRecurrence(output);
    }
  }
});

test("pack-local draw-state source owns no entropy selection retry layout pack treatment image or persistence behavior", () => {
  const source = readFileSync(sourcePath, "utf8");
  assert.doesNotMatch(source, /Math\.random|crypto|sample|retry|layout|slot|pack construction|card instance|rear|treatment|printing|image|snapshot|room|simulation|setInterval|setTimeout/iu);
});

const mutationModuleKey = "DRAFT_TABLE_TEST_PACK_LOCAL_POOL_DRAW_STATE_MODULE";
const sourcePath = new URL("../src/pack-local-pool-draw-state.ts", import.meta.url);
const withCanonicalSnapshot = (action) => {
  let directory;
  try {
    directory = mkdtempSync(join(tmpdir(), "draft-table-pack-local-pool-draw-state-mutation-"));
    const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url));
    for (const file of readdirSync(sourceDirectory).filter((file) => file.endsWith(".ts"))) copyFileSync(join(sourceDirectory, file), join(directory, file));
    symlinkSync(join(sourceDirectory, "../../../node_modules"), join(directory, "node_modules"), "dir");
    return action(directory);
  } finally { if (directory !== undefined) rmSync(directory, { recursive: true, force: true }); }
};
const loadMutationModules = async () => {
  const moduleUrl = process.env[mutationModuleKey] ?? sourcePath.href, directory = new URL("./", moduleUrl);
  return {
    state: await import(moduleUrl), compiler: await import(new URL("collation-weight-tables.ts", directory)), custom: await import(new URL("custom-cards.ts", directory)),
    eligibility: await import(new URL("draft-eligibility-classification.ts", directory)), layouts: await import(new URL("layouts.ts", directory)),
    upstream: await import(new URL("official-upstream-id-reconciliation.ts", directory)), pools: await import(new URL("pools.ts", directory)),
    identity: await import(new URL("recipe-official-identity-reconciliation.ts", directory)), poolResolution: await import(new URL("recipe-pool-identity-resolution.ts", directory)),
    layoutResolution: await import(new URL("recipe-layout-pool-resolution.ts", directory))
  };
};
const runMutation = (mutated, contractName, marker, failure) => withCanonicalSnapshot((directory) => {
  const path = join(directory, "pack-local-pool-draw-state.ts"); writeFileSync(path, mutated);
  const environment = { ...process.env, [mutationModuleKey]: pathToFileURL(path).href }; delete environment.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--test-name-pattern", exactTestNamePattern(contractName), fileURLToPath(import.meta.url)], { encoding: "utf8", env: environment });
  const lines = result.stdout.split(/\r?\n/u);
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.equal(lines.filter((line) => line === `# ${marker}`).length, 1);
  assert.equal(lines.filter((line) => /^not ok \d+ - /u.test(line) && line.replace(/^not ok \d+ - /u, "") === contractName).length, 1);
  assert.equal(lines.filter((line) => line.includes(failure)).length, 1);
});

const subtractionContract = "pack-local removal subtracts the exact selected identity weight", subtractionMarker = "PACK_LOCAL_SELECTED_WEIGHT_SUBTRACTION_CONTRACT_EXECUTED";
test(subtractionContract, async () => {
  console.log(subtractionMarker); const m = await loadMutationModules(), { tables } = capabilities(m), state = m.state.initializeOmensPackLocalPoolDrawState(tables), pool = state.poolStates[0], selected = pool.officialIdentityChoices[1];
  const next = m.state.removeOmensPackLocalPoolOfficialIdentity(state, pool.poolReference, selected.officialIdentityReference);
  assert.equal(next.poolStates[0].poolTotalWeight, pool.poolTotalWeight - selected.weight, "EXACT_SELECTED_WEIGHT_MUST_BE_SUBTRACTED");
});
test("selected-weight subtraction semantic mutation fails its exact named contract", () => {
  const original = readFileSync(sourcePath, "utf8"); const mutated = original
    .replace("const nextTotal = selectedPool.poolTotalWeight - selectedChoice.weight;", "const nextTotal = selectedPool.poolTotalWeight - choices[0].weight;")
    .replace("if (cumulativeExclusiveEnd !== nextTotal) fail();", "if (false) fail();")
    .replace("return register(nextPoolStates);", "return frozen({ poolStates: frozen(nextPoolStates) });");
  assert.notEqual(mutated, original); runMutation(mutated, subtractionContract, subtractionMarker, "EXACT_SELECTED_WEIGHT_MUST_BE_SUBTRACTED");
});

const prefixContract = "pack-local removal restarts and recompiles every remaining cumulative prefix", prefixMarker = "PACK_LOCAL_PREFIX_RECOMPILATION_CONTRACT_EXECUTED";
test(prefixContract, async () => {
  console.log(prefixMarker); const m = await loadMutationModules(), { tables } = capabilities(m), state = m.state.initializeOmensPackLocalPoolDrawState(tables), pool = state.poolStates[0];
  const next = m.state.removeOmensPackLocalPoolOfficialIdentity(state, pool.poolReference, pool.officialIdentityChoices[1].officialIdentityReference), choices = next.poolStates[0].officialIdentityChoices;
  assert.deepEqual(choices.map((choice) => choice.cumulativeExclusiveEnd), [2, 7], "EVERY_PREFIX_MUST_RESTART_AND_RECOMPILE");
});
test("prefix restart semantic mutation fails its exact named contract", () => {
  const original = readFileSync(sourcePath, "utf8"), mutated = original
    .replace("let cumulativeExclusiveEnd = 0;", "let cumulativeExclusiveEnd = selectedChoice.weight;")
    .replace("if (cumulativeExclusiveEnd !== nextTotal) fail();", "if (false) fail();")
    .replace("return register(nextPoolStates);", "return frozen({ poolStates: frozen(nextPoolStates) });");
  assert.notEqual(mutated, original); runMutation(mutated, prefixContract, prefixMarker, "EVERY_PREFIX_MUST_RESTART_AND_RECOMPILE");
});

const scopeContract = "pack-local removal affects only the exact selected pool scope", scopeMarker = "PACK_LOCAL_EXACT_POOL_SCOPE_CONTRACT_EXECUTED";
test(scopeContract, async () => {
  console.log(scopeMarker); const m = await loadMutationModules(), { tables } = capabilities(m), state = m.state.initializeOmensPackLocalPoolDrawState(tables), identity = state.poolStates[0].officialIdentityChoices[0].officialIdentityReference;
  const next = m.state.removeOmensPackLocalPoolOfficialIdentity(state, state.poolStates[0].poolReference, identity);
  assert.equal(next.poolStates[8], state.poolStates[8], "ONLY_EXACT_SELECTED_POOL_MAY_CHANGE");
});
test("exact-pool scope semantic mutation fails its exact named contract", () => {
  const original = readFileSync(sourcePath, "utf8"), mutated = original.replace(
    ": poolState);",
    ": removeFromPool(poolState, poolState.officialIdentityChoices[0].officialIdentityReference));"
  );
  assert.notEqual(mutated, original); runMutation(mutated, scopeContract, scopeMarker, "ONLY_EXACT_SELECTED_POOL_MAY_CHANGE");
});

const repeatContract = "pack-local removal rejects an identity already removed from that pool", repeatMarker = "PACK_LOCAL_REPEAT_REMOVAL_REJECTION_CONTRACT_EXECUTED";
test(repeatContract, async () => {
  console.log(repeatMarker); const m = await loadMutationModules(), { tables } = capabilities(m), state = m.state.initializeOmensPackLocalPoolDrawState(tables), pool = state.poolStates[0], identity = pool.officialIdentityChoices[0].officialIdentityReference;
  const next = m.state.removeOmensPackLocalPoolOfficialIdentity(state, pool.poolReference, identity);
  assert.throws(() => m.state.removeOmensPackLocalPoolOfficialIdentity(next, pool.poolReference, identity), { code: "OMENS_PACK_LOCAL_POOL_DRAW_STATE_FAILED" }, "REPEAT_REMOVAL_MUST_FAIL");
});
test("repeat-removal rejection semantic mutation fails its exact named contract", () => {
  const original = readFileSync(sourcePath, "utf8"), mutated = original.replace("if (selectedChoices.length !== 1) fail();", "if (selectedChoices.length === 0) return selectedPool;");
  assert.notEqual(mutated, original); runMutation(mutated, repeatContract, repeatMarker, "REPEAT_REMOVAL_MUST_FAIL");
});

test("pack-local mutation snapshots are file-local OS-temp canonical copies and always clean", () => {
  let snapshot; withCanonicalSnapshot((directory) => { snapshot = directory; assert.ok(directory.startsWith(tmpdir())); assert.equal(directory.startsWith(`${resolvePath(fileURLToPath(new URL("../../..", import.meta.url)))}${sep}`), false); }); assert.equal(existsSync(snapshot), false);
  let failed; assert.throws(() => withCanonicalSnapshot((directory) => { failed = directory; throw new Error("body"); })); assert.equal(existsSync(failed), false);
});
