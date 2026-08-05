import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END } from "@draft-table/engine";
import { fictionalCollationCapabilities } from "./fictional-collation-capabilities.mjs";
import {
  initializeOmensPackCollationPlanFromUnsigned32SampleBatch,
  readOmensPackCollationPlanNextPositionForTransition,
  readOmensPackCollationPlanPoolDrawStateForTransition,
  transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatch
} from "../src/schema-validation.ts";
import {
  OmensPackConstructionError,
  constructOmensPackFromInitializedPlanAndUnsigned32SampleBatches,
  continueOmensPackConstructionFromUnsigned32SampleBatches
} from "../src/pack-construction.ts";

const freshPlan = (tables, layoutTicket = 0) => {
  const initialized = initializeOmensPackCollationPlanFromUnsigned32SampleBatch(tables, [layoutTicket]);
  assert.equal(initialized.state, "selected");
  return initialized;
};
const cutoff = (bound) => UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END % bound;
const safe = (action) => assert.throws(action, (error) => {
  assert.ok(error instanceof OmensPackConstructionError);
  assert.equal(error.name, "OmensPackConstructionError");
  assert.equal(error.code, "OMENS_PACK_CONSTRUCTION_FAILED");
  assert.equal(error.message, "Omens pack construction failed.");
  assert.equal(error.stack, "OmensPackConstructionError: Omens pack construction failed.");
  assert.deepEqual(JSON.parse(JSON.stringify(error)), {
    name: "OmensPackConstructionError",
    code: "OMENS_PACK_CONSTRUCTION_FAILED"
  });
  assert.doesNotMatch(`${error.message}${error.stack}${JSON.stringify(error)}`, /Fictional|OMN|IAR|https?:|\\|\//iu);
  return true;
});
const assertOwnFrozenData = (value) => {
  assert.ok(Object.isFrozen(value));
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    assert.equal(descriptor.enumerable, true);
    assert.equal(descriptor.configurable, false);
    assert.equal(descriptor.writable, false);
  }
};
const complete = (plan, batches = Array.from({ length: 14 }, () => [0])) => {
  const result = constructOmensPackFromInitializedPlanAndUnsigned32SampleBatches(plan, batches);
  assert.equal(result.state, "complete");
  return result;
};

// RED contract: this file intentionally precedes the production pack constructor.
test("fourteen accepted batches emit one terminal immutable exact source-order pack and no card earlier", () => {
  const { tables } = fictionalCollationCapabilities(), initialized = freshPlan(tables);
  const early = constructOmensPackFromInitializedPlanAndUnsigned32SampleBatches(initialized.plan, Array.from({ length: 13 }, () => [0]));
  assert.equal(early.state, "needs-samples");
  assert.equal(Object.hasOwn(early, "pack"), false);
  assert.equal(early.selectedPositionCount, 13);
  assert.deepEqual(Object.keys(early), ["state", "consumedBatches", "consumedSamples", "totalConsumedBatches", "totalConsumedSamples", "selectedPositionCount", "continuation"]);
  assertOwnFrozenData(early);
  assertOwnFrozenData(early.continuation);

  const result = continueOmensPackConstructionFromUnsigned32SampleBatches(early.continuation, [[0], [1], [2]]);
  assert.equal(result.state, "complete");
  assert.equal(result.consumedBatches, 1);
  assert.equal(result.consumedSamples, 1);
  assert.equal(result.totalConsumedBatches, 14);
  assert.equal(result.totalConsumedSamples, 14);
  assert.deepEqual(Object.keys(result), ["state", "consumedBatches", "consumedSamples", "totalConsumedBatches", "totalConsumedSamples", "pack"]);
  assert.equal(Object.hasOwn(result, "continuation"), false);
  assertOwnFrozenData(result);
  assertOwnFrozenData(result.pack);
  assert.ok(Object.isFrozen(result.pack.positions));
  assert.equal(result.pack.positions.length, 14);
  assert.equal(result.pack.layoutReference, initialized.layoutReference);
  for (let index = 0; index < 14; index++) {
    const position = result.pack.positions[index];
    assertOwnFrozenData(position);
    assert.equal(position.positionReference, initialized.layoutReference.slots[index]);
    assert.ok(position.positionReference.resolvedPool.entries.some((entry) => entry.officialIdentity === position.officialIdentityReference));
  }
  assert.equal(readOmensPackCollationPlanNextPositionForTransition(result.pack.terminalPlan), 14);
  assert.throws(() => transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatch(result.pack.terminalPlan, []), { code: "OMENS_PACK_COLLATION_PLAN_POSITION_TRANSITION_FAILED" });
  safe(() => constructOmensPackFromInitializedPlanAndUnsigned32SampleBatches(result.pack.terminalPlan, []));
});

test("empty retry and accepted batches preserve the same position and exact per-call plus cumulative accounting", () => {
  const { tables } = fictionalCollationCapabilities(), initialized = freshPlan(tables), originalState = readOmensPackCollationPlanPoolDrawStateForTransition(initialized.plan), firstPool = originalState.poolStates.find((pool) => pool.poolReference === initialized.layoutReference.slots[0].resolvedPool), retry = cutoff(firstPool.poolTotalWeight);
  assert.ok(retry < UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END);
  const first = constructOmensPackFromInitializedPlanAndUnsigned32SampleBatches(initialized.plan, [[], [retry], [retry, 0]]);
  assert.equal(first.state, "needs-samples");
  assert.equal(first.consumedBatches, 3);
  assert.equal(first.consumedSamples, 3);
  assert.equal(first.totalConsumedBatches, 3);
  assert.equal(first.totalConsumedSamples, 3);
  assert.equal(first.selectedPositionCount, 1);
  assert.equal(readOmensPackCollationPlanNextPositionForTransition(initialized.plan), 0);
  assert.equal(readOmensPackCollationPlanPoolDrawStateForTransition(initialized.plan), originalState);

  const zero = continueOmensPackConstructionFromUnsigned32SampleBatches(first.continuation, []);
  assert.equal(zero.state, "needs-samples");
  assert.equal(zero.consumedBatches, 0);
  assert.equal(zero.consumedSamples, 0);
  assert.equal(zero.totalConsumedBatches, 3);
  assert.equal(zero.totalConsumedSamples, 3);
  assert.equal(zero.selectedPositionCount, 1);
  assert.notEqual(zero.continuation, first.continuation);

  const finished = continueOmensPackConstructionFromUnsigned32SampleBatches(zero.continuation, Array.from({ length: 13 }, () => [0, 1]));
  assert.equal(finished.state, "complete");
  assert.equal(finished.consumedBatches, 13);
  assert.equal(finished.consumedSamples, 13);
  assert.equal(finished.totalConsumedBatches, 16);
  assert.equal(finished.totalConsumedSamples, 16);
  assert.equal(finished.pack.positions.length, 14);
  assert.equal(first.selectedPositionCount, 1, "historical need-more result remains unchanged");
});

test("the legal normal and rainbow-foil pair with the same official identity is preserved without dedupe or redraw", () => {
  const { tables } = fictionalCollationCapabilities(), initialized = freshPlan(tables, 0), result = complete(initialized.plan);
  const normal = result.pack.positions[0], rainbowFoil = result.pack.positions[13];
  assert.equal(normal.positionReference.recipeStructuralRole, "common-rarity");
  assert.equal(rainbowFoil.positionReference.recipeStructuralRole, "rainbow-foil");
  assert.deepEqual(normal.officialIdentityReference, rainbowFoil.officialIdentityReference);
  assert.notEqual(normal.officialIdentityReference, rainbowFoil.officialIdentityReference, "each exact source pool retains its own capability reference");
  assert.equal(result.pack.positions.filter((entry) => entry.officialIdentityReference.baseCollectorId === normal.officialIdentityReference.baseCollectorId && entry.officialIdentityReference.cardUniqueId === normal.officialIdentityReference.cardUniqueId).length, 2);
  assert.equal(result.pack.positions.length, 14);
});

test("same-pool no replacement remains visible while independent plans and continuation branches stay fresh", () => {
  const { tables } = fictionalCollationCapabilities(), firstInitialized = freshPlan(tables), secondInitialized = freshPlan(tables);
  const first = complete(firstInitialized.plan), second = complete(secondInitialized.plan);
  assert.notEqual(first.pack, second.pack);
  assert.notEqual(first.pack.positions, second.pack.positions);
  assert.notEqual(first.pack.terminalPlan, second.pack.terminalPlan);
  assert.deepEqual(first.pack.positions.map((entry) => entry.officialIdentityReference), second.pack.positions.map((entry) => entry.officialIdentityReference));
  assert.equal(new Set(first.pack.positions.slice(0, 3).map((entry) => entry.officialIdentityReference.cardUniqueId)).size, 3);

  const partial = constructOmensPackFromInitializedPlanAndUnsigned32SampleBatches(freshPlan(tables).plan, [[0]]);
  assert.equal(partial.state, "needs-samples");
  const branchA = continueOmensPackConstructionFromUnsigned32SampleBatches(partial.continuation, Array.from({ length: 13 }, () => [0]));
  const branchB = continueOmensPackConstructionFromUnsigned32SampleBatches(partial.continuation, Array.from({ length: 13 }, () => [0]));
  assert.equal(branchA.state, "complete"); assert.equal(branchB.state, "complete");
  assert.notEqual(branchA.pack, branchB.pack);
  assert.notEqual(branchA.pack.terminalPlan, branchB.pack.terminalPlan);
  assert.deepEqual(branchA.pack.positions.map((entry) => entry.officialIdentityReference), branchB.pack.positions.map((entry) => entry.officialIdentityReference));
});

test("caller outer and nested finite batches are snapshotted exactly once and never reread", () => {
  const { tables } = fictionalCollationCapabilities(), initialized = freshPlan(tables);
  let outerLengthReads = 0, outerElementReads = 0, nestedLengthReads = 0, nestedElementReads = 0;
  const nested = new Proxy([0, 1], { get(target, property, receiver) {
    if (property === "length") nestedLengthReads++;
    if (property === "0" || property === "1") nestedElementReads++;
    return Reflect.get(target, property, receiver);
  } });
  const outer = new Proxy([nested], { get(target, property, receiver) {
    if (property === "length") outerLengthReads++;
    if (property === "0") outerElementReads++;
    return Reflect.get(target, property, receiver);
  } });
  const result = constructOmensPackFromInitializedPlanAndUnsigned32SampleBatches(initialized.plan, outer);
  assert.equal(result.state, "needs-samples");
  assert.equal(result.selectedPositionCount, 1);
  assert.equal(result.consumedSamples, 1);
  assert.equal(outerLengthReads, 1);
  assert.equal(outerElementReads, 1);
  assert.equal(nestedLengthReads, 1);
  assert.equal(nestedElementReads, 2);
});

test("malformed copied foreign partial terminal extra and abrupt inputs reject stably without changing prior plans", async () => {
  const first = fictionalCollationCapabilities(), second = fictionalCollationCapabilities(), initialized = freshPlan(first.tables), initialState = readOmensPackCollationPlanPoolDrawStateForTransition(initialized.plan);
  safe(() => constructOmensPackFromInitializedPlanAndUnsigned32SampleBatches());
  safe(() => constructOmensPackFromInitializedPlanAndUnsigned32SampleBatches(initialized.plan));
  safe(() => constructOmensPackFromInitializedPlanAndUnsigned32SampleBatches(initialized.plan, [], "extra"));
  safe(() => constructOmensPackFromInitializedPlanAndUnsigned32SampleBatches(Object.freeze({}), []));
  safe(() => constructOmensPackFromInitializedPlanAndUnsigned32SampleBatches(structuredClone(initialized.plan), []));
  for (const batches of [null, undefined, {}, "", new Uint32Array([0]), [new Uint32Array([0])], [[-1]], [[0.5]], [[NaN]], [[Infinity]], [[UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END]], [[0, -1]]]) safe(() => constructOmensPackFromInitializedPlanAndUnsigned32SampleBatches(initialized.plan, batches));
  safe(() => constructOmensPackFromInitializedPlanAndUnsigned32SampleBatches(initialized.plan, new Proxy([[0]], { get(target, property, receiver) { if (property === "0") throw new Error("abrupt outer element"); return Reflect.get(target, property, receiver); } })));
  safe(() => constructOmensPackFromInitializedPlanAndUnsigned32SampleBatches(initialized.plan, [new Proxy([0], { get(target, property, receiver) { if (property === "0") throw new Error("abrupt sample"); return Reflect.get(target, property, receiver); } })]));

  const partialPlan = transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatch(freshPlan(second.tables).plan, [0]);
  assert.equal(partialPlan.state, "selected");
  safe(() => constructOmensPackFromInitializedPlanAndUnsigned32SampleBatches(partialPlan.nextPlan, []));
  const done = complete(freshPlan(first.tables).plan);
  safe(() => continueOmensPackConstructionFromUnsigned32SampleBatches(done.pack, []));
  safe(() => continueOmensPackConstructionFromUnsigned32SampleBatches());
  safe(() => continueOmensPackConstructionFromUnsigned32SampleBatches(Object.freeze({}), []));
  const partial = constructOmensPackFromInitializedPlanAndUnsigned32SampleBatches(freshPlan(first.tables).plan, []);
  assert.equal(partial.state, "needs-samples");
  safe(() => continueOmensPackConstructionFromUnsigned32SampleBatches(structuredClone(partial.continuation), []));
  safe(() => continueOmensPackConstructionFromUnsigned32SampleBatches(partial.continuation, [], "extra"));
  const foreign = await import(new URL("../src/pack-construction.ts?foreign-pack-construction", import.meta.url));
  const foreignContinuation = foreign.constructOmensPackFromInitializedPlanAndUnsigned32SampleBatches(freshPlan(first.tables).plan, []);
  assert.equal(foreignContinuation.state, "needs-samples");
  safe(() => continueOmensPackConstructionFromUnsigned32SampleBatches(foreignContinuation.continuation, []));
  assert.equal(readOmensPackCollationPlanNextPositionForTransition(initialized.plan), 0);
  assert.equal(readOmensPackCollationPlanPoolDrawStateForTransition(initialized.plan), initialState);
});

test("error capabilities and outputs survive hostile inherited setters and intrinsic poisoning after caller reads", () => {
  assert.ok(Object.isFrozen(OmensPackConstructionError));
  assert.ok(Object.isFrozen(OmensPackConstructionError.prototype));
  const { tables } = fictionalCollationCapabilities(), initialized = freshPlan(tables), originalName = Object.getOwnPropertyDescriptor(Error.prototype, "name"), originals = [Object.freeze, Object.defineProperty, Object.isFrozen, Number.isSafeInteger, Array.isArray, Reflect.ownKeys];
  let result;
  try {
    Object.defineProperty(Error.prototype, "name", { configurable: true, set() { throw new Error("hostile inherited setter"); } });
    const batch = [0];
    Object.defineProperty(batch, 0, { configurable: true, enumerable: true, get() {
      Object.freeze = (value) => value;
      Object.defineProperty = () => { throw new Error("poisoned defineProperty"); };
      Object.isFrozen = () => false;
      Number.isSafeInteger = () => false;
      Array.isArray = () => false;
      Reflect.ownKeys = () => [];
      return 0;
    } });
    result = constructOmensPackFromInitializedPlanAndUnsigned32SampleBatches(initialized.plan, [batch]);
    const error = new OmensPackConstructionError();
    assert.equal(error.name, "OmensPackConstructionError");
  } finally {
    Object.defineProperty = originals[1];
    originals[1](Error.prototype, "name", originalName);
    [Object.freeze, Object.defineProperty, Object.isFrozen, Number.isSafeInteger, Array.isArray, Reflect.ownKeys] = originals;
  }
  assert.equal(result.state, "needs-samples");
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.continuation));
});

test("pack construction owns no entropy treatment card instance or cross-pool uniqueness mechanism", () => {
  const source = readFileSync(new URL("../src/pack-construction.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Math\.random|randomBytes|randomUUID|getRandomValues|node:crypto|entropy|seed|reseed|treatment|printing|card instance|image|rear|room|simulation|cross.?pool|duplicate|dedup|suppress|redraw|policy/iu);
  assert.doesNotMatch(source, /mapUnsigned32Sample(?:Batch)?ToBoundedTicket|selectOmens|removeOmens/iu);
  assert.match(source, /transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatch/u);
});
