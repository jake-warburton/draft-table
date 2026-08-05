import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END } from "@draft-table/engine";
import { fictionalCollationCapabilities } from "./fictional-collation-capabilities.mjs";
import { exactTestNamePattern } from "./recipe-layout-pool-resolution-test-name.mjs";
import { initializeOmensPackLocalPoolDrawState, removeOmensPackLocalPoolOfficialIdentity } from "../src/pack-local-pool-draw-state.ts";
import {
  OmensPackCollationPlanInitializationError,
  initializeOmensPackCollationPlanFromOneUnsigned32Sample,
  initializeOmensPackCollationPlanFromOneUnsigned32SampleForTest,
  readOmensPackCollationPlanLayoutForTransition,
  readOmensPackCollationPlanNextPositionForTransition,
  readOmensPackCollationPlanPoolDrawStateForTransition
} from "../src/pack-collation-plan.ts";

const cutoff = (bound) => UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END % bound;
const safe = (action) => assert.throws(action, (error) => {
  assert.ok(error instanceof OmensPackCollationPlanInitializationError); assert.equal(error.code, "OMENS_PACK_COLLATION_PLAN_INITIALIZATION_FAILED"); assert.equal(error.message, "Omens pack collation plan initialization failed."); assert.equal(error.stack, "OmensPackCollationPlanInitializationError: Omens pack collation plan initialization failed."); assert.deepEqual(JSON.parse(JSON.stringify(error)), { name: "OmensPackCollationPlanInitializationError", code: "OMENS_PACK_COLLATION_PLAN_INITIALIZATION_FAILED" }); assert.doesNotMatch(`${error.message}${error.stack}${JSON.stringify(error)}`, /Fictional|OMN|IAR|[0-9]|https?:|\\|\//iu); return true;
});
const assertPools = (tables, state) => {
  assert.equal(state.poolStates.length, 11);
  for (let index = 0; index < 11; index++) {
    const actual = state.poolStates[index], expected = tables.poolTables[index];
    assert.equal(actual.poolReference, expected.poolReference); assert.equal(actual.poolTotalWeight, expected.poolTotalWeight); assert.equal(actual.officialIdentityChoices.length, expected.officialIdentityChoices.length);
    for (let entry = 0; entry < actual.officialIdentityChoices.length; entry++) {
      assert.equal(actual.officialIdentityChoices[entry].officialIdentityReference, expected.officialIdentityChoices[entry].officialIdentityReference); assert.equal(actual.officialIdentityChoices[entry].weight, expected.officialIdentityChoices[entry].weight); assert.equal(actual.officialIdentityChoices[entry].cumulativeExclusiveEnd, expected.officialIdentityChoices[entry].cumulativeExclusiveEnd);
    }
  }
};

const selected = (tables, sample) => {
  const result = initializeOmensPackCollationPlanFromOneUnsigned32Sample(tables, sample); assert.equal(result.state, "selected"); return result;
};

test("one sample retries without initializing or creates exact first middle last layout-bound fresh plans", () => {
  const { tables, resolvedLayouts } = fictionalCollationCapabilities(), accepted = cutoff(tables.layoutTotalWeight); let initialized = 0;
  const retry = initializeOmensPackCollationPlanFromOneUnsigned32SampleForTest(tables, accepted, () => Object.freeze({ state: "retry" }), () => { initialized++; throw new Error("must not initialize"); });
  assert.deepEqual(retry, { state: "retry" }); assert.ok(Object.isFrozen(retry)); assert.equal(initialized, 0);
  for (const [sample, expected] of [[0, 0], [tables.layoutChoices[113].cumulativeExclusiveEnd, 114], [accepted - 1, 227]]) {
    const result = selected(tables, sample), state = readOmensPackCollationPlanPoolDrawStateForTransition(result.plan);
    assert.equal(result.layoutReference, resolvedLayouts.layouts[expected]); assert.equal(readOmensPackCollationPlanLayoutForTransition(result.plan), result.layoutReference); assert.equal(readOmensPackCollationPlanNextPositionForTransition(result.plan), 0); assertPools(tables, state); assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.plan));
  }
});

test("every fictional layout interval boundary binds the exact selected layout and independent fresh-state oracle", () => {
  const { tables } = fictionalCollationCapabilities(), accepted = cutoff(tables.layoutTotalWeight);
  for (let index = 0; index < tables.layoutChoices.length; index++) {
    const choice = tables.layoutChoices[index], start = index === 0 ? 0 : tables.layoutChoices[index - 1].cumulativeExclusiveEnd;
    for (const sample of [start, choice.cumulativeExclusiveEnd - 1]) {
      const result = selected(tables, sample); assert.equal(result.layoutReference, choice.layoutReference); assertPools(tables, readOmensPackCollationPlanPoolDrawStateForTransition(result.plan)); assert.equal(readOmensPackCollationPlanNextPositionForTransition(result.plan), 0);
    }
  }
  assert.deepEqual(initializeOmensPackCollationPlanFromOneUnsigned32Sample(tables, accepted), { state: "retry" });
});

test("plans are independently fresh while their immutable compiled capability remains unchanged", () => {
  const { tables } = fictionalCollationCapabilities(), before = structuredClone(tables), first = selected(tables, 0), second = selected(tables, 0), one = readOmensPackCollationPlanPoolDrawStateForTransition(first.plan), two = readOmensPackCollationPlanPoolDrawStateForTransition(second.plan);
  assert.notEqual(first.plan, second.plan); assert.notEqual(one, two); assert.notEqual(one.poolStates, two.poolStates); assert.equal(first.layoutReference, second.layoutReference); assert.deepEqual(tables, before); assert.throws(() => { first.plan.any = "forged"; }, TypeError);
});

test("invalid copied foreign mixed malformed and override inputs fail without partial effects", () => {
  const first = fictionalCollationCapabilities(), second = fictionalCollationCapabilities(), before = structuredClone(first.tables);
  for (const sample of [-1, 0.5, NaN, Infinity, UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END, "0", null, undefined]) safe(() => initializeOmensPackCollationPlanFromOneUnsigned32Sample(first.tables, sample));
  safe(() => initializeOmensPackCollationPlanFromOneUnsigned32Sample()); safe(() => initializeOmensPackCollationPlanFromOneUnsigned32Sample(first.tables, 0, "override")); safe(() => initializeOmensPackCollationPlanFromOneUnsigned32Sample(structuredClone(first.tables), 0));
  safe(() => initializeOmensPackCollationPlanFromOneUnsigned32SampleForTest(first.tables, 0, () => Object.freeze({ state: "selected", layoutReference: second.tables.layoutChoices[0].layoutReference }), () => initializeOmensPackLocalPoolDrawState(first.tables)));
  safe(() => initializeOmensPackCollationPlanFromOneUnsigned32SampleForTest(first.tables, 0, () => Object.freeze({ state: "selected", layoutReference: first.tables.layoutChoices[0].layoutReference }), () => initializeOmensPackLocalPoolDrawState(second.tables)));
  const fresh = initializeOmensPackLocalPoolDrawState(first.tables), selectedPool = fresh.poolStates[0], depleted = removeOmensPackLocalPoolOfficialIdentity(fresh, selectedPool.poolReference, selectedPool.officialIdentityChoices[0].officialIdentityReference);
  safe(() => initializeOmensPackCollationPlanFromOneUnsigned32SampleForTest(first.tables, 0, () => Object.freeze({ state: "selected", layoutReference: first.tables.layoutChoices[0].layoutReference }), () => depleted));
  assert.deepEqual(first.tables, before);
});

const copiedLayoutWith = (layout, change) => Object.freeze({ ...layout, slots: Object.freeze(layout.slots.map((position, index) => Object.freeze(change(position, index)))) });
const assertPlanRejectedBeforeInitialization = (tables, layoutReference, message) => {
  let initialized = 0, captured;
  safe(() => initializeOmensPackCollationPlanFromOneUnsigned32SampleForTest(tables, 0, () => Object.freeze({ state: "selected", layoutReference }), () => { initialized++; captured = initializeOmensPackLocalPoolDrawState(tables); return captured; }));
  assert.equal(initialized, 0, message); assert.equal(captured, undefined, message);
};

test("entire selected plan fails before initialization for ownership pool role position and capacity defects", () => {
  const first = fictionalCollationCapabilities(), second = fictionalCollationCapabilities(), layout = first.tables.layoutChoices[0].layoutReference;
  assertPlanRejectedBeforeInitialization(first.tables, second.tables.layoutChoices[0].layoutReference, "INVALID_LAYOUT_OWNERSHIP_MUST_PRECEDE_INITIALIZATION");
  assertPlanRejectedBeforeInitialization(first.tables, copiedLayoutWith(layout, (position, index) => index === 0 ? { ...position, resolvedPool: second.tables.poolTables[0].poolReference } : position), "FOREIGN_POOL_REFERENCE_MUST_PRECEDE_INITIALIZATION");
  assertPlanRejectedBeforeInitialization(first.tables, copiedLayoutWith(layout, (position, index) => index === 0 ? { ...position, recipeStructuralRole: "fixed-rare" } : position), "ROLE_INCOHERENCE_MUST_PRECEDE_INITIALIZATION");
  assertPlanRejectedBeforeInitialization(first.tables, copiedLayoutWith(layout, (position, index) => index === 0 ? { ...position, position: 2 } : position), "POSITION_INCOHERENCE_MUST_PRECEDE_INITIALIZATION");
  const limitedPool = first.tables.poolTables.find((table) => table.officialIdentityChoices.length === 1).poolReference;
  assertPlanRejectedBeforeInitialization(first.tables, copiedLayoutWith(layout, (position, index) => index < 3 ? { ...position, resolvedPool: limitedPool } : position), "INSUFFICIENT_POOL_CAPACITY_MUST_PRECEDE_INITIALIZATION");
});

test("plan initialization source owns no entropy retry loop draw removal slots treatments or pack construction", () => {
  const source = readFileSync(new URL("../src/pack-collation-plan.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Math\.random|crypto|randomBytes|randomUUID|while\s*\(|for\s*\(|%|remove|treatment|rear|card instance|pack construction|console\.|process\./u);
});

const mutationModuleKey = "DRAFT_TABLE_TEST_PACK_COLLATION_PLAN_MODULE";
const sourcePath = new URL("../src/pack-collation-plan.ts", import.meta.url);
const withCanonicalSnapshot = (action) => { let directory; try { directory = mkdtempSync(join(tmpdir(), "draft-table-pack-collation-plan-mutation-")); const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url)); for (const file of readdirSync(sourceDirectory).filter((file) => file.endsWith(".ts"))) copyFileSync(join(sourceDirectory, file), join(directory, file)); symlinkSync(join(sourceDirectory, "../../../node_modules"), join(directory, "node_modules"), "dir"); return action(directory); } finally { if (directory !== undefined) rmSync(directory, { recursive: true, force: true }); } };
const mutationModules = async () => { const moduleUrl = process.env[mutationModuleKey] ?? sourcePath.href, directory = new URL("./", moduleUrl); const [plan, drawState, custom, eligibility, layouts, upstream, pools, identity, layoutResolution, poolResolution, compiler] = await Promise.all([import(moduleUrl), import(new URL("pack-local-pool-draw-state.ts", directory)), import(new URL("custom-cards.ts", directory)), import(new URL("draft-eligibility-classification.ts", directory)), import(new URL("layouts.ts", directory)), import(new URL("official-upstream-id-reconciliation.ts", directory)), import(new URL("pools.ts", directory)), import(new URL("recipe-official-identity-reconciliation.ts", directory)), import(new URL("recipe-layout-pool-resolution.ts", directory)), import(new URL("recipe-pool-identity-resolution.ts", directory)), import(new URL("collation-weight-tables.ts", directory))]); return { plan, drawState, capabilities: fictionalCollationCapabilities({ ...custom, ...eligibility, ...layouts, ...upstream, ...pools, ...identity, ...layoutResolution, ...poolResolution, ...compiler }) }; };
const runMutation = (mutated, contractName, marker, failure) => withCanonicalSnapshot((directory) => { const path = join(directory, "pack-collation-plan.ts"); writeFileSync(path, mutated); const environment = { ...process.env, [mutationModuleKey]: pathToFileURL(path).href }; delete environment.NODE_TEST_CONTEXT; const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--test-name-pattern", exactTestNamePattern(contractName), fileURLToPath(import.meta.url)], { encoding: "utf8", env: environment }), lines = result.stdout.split(/\r?\n/u); assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`); assert.equal(lines.filter((line) => line === `# ${marker}`).length, 1); assert.equal(lines.filter((line) => /^not ok \d+ - /u.test(line) && line.includes(contractName)).length, 1); assert.equal(lines.filter((line) => line.includes(failure)).length, 1); });

const retryContract = "pack collation plan retry cannot initialize a plan", retryMarker = "PACK_COLLATION_PLAN_RETRY_CONTRACT_EXECUTED";
test(retryContract, async () => { console.log(retryMarker); const { plan, capabilities } = await mutationModules(), result = plan.initializeOmensPackCollationPlanFromOneUnsigned32Sample(capabilities.tables, cutoff(capabilities.tables.layoutTotalWeight)); assert.equal(result.state, "retry", "RETRY_MUST_NOT_INITIALIZE_A_PLAN"); });
test("plan retry initialization semantic mutation fails its exact named contract", () => { const original = readFileSync(sourcePath, "utf8"), mutated = original.replace("if (selection.state === \"retry\") return retry();", "if (selection.state === \"retry\") return frozen({ state: \"selected\", layoutReference: tables.layoutChoices[0].layoutReference, plan: register(tables, tables.layoutChoices[0].layoutReference, initializePoolDrawState(tables)) });"); assert.notEqual(mutated, original); runMutation(mutated, retryContract, retryMarker, "RETRY_MUST_NOT_INITIALIZE_A_PLAN"); });

const layoutContract = "pack collation plan binds the exact selected layout without substitution", layoutMarker = "PACK_COLLATION_PLAN_LAYOUT_CONTRACT_EXECUTED";
test(layoutContract, async () => { console.log(layoutMarker); const { plan, capabilities } = await mutationModules(), result = plan.initializeOmensPackCollationPlanFromOneUnsigned32Sample(capabilities.tables, 0); assert.equal(result.layoutReference, capabilities.tables.layoutChoices[0].layoutReference, "SELECTED_LAYOUT_MUST_NOT_BE_SUBSTITUTED"); assert.equal(plan.readOmensPackCollationPlanLayoutForTransition(result.plan) === result.layoutReference, true, "PLAN_MUST_BIND_SELECTED_LAYOUT"); });
test("plan layout substitution semantic mutation fails its exact named contract", () => { const original = readFileSync(sourcePath, "utf8"), mutated = original.replace("selection.layoutReference, initializePoolDrawState(tables)", "tables.layoutChoices[1].layoutReference, initializePoolDrawState(tables)"); assert.notEqual(mutated, original); runMutation(mutated, layoutContract, layoutMarker, "PLAN_MUST_BIND_SELECTED_LAYOUT"); });

const stateContract = "pack collation plan requires an exact fresh all-pool projection", stateMarker = "PACK_COLLATION_PLAN_EXACT_FRESH_STATE_CONTRACT_EXECUTED";
test(stateContract, async () => { console.log(stateMarker); const { plan, drawState, capabilities } = await mutationModules(), fresh = drawState.initializeOmensPackLocalPoolDrawState(capabilities.tables), pool = fresh.poolStates[0], depleted = drawState.removeOmensPackLocalPoolOfficialIdentity(fresh, pool.poolReference, pool.officialIdentityChoices[0].officialIdentityReference); assert.throws(() => plan.initializeOmensPackCollationPlanFromOneUnsigned32SampleForTest(capabilities.tables, 0, (tables) => ({ state: "selected", layoutReference: tables.layoutChoices[0].layoutReference }), () => depleted), { code: "OMENS_PACK_COLLATION_PLAN_INITIALIZATION_FAILED" }, "PLAN_STATE_MUST_BE_EXACTLY_FRESH"); });
test("plan exact-fresh-state semantic mutation fails its exact named contract", () => { const original = readFileSync(sourcePath, "utf8"), mutated = original.replace("isOmensPackLocalPoolDrawStateFreshForPlanInitialization(tables, poolDrawState)", "Object.isFrozen(poolDrawState)"); assert.notEqual(mutated, original); runMutation(mutated, stateContract, stateMarker, "PLAN_STATE_MUST_BE_EXACTLY_FRESH"); });

const cursorContract = "pack collation plan cursor starts at zero", cursorMarker = "PACK_COLLATION_PLAN_CURSOR_CONTRACT_EXECUTED";
test(cursorContract, async () => { console.log(cursorMarker); const { plan, capabilities } = await mutationModules(), result = plan.initializeOmensPackCollationPlanFromOneUnsigned32Sample(capabilities.tables, 0); assert.equal(plan.readOmensPackCollationPlanNextPositionForTransition(result.plan), 0, "INITIAL_CURSOR_MUST_BE_ZERO"); });
test("plan cursor semantic mutation fails its exact named contract", () => { const original = readFileSync(sourcePath, "utf8"), mutated = original.replace("poolDrawState, nextPosition: 0", "poolDrawState, nextPosition: 1"); assert.notEqual(mutated, original); runMutation(mutated, cursorContract, cursorMarker, "INITIAL_CURSOR_MUST_BE_ZERO"); });

const validationCases = Object.freeze([
  Object.freeze({ name: "plan ownership validation precedes pool initialization", marker: "PLAN_OWNERSHIP_PREINITIALIZATION_CONTRACT_EXECUTED", failure: "INVALID_LAYOUT_OWNERSHIP_MUST_PRECEDE_INITIALIZATION", layout: (capabilities, foreign) => foreign.tables.layoutChoices[0].layoutReference }),
  Object.freeze({ name: "plan pool-reference validation precedes pool initialization", marker: "PLAN_POOL_REFERENCE_PREINITIALIZATION_CONTRACT_EXECUTED", failure: "FOREIGN_POOL_REFERENCE_MUST_PRECEDE_INITIALIZATION", layout: (capabilities, foreign) => copiedLayoutWith(capabilities.tables.layoutChoices[0].layoutReference, (position, index) => index === 0 ? { ...position, resolvedPool: foreign.tables.poolTables[0].poolReference } : position) }),
  Object.freeze({ name: "plan role-position validation precedes pool initialization", marker: "PLAN_ROLE_POSITION_PREINITIALIZATION_CONTRACT_EXECUTED", failure: "ROLE_INCOHERENCE_MUST_PRECEDE_INITIALIZATION", layout: (capabilities) => copiedLayoutWith(capabilities.tables.layoutChoices[0].layoutReference, (position, index) => index === 0 ? { ...position, recipeStructuralRole: "fixed-rare" } : position) }),
  Object.freeze({ name: "plan pool-capacity validation precedes pool initialization", marker: "PLAN_POOL_CAPACITY_PREINITIALIZATION_CONTRACT_EXECUTED", failure: "INSUFFICIENT_POOL_CAPACITY_MUST_PRECEDE_INITIALIZATION", layout: (capabilities) => { const pool = capabilities.tables.poolTables.find((table) => table.officialIdentityChoices.length === 1).poolReference; return copiedLayoutWith(capabilities.tables.layoutChoices[0].layoutReference, (position, index) => index < 3 ? { ...position, resolvedPool: pool } : position); } })
]);
for (const contract of validationCases) {
  test(contract.name, async () => { console.log(contract.marker); const { plan, capabilities } = await mutationModules(), foreign = fictionalCollationCapabilities(); let initialized = 0; assert.throws(() => plan.initializeOmensPackCollationPlanFromOneUnsigned32SampleForTest(capabilities.tables, 0, () => ({ state: "selected", layoutReference: contract.layout(capabilities, foreign) }), () => { initialized++; return initializeOmensPackLocalPoolDrawState(capabilities.tables); })); assert.equal(initialized, 0, contract.failure); });
  test(`${contract.name} semantic mutation fails its exact named contract`, () => { const original = readFileSync(sourcePath, "utf8"), mutated = original.replace("  validateSelectedPlan(tables, selection.layoutReference);\n", ""); assert.notEqual(mutated, original); runMutation(mutated, contract.name, contract.marker, contract.failure); });
}

test("plan mutation snapshots are file-local OS-temp canonical copies and always clean", () => { let snapshot; withCanonicalSnapshot((directory) => { snapshot = directory; assert.ok(directory.startsWith(tmpdir())); assert.equal(directory.startsWith(`${resolvePath(fileURLToPath(new URL("../../..", import.meta.url)))}${sep}`), false); }); assert.equal(existsSync(snapshot), false); let failed; assert.throws(() => withCanonicalSnapshot((directory) => { failed = directory; throw new Error("body"); })); assert.equal(existsSync(failed), false); });
