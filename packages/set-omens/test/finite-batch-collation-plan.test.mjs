import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END, mapUnsigned32SampleBatchToBoundedTicket } from "@draft-table/engine";
import { fictionalCollationCapabilities } from "./fictional-collation-capabilities.mjs";
import { initializeOmensPackCollationPlanFromUnsigned32SampleBatch, OmensPackCollationPlanInitializationError, readOmensPackCollationPlanLayoutForTransition, readOmensPackCollationPlanNextPositionForTransition, readOmensPackCollationPlanPoolDrawStateForTransition } from "../src/schema-validation.ts";
import { selectOmensCollationLayoutByTicket } from "../src/collation-weight-ticket-selection.ts";

const cutoff = (bound) => UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END % bound;
const safe = (action) => assert.throws(action, (error) => {
  assert.ok(error instanceof OmensPackCollationPlanInitializationError);
  assert.equal(error.code, "OMENS_PACK_COLLATION_PLAN_INITIALIZATION_FAILED");
  assert.equal(error.message, "Omens pack collation plan initialization failed.");
  assert.equal(error.stack, "OmensPackCollationPlanInitializationError: Omens pack collation plan initialization failed.");
  return true;
});
const assertPools = (tables, state) => {
  assert.equal(state.poolStates.length, 11);
  for (let index = 0; index < 11; index++) {
    const actual = state.poolStates[index], expected = tables.poolTables[index];
    assert.equal(actual.poolReference, expected.poolReference);
    assert.equal(actual.poolTotalWeight, expected.poolTotalWeight);
    assert.equal(actual.officialIdentityChoices.length, expected.officialIdentityChoices.length);
    for (let entry = 0; entry < actual.officialIdentityChoices.length; entry++) {
      assert.equal(actual.officialIdentityChoices[entry].officialIdentityReference, expected.officialIdentityChoices[entry].officialIdentityReference);
      assert.equal(actual.officialIdentityChoices[entry].weight, expected.officialIdentityChoices[entry].weight);
      assert.equal(actual.officialIdentityChoices[entry].cumulativeExclusiveEnd, expected.officialIdentityChoices[entry].cumulativeExclusiveEnd);
    }
  }
};

const selected = (tables, samples) => {
  const result = initializeOmensPackCollationPlanFromUnsigned32SampleBatch(tables, samples);
  assert.equal(result.state, "selected");
  return result;
};

test("finite batches need more samples or initialize exact first middle last layout-bound fresh plans", () => {
  const { tables, resolvedLayouts } = fictionalCollationCapabilities(), retry = cutoff(tables.layoutTotalWeight);
  assert.deepEqual(initializeOmensPackCollationPlanFromUnsigned32SampleBatch(tables, []), { state: "needs-sample", consumedSamples: 0 });
  assert.deepEqual(initializeOmensPackCollationPlanFromUnsigned32SampleBatch(tables, [retry]), { state: "needs-sample", consumedSamples: 1 });
  assert.deepEqual(initializeOmensPackCollationPlanFromUnsigned32SampleBatch(tables, [retry, retry]), { state: "needs-sample", consumedSamples: 2 });
  for (const [samples, expectedIndex, consumed] of [
    [[retry, 0], 0, 2],
    [[retry, tables.layoutChoices[113].cumulativeExclusiveEnd], 114, 2],
    [[retry, tables.layoutChoices[227].cumulativeExclusiveEnd - 1], 227, 2],
    [[0, 1, retry], 0, 1]
  ]) {
    const result = selected(tables, samples), state = readOmensPackCollationPlanPoolDrawStateForTransition(result.plan);
    assert.equal(result.consumedSamples, consumed);
    assert.equal(result.layoutReference, resolvedLayouts.layouts[expectedIndex]);
    assert.equal(readOmensPackCollationPlanLayoutForTransition(result.plan), result.layoutReference);
    assert.equal(readOmensPackCollationPlanNextPositionForTransition(result.plan), 0);
    assertPools(tables, state);
    assert.ok(Object.isFrozen(result));
  }
});

test("every small fictional finite batch outcome equals public engine mapping followed by ticket lookup and fresh-plan oracle", () => {
  const { tables } = fictionalCollationCapabilities(), retry = cutoff(tables.layoutTotalWeight), acceptedRepresentatives = tables.layoutChoices.flatMap((choice, index) => [index === 0 ? 0 : tables.layoutChoices[index - 1].cumulativeExclusiveEnd, choice.cumulativeExclusiveEnd - 1]), batches = [[], [retry], [retry, retry], ...acceptedRepresentatives.flatMap((sample) => [[sample], [retry, sample], [retry, retry, sample], [sample, retry]])];
  for (const samples of batches) {
    const mapped = mapUnsigned32SampleBatchToBoundedTicket(samples, tables.layoutTotalWeight);
    const actual = initializeOmensPackCollationPlanFromUnsigned32SampleBatch(tables, samples);
    assert.equal(actual.consumedSamples, mapped.consumedSamples);
    if (mapped.state === "needs-sample") {
      assert.deepEqual(actual, { state: "needs-sample", consumedSamples: mapped.consumedSamples });
      continue;
    }
    assert.equal(actual.state, "selected");
    assert.equal(actual.layoutReference, selectOmensCollationLayoutByTicket(tables, mapped.ticket));
    assert.equal(readOmensPackCollationPlanLayoutForTransition(actual.plan), actual.layoutReference);
    assert.equal(readOmensPackCollationPlanNextPositionForTransition(actual.plan), 0);
    assertPools(tables, readOmensPackCollationPlanPoolDrawStateForTransition(actual.plan));
  }
});

test("selected finite batches create independent plans without mutating their compiled capability", () => {
  const { tables } = fictionalCollationCapabilities(), before = structuredClone(tables);
  const first = selected(tables, [0]), second = selected(tables, [0]);
  assert.notEqual(first.plan, second.plan);
  assert.notEqual(readOmensPackCollationPlanPoolDrawStateForTransition(first.plan), readOmensPackCollationPlanPoolDrawStateForTransition(second.plan));
  assert.deepEqual(tables, before);
});

test("finite batch initialization rejects copied foreign invalid extra and hostile inputs without partial state", () => {
  const first = fictionalCollationCapabilities(), before = structuredClone(first.tables);
  for (const samples of [[-1], [0.5], [NaN], [Infinity], [UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END], [0, -1], "0", null, undefined]) safe(() => initializeOmensPackCollationPlanFromUnsigned32SampleBatch(first.tables, samples));
  safe(() => initializeOmensPackCollationPlanFromUnsigned32SampleBatch());
  safe(() => initializeOmensPackCollationPlanFromUnsigned32SampleBatch(first.tables, [], "extra"));
  safe(() => initializeOmensPackCollationPlanFromUnsigned32SampleBatch(structuredClone(first.tables), []));
  const originalFreeze = Object.freeze, originalIsFrozen = Object.isFrozen;
  let hostileResult;
  try {
    const samples = new Proxy([0], { get(target, property, receiver) { if (property === "0") { Object.freeze = (value) => value; Object.isFrozen = () => true; } return Reflect.get(target, property, receiver); } });
    hostileResult = selected(first.tables, samples);
    assert.equal(Object.getOwnPropertyDescriptor(hostileResult, "state").writable, false);
  } finally { Object.freeze = originalFreeze; Object.isFrozen = originalIsFrozen; }
  assert.ok(Object.isFrozen(hostileResult.plan));
  assert.ok(Object.isFrozen(readOmensPackCollationPlanPoolDrawStateForTransition(hostileResult.plan)));
  assert.deepEqual(first.tables, before);
});

const hostileIntrinsicCases = [
  ["Object.defineProperty", Object, "defineProperty"],
  ["Object.freeze", Object, "freeze"],
  ["Object.isFrozen", Object, "isFrozen"],
  ["Object.getOwnPropertyDescriptor", Object, "getOwnPropertyDescriptor"],
  ["Reflect.ownKeys", Reflect, "ownKeys"],
  ["Number.isFinite", Number, "isFinite"],
  ["Number.isSafeInteger", Number, "isSafeInteger"],
  ["Math.floor", Math, "floor"],
  ["Array.isArray", Array, "isArray"],
  ["Array.prototype.some", Array.prototype, "some"],
  ["Array.prototype.find", Array.prototype, "find"],
  ["Array.prototype.every", Array.prototype, "every"],
  ["Array.prototype.map", Array.prototype, "map"],
  ["Map.prototype.get", Map.prototype, "get"],
  ["Map.prototype.set", Map.prototype, "set"],
  ["WeakSet.prototype.has", WeakSet.prototype, "has"],
  ["WeakSet.prototype.add", WeakSet.prototype, "add"],
  ["WeakMap.prototype.get", WeakMap.prototype, "get"],
  ["WeakMap.prototype.set", WeakMap.prototype, "set"],
  ["Set.prototype.has", Set.prototype, "has"],
  ["Set.prototype.add", Set.prototype, "add"],
  ["global Map constructor", globalThis, "Map"],
  ["global Set constructor", globalThis, "Set"]
];
for (const [label, owner, property] of hostileIntrinsicCases) {
  test(`finite batch captures ${label} before a hostile sample getter`, () => {
    const { tables } = fictionalCollationCapabilities(), original = owner[property];
    let result;
    try {
      const samples = [0];
      Object.defineProperty(samples, 0, { configurable: true, enumerable: true, get() { owner[property] = () => { throw new Error(`poisoned ${label}`); }; return 0; } });
      result = initializeOmensPackCollationPlanFromUnsigned32SampleBatch(tables, samples);
    } finally { owner[property] = original; }
    assert.equal(result.state, "selected");
    assert.equal(result.layoutReference, tables.layoutChoices[0].layoutReference);
    assert.equal(readOmensPackCollationPlanNextPositionForTransition(result.plan), 0);
  });
}

const mutationModuleKey = "DRAFT_TABLE_TEST_FINITE_BATCH_PLAN_MODULE";
const sourcePath = new URL("../src/finite-batch-collation-plan.ts", import.meta.url);
const exactPattern = (name) => `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
const needMoreContract = "finite batch plan need-more cannot initialize", needMoreMarker = "FINITE_BATCH_PLAN_NEED_MORE_CONTRACT_EXECUTED";
test(needMoreContract, async () => { console.log(needMoreMarker); const moduleUrl = process.env[mutationModuleKey] ?? sourcePath.href, directory = new URL("./", moduleUrl), [plan, custom, eligibility, layouts, upstream, pools, identity, layoutResolution, poolResolution, compiler] = await Promise.all([import(moduleUrl), import(new URL("custom-cards.ts", directory)), import(new URL("draft-eligibility-classification.ts", directory)), import(new URL("layouts.ts", directory)), import(new URL("official-upstream-id-reconciliation.ts", directory)), import(new URL("pools.ts", directory)), import(new URL("recipe-official-identity-reconciliation.ts", directory)), import(new URL("recipe-layout-pool-resolution.ts", directory)), import(new URL("recipe-pool-identity-resolution.ts", directory)), import(new URL("collation-weight-tables.ts", directory))]), capabilities = fictionalCollationCapabilities({ ...custom, ...eligibility, ...layouts, ...upstream, ...pools, ...identity, ...layoutResolution, ...poolResolution, ...compiler }), retry = cutoff(capabilities.tables.layoutTotalWeight), result = plan.initializeOmensPackCollationPlanFromUnsigned32SampleBatch(capabilities.tables, [retry]); assert.equal(result.state, "needs-sample", "NEED_MORE_MUST_NOT_INITIALIZE"); });
test("finite batch need-more semantic mutation fails its exact named contract", () => {
  const anchor = 'if (mapping.state === "needs-sample") return needsSample(mapping.consumedSamples);', original = readFileSync(sourcePath, "utf8"), mutated = original.replace(anchor, 'if (mapping.state === "needs-sample") return selected(mapping.consumedSamples, selectLayout(tables, 0), registerOmensPackCollationPlanForExactSelectedLayout(tables, selectLayout(tables, 0)));');
  assert.equal(original.split(anchor).length - 1, 1); assert.notEqual(mutated, original);
  let directory; try { directory = mkdtempSync(join(tmpdir(), "draft-table-finite-batch-plan-need-more-")); const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url)); for (const file of readdirSync(sourceDirectory).filter((file) => file.endsWith(".ts"))) copyFileSync(join(sourceDirectory, file), join(directory, file)); symlinkSync(join(sourceDirectory, "../../../node_modules"), join(directory, "node_modules"), "dir"); writeFileSync(join(directory, "finite-batch-collation-plan.ts"), mutated); writeFileSync(join(directory, "tsconfig.json"), '{"compilerOptions":{"target":"ES2022","module":"ES2022","moduleResolution":"bundler","strict":true,"noEmit":true,"allowImportingTsExtensions":true},"include":["*.ts"]}'); const typecheck = spawnSync(join(directory, "node_modules", ".bin", "tsc"), ["-p", join(directory, "tsconfig.json")], { encoding: "utf8" }); assert.equal(typecheck.status, 0, `${typecheck.stdout}\n${typecheck.stderr}`); const environment = { ...process.env, [mutationModuleKey]: pathToFileURL(join(directory, "finite-batch-collation-plan.ts")).href }; delete environment.NODE_TEST_CONTEXT; const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--test-name-pattern", exactPattern(needMoreContract), fileURLToPath(import.meta.url)], { encoding: "utf8", env: environment }), lines = result.stdout.split(/\r?\n/u); assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`); assert.equal(lines.filter((line) => line === `# ${needMoreMarker}`).length, 1); assert.equal(lines.filter((line) => /^not ok \d+ - /u.test(line) && line.includes(needMoreContract)).length, 1); assert.equal(lines.filter((line) => line.includes("NEED_MORE_MUST_NOT_INITIALIZE")).length, 1); } finally { if (directory !== undefined) rmSync(directory, { recursive: true, force: true }); }
});

const ticketContract = "finite batch plan passes the accepted ticket unchanged to layout lookup", ticketMarker = "FINITE_BATCH_PLAN_TICKET_CONTRACT_EXECUTED";
test(ticketContract, async () => { console.log(ticketMarker); const moduleUrl = process.env[mutationModuleKey] ?? sourcePath.href, directory = new URL("./", moduleUrl), [plan, custom, eligibility, layouts, upstream, pools, identity, layoutResolution, poolResolution, compiler] = await Promise.all([import(moduleUrl), import(new URL("custom-cards.ts", directory)), import(new URL("draft-eligibility-classification.ts", directory)), import(new URL("layouts.ts", directory)), import(new URL("official-upstream-id-reconciliation.ts", directory)), import(new URL("pools.ts", directory)), import(new URL("recipe-official-identity-reconciliation.ts", directory)), import(new URL("recipe-layout-pool-resolution.ts", directory)), import(new URL("recipe-pool-identity-resolution.ts", directory)), import(new URL("collation-weight-tables.ts", directory))]), capabilities = fictionalCollationCapabilities({ ...custom, ...eligibility, ...layouts, ...upstream, ...pools, ...identity, ...layoutResolution, ...poolResolution, ...compiler }), result = plan.initializeOmensPackCollationPlanFromUnsigned32SampleBatch(capabilities.tables, [capabilities.tables.layoutChoices[113].cumulativeExclusiveEnd - 1]); assert.equal(result.state, "selected"); assert.equal(result.layoutReference, capabilities.tables.layoutChoices[113].layoutReference, "ACCEPTED_TICKET_MUST_REACH_LOOKUP_UNCHANGED"); });
test("finite batch accepted-ticket semantic mutation fails its exact named contract", () => {
  const anchor = "const layoutReference = selectLayout(tables, mapping.ticket);", original = readFileSync(sourcePath, "utf8"), mutated = original.replace(anchor, "const layoutReference = selectLayout(tables, mapping.ticket + 1);");
  assert.equal(original.split(anchor).length - 1, 1); assert.notEqual(mutated, original);
  let directory; try { directory = mkdtempSync(join(tmpdir(), "draft-table-finite-batch-plan-ticket-")); const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url)); for (const file of readdirSync(sourceDirectory).filter((file) => file.endsWith(".ts"))) copyFileSync(join(sourceDirectory, file), join(directory, file)); symlinkSync(join(sourceDirectory, "../../../node_modules"), join(directory, "node_modules"), "dir"); writeFileSync(join(directory, "finite-batch-collation-plan.ts"), mutated); writeFileSync(join(directory, "tsconfig.json"), '{"compilerOptions":{"target":"ES2022","module":"ES2022","moduleResolution":"bundler","strict":true,"noEmit":true,"allowImportingTsExtensions":true},"include":["*.ts"]}'); const typecheck = spawnSync(join(directory, "node_modules", ".bin", "tsc"), ["-p", join(directory, "tsconfig.json")], { encoding: "utf8" }); assert.equal(typecheck.status, 0, `${typecheck.stdout}\n${typecheck.stderr}`); const environment = { ...process.env, [mutationModuleKey]: pathToFileURL(join(directory, "finite-batch-collation-plan.ts")).href }; delete environment.NODE_TEST_CONTEXT; const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--test-name-pattern", exactPattern(ticketContract), fileURLToPath(import.meta.url)], { encoding: "utf8", env: environment }), lines = result.stdout.split(/\r?\n/u); assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`); assert.equal(lines.filter((line) => line === `# ${ticketMarker}`).length, 1); assert.equal(lines.filter((line) => /^not ok \d+ - /u.test(line) && line.includes(ticketContract)).length, 1); assert.equal(lines.filter((line) => line.includes("ACCEPTED_TICKET_MUST_REACH_LOOKUP_UNCHANGED")).length, 1); } finally { if (directory !== undefined) rmSync(directory, { recursive: true, force: true }); }
});

const consumedContract = "finite batch plan preserves engine consumed sample count", consumedMarker = "FINITE_BATCH_PLAN_CONSUMED_CONTRACT_EXECUTED";
test(consumedContract, async () => { console.log(consumedMarker); const moduleUrl = process.env[mutationModuleKey] ?? sourcePath.href, directory = new URL("./", moduleUrl), [plan, custom, eligibility, layouts, upstream, pools, identity, layoutResolution, poolResolution, compiler] = await Promise.all([import(moduleUrl), import(new URL("custom-cards.ts", directory)), import(new URL("draft-eligibility-classification.ts", directory)), import(new URL("layouts.ts", directory)), import(new URL("official-upstream-id-reconciliation.ts", directory)), import(new URL("pools.ts", directory)), import(new URL("recipe-official-identity-reconciliation.ts", directory)), import(new URL("recipe-layout-pool-resolution.ts", directory)), import(new URL("recipe-pool-identity-resolution.ts", directory)), import(new URL("collation-weight-tables.ts", directory))]), capabilities = fictionalCollationCapabilities({ ...custom, ...eligibility, ...layouts, ...upstream, ...pools, ...identity, ...layoutResolution, ...poolResolution, ...compiler }), retry = cutoff(capabilities.tables.layoutTotalWeight), result = plan.initializeOmensPackCollationPlanFromUnsigned32SampleBatch(capabilities.tables, [retry, 0]); assert.equal(result.consumedSamples, 2, "ENGINE_CONSUMED_SAMPLES_MUST_BE_PRESERVED"); });
test("finite batch consumed-count semantic mutation fails its exact named contract", () => {
  const anchor = "return selected(mapping.consumedSamples, layoutReference, plan);", original = readFileSync(sourcePath, "utf8"), mutated = original.replace(anchor, "return selected(0, layoutReference, plan);");
  assert.equal(original.split(anchor).length - 1, 1); assert.notEqual(mutated, original);
  let directory; try { directory = mkdtempSync(join(tmpdir(), "draft-table-finite-batch-plan-consumed-")); const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url)); for (const file of readdirSync(sourceDirectory).filter((file) => file.endsWith(".ts"))) copyFileSync(join(sourceDirectory, file), join(directory, file)); symlinkSync(join(sourceDirectory, "../../../node_modules"), join(directory, "node_modules"), "dir"); writeFileSync(join(directory, "finite-batch-collation-plan.ts"), mutated); writeFileSync(join(directory, "tsconfig.json"), '{"compilerOptions":{"target":"ES2022","module":"ES2022","moduleResolution":"bundler","strict":true,"noEmit":true,"allowImportingTsExtensions":true},"include":["*.ts"]}'); const typecheck = spawnSync(join(directory, "node_modules", ".bin", "tsc"), ["-p", join(directory, "tsconfig.json")], { encoding: "utf8" }); assert.equal(typecheck.status, 0, `${typecheck.stdout}\n${typecheck.stderr}`); const environment = { ...process.env, [mutationModuleKey]: pathToFileURL(join(directory, "finite-batch-collation-plan.ts")).href }; delete environment.NODE_TEST_CONTEXT; const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--test-name-pattern", exactPattern(consumedContract), fileURLToPath(import.meta.url)], { encoding: "utf8", env: environment }), lines = result.stdout.split(/\r?\n/u); assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`); assert.equal(lines.filter((line) => line === `# ${consumedMarker}`).length, 1); assert.equal(lines.filter((line) => /^not ok \d+ - /u.test(line) && line.includes(consumedContract)).length, 1); assert.equal(lines.filter((line) => line.includes("ENGINE_CONSUMED_SAMPLES_MUST_BE_PRESERVED")).length, 1); } finally { if (directory !== undefined) rmSync(directory, { recursive: true, force: true }); }
});

const bindingContract = "finite batch plan binds the exact selected layout from the same capability", bindingMarker = "FINITE_BATCH_PLAN_BINDING_CONTRACT_EXECUTED";
test(bindingContract, async () => { console.log(bindingMarker); const moduleUrl = process.env[mutationModuleKey] ?? sourcePath.href, directory = new URL("./", moduleUrl), [plan, custom, eligibility, layouts, upstream, pools, identity, layoutResolution, poolResolution, compiler] = await Promise.all([import(moduleUrl), import(new URL("custom-cards.ts", directory)), import(new URL("draft-eligibility-classification.ts", directory)), import(new URL("layouts.ts", directory)), import(new URL("official-upstream-id-reconciliation.ts", directory)), import(new URL("pools.ts", directory)), import(new URL("recipe-official-identity-reconciliation.ts", directory)), import(new URL("recipe-layout-pool-resolution.ts", directory)), import(new URL("recipe-pool-identity-resolution.ts", directory)), import(new URL("collation-weight-tables.ts", directory))]), capabilities = fictionalCollationCapabilities({ ...custom, ...eligibility, ...layouts, ...upstream, ...pools, ...identity, ...layoutResolution, ...poolResolution, ...compiler }), packPlan = await import(new URL("pack-collation-plan.ts", directory)), result = plan.initializeOmensPackCollationPlanFromUnsigned32SampleBatch(capabilities.tables, [0]); assert.equal(result.state, "selected"); assert.equal(packPlan.readOmensPackCollationPlanLayoutForTransition(result.plan), result.layoutReference, "PLAN_MUST_BIND_EXACT_SELECTED_CAPABILITY_LAYOUT"); });
test("finite batch selected-plan binding semantic mutation fails its exact named contract", () => {
  const anchor = "const plan = registerOmensPackCollationPlanForExactSelectedLayout(tables, layoutReference);", original = readFileSync(sourcePath, "utf8"), mutated = original.replace(anchor, "const plan = registerOmensPackCollationPlanForExactSelectedLayout(tables, tables.layoutChoices[1].layoutReference);");
  assert.equal(original.split(anchor).length - 1, 1); assert.notEqual(mutated, original);
  let directory; try { directory = mkdtempSync(join(tmpdir(), "draft-table-finite-batch-plan-binding-")); const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url)); for (const file of readdirSync(sourceDirectory).filter((file) => file.endsWith(".ts"))) copyFileSync(join(sourceDirectory, file), join(directory, file)); symlinkSync(join(sourceDirectory, "../../../node_modules"), join(directory, "node_modules"), "dir"); writeFileSync(join(directory, "finite-batch-collation-plan.ts"), mutated); writeFileSync(join(directory, "tsconfig.json"), '{"compilerOptions":{"target":"ES2022","module":"ES2022","moduleResolution":"bundler","strict":true,"noEmit":true,"allowImportingTsExtensions":true},"include":["*.ts"]}'); const typecheck = spawnSync(join(directory, "node_modules", ".bin", "tsc"), ["-p", join(directory, "tsconfig.json")], { encoding: "utf8" }); assert.equal(typecheck.status, 0, `${typecheck.stdout}\n${typecheck.stderr}`); const environment = { ...process.env, [mutationModuleKey]: pathToFileURL(join(directory, "finite-batch-collation-plan.ts")).href }; delete environment.NODE_TEST_CONTEXT; const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--test-name-pattern", exactPattern(bindingContract), fileURLToPath(import.meta.url)], { encoding: "utf8", env: environment }), lines = result.stdout.split(/\r?\n/u); assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`); assert.equal(lines.filter((line) => line === `# ${bindingMarker}`).length, 1); assert.equal(lines.filter((line) => /^not ok \d+ - /u.test(line) && line.includes(bindingContract)).length, 1); assert.equal(lines.filter((line) => line.includes("PLAN_MUST_BIND_EXACT_SELECTED_CAPABILITY_LAYOUT")).length, 1); } finally { if (directory !== undefined) rmSync(directory, { recursive: true, force: true }); }
});
