import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END, mapUnsigned32SampleBatchToBoundedTicket } from "@draft-table/engine";
import { fictionalCollationCapabilities } from "./fictional-collation-capabilities.mjs";
import {
  OmensPackCollationPlanPositionTransitionError,
  initializeOmensPackCollationPlanFromUnsigned32SampleBatch,
  readOmensPackCollationPlanLayoutForTransition,
  readOmensPackCollationPlanNextPositionForTransition,
  readOmensPackCollationPlanPoolDrawStateForTransition,
  transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatch
} from "../src/schema-validation.ts";
import { selectOmensPackLocalPoolOfficialIdentityByTicket } from "../src/pack-local-pool-ticket-selection.ts";
import { removeOmensPackLocalPoolOfficialIdentity } from "../src/pack-local-pool-draw-state.ts";
import {
  readOmensPackCollationPlanTablesForTest
} from "../src/pack-collation-plan.ts";
import {
  transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatchForTest
} from "../src/finite-batch-plan-position-transition.ts";

const cutoff = (bound) => UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END % bound;
const freshPlan = (tables, ticket = 0) => {
  const initialized = initializeOmensPackCollationPlanFromUnsigned32SampleBatch(tables, [ticket]);
  assert.equal(initialized.state, "selected");
  return initialized.plan;
};
const safe = (action) => assert.throws(action, (error) => {
  assert.ok(error instanceof OmensPackCollationPlanPositionTransitionError);
  assert.equal(error.name, "OmensPackCollationPlanPositionTransitionError");
  assert.equal(error.code, "OMENS_PACK_COLLATION_PLAN_POSITION_TRANSITION_FAILED");
  assert.equal(error.message, "Omens pack collation plan position transition failed.");
  assert.equal(error.stack, "OmensPackCollationPlanPositionTransitionError: Omens pack collation plan position transition failed.");
  assert.deepEqual(JSON.parse(JSON.stringify(error)), {
    name: "OmensPackCollationPlanPositionTransitionError",
    code: "OMENS_PACK_COLLATION_PLAN_POSITION_TRANSITION_FAILED"
  });
  assert.doesNotMatch(`${error.message}${error.stack}${JSON.stringify(error)}`, /Fictional|OMN|IAR|[0-9]|https?:|\\|\//iu);
  return true;
});
const current = (plan) => {
  const layout = readOmensPackCollationPlanLayoutForTransition(plan);
  const cursor = readOmensPackCollationPlanNextPositionForTransition(plan);
  const state = readOmensPackCollationPlanPoolDrawStateForTransition(plan);
  const position = layout.slots[cursor];
  const poolIndex = state.poolStates.findIndex((pool) => pool.poolReference === position.resolvedPool);
  assert.notEqual(poolIndex, -1);
  return { layout, cursor, state, position, poolIndex, pool: state.poolStates[poolIndex] };
};
const assertExactAccepted = (priorPlan, samples) => {
  const before = current(priorPlan);
  const mapping = mapUnsigned32SampleBatchToBoundedTicket(samples, before.pool.poolTotalWeight);
  assert.equal(mapping.state, "accepted");
  const identity = selectOmensPackLocalPoolOfficialIdentityByTicket(before.state, before.position.resolvedPool, mapping.ticket);
  const oracle = removeOmensPackLocalPoolOfficialIdentity(before.state, before.position.resolvedPool, identity);
  const result = transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatch(priorPlan, samples);
  assert.equal(result.state, "selected");
  assert.equal(result.consumedSamples, mapping.consumedSamples);
  assert.equal(result.positionReference, before.position);
  assert.equal(result.officialIdentityReference, identity);
  assert.notEqual(result.nextPlan, priorPlan);
  assert.ok(Object.isFrozen(result));
  assert.deepEqual(Object.keys(result), ["state", "consumedSamples", "positionReference", "officialIdentityReference", "nextPlan"]);
  assert.equal(readOmensPackCollationPlanLayoutForTransition(result.nextPlan), before.layout);
  assert.equal(readOmensPackCollationPlanTablesForTest(result.nextPlan), readOmensPackCollationPlanTablesForTest(priorPlan));
  assert.equal(readOmensPackCollationPlanNextPositionForTransition(result.nextPlan), before.cursor + 1);
  const nextState = readOmensPackCollationPlanPoolDrawStateForTransition(result.nextPlan);
  assert.deepEqual(nextState, oracle);
  assert.notEqual(nextState, before.state);
  for (let index = 0; index < before.state.poolStates.length; index++) {
    if (index === before.poolIndex) assert.notEqual(nextState.poolStates[index], before.state.poolStates[index]);
    else assert.equal(nextState.poolStates[index], before.state.poolStates[index]);
  }
  assert.equal(readOmensPackCollationPlanNextPositionForTransition(priorPlan), before.cursor);
  assert.equal(readOmensPackCollationPlanPoolDrawStateForTransition(priorPlan), before.state);
  return result;
};

// RED contract: this file intentionally precedes the production transition implementation.
test("empty and all-retry finite batches need another sample without selection removal or plan registration", () => {
  const { tables } = fictionalCollationCapabilities(), plan = freshPlan(tables), before = current(plan), retry = cutoff(before.pool.poolTotalWeight);
  assert.ok(retry < UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END);
  for (const samples of [[], [retry], [retry, retry]]) {
    let selected = 0, removed = 0, registered = 0;
    const result = transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatchForTest(
      plan,
      samples,
      mapUnsigned32SampleBatchToBoundedTicket,
      () => { selected++; throw new Error("selector must not run"); },
      () => { removed++; throw new Error("removal must not run"); },
      () => { registered++; throw new Error("registration must not run"); }
    );
    assert.deepEqual(result, { state: "needs-sample", consumedSamples: samples.length });
    assert.ok(Object.isFrozen(result));
    assert.deepEqual(Object.keys(result), ["state", "consumedSamples"]);
    assert.equal(selected, 0); assert.equal(removed, 0); assert.equal(registered, 0);
    assert.equal(readOmensPackCollationPlanNextPositionForTransition(plan), 0);
    assert.equal(readOmensPackCollationPlanPoolDrawStateForTransition(plan), before.state);
  }
});

test("retry then accepted first middle and last dynamic-pool tickets transition exactly the current first position", () => {
  const { tables } = fictionalCollationCapabilities();
  for (const ticketFor of [
    (pool) => 0,
    (pool) => pool.officialIdentityChoices[0].cumulativeExclusiveEnd,
    (pool) => pool.poolTotalWeight - 1
  ]) {
    const plan = freshPlan(tables), { pool } = current(plan), retry = cutoff(pool.poolTotalWeight);
    assertExactAccepted(plan, [retry, ticketFor(pool)]);
  }
});

test("an accepted first sample still prevalidates valid trailing samples and preserves consumed one without rereading caller length", () => {
  const { tables } = fictionalCollationCapabilities(), plan = freshPlan(tables);
  let lengthReads = 0, elementReads = 0;
  const samples = new Proxy([0, 1, 2], { get(target, property, receiver) {
    if (property === "length") lengthReads++;
    if (property === "0" || property === "1" || property === "2") elementReads++;
    return Reflect.get(target, property, receiver);
  } });
  const before = current(plan), result = transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatch(plan, samples);
  assert.equal(result.state, "selected");
  assert.equal(result.consumedSamples, 1);
  assert.equal(result.positionReference, before.position);
  assert.equal(result.officialIdentityReference, before.pool.officialIdentityChoices[0].officialIdentityReference);
  assert.equal(lengthReads, 1);
  assert.equal(elementReads, 3);
  safe(() => transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatch(plan, [0, -1]));
});

test("first through fourteenth accepted calls follow exact source-order positions and end at terminal cursor", () => {
  const { tables } = fictionalCollationCapabilities();
  let plan = freshPlan(tables);
  const layout = readOmensPackCollationPlanLayoutForTransition(plan);
  for (let cursor = 0; cursor < 14; cursor++) {
    const prior = current(plan);
    assert.equal(prior.position, layout.slots[cursor]);
    const result = assertExactAccepted(plan, [0]);
    plan = result.nextPlan;
  }
  assert.equal(readOmensPackCollationPlanNextPositionForTransition(plan), 14);
  safe(() => transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatch(plan, []));
  safe(() => transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatch(plan, [0]));
});

test("historical plans remain immutable and support independent atomic transitions", () => {
  const { tables } = fictionalCollationCapabilities(), plan = freshPlan(tables), before = structuredClone(current(plan).state);
  const first = assertExactAccepted(plan, [0]), second = assertExactAccepted(plan, [0]);
  assert.notEqual(first.nextPlan, second.nextPlan);
  assert.equal(first.officialIdentityReference, second.officialIdentityReference);
  assert.deepEqual(readOmensPackCollationPlanPoolDrawStateForTransition(first.nextPlan), readOmensPackCollationPlanPoolDrawStateForTransition(second.nextPlan));
  assert.notEqual(readOmensPackCollationPlanPoolDrawStateForTransition(first.nextPlan), readOmensPackCollationPlanPoolDrawStateForTransition(second.nextPlan));
  assert.deepEqual(current(plan).state, before);
  assert.equal(current(plan).cursor, 0);
  assert.throws(() => { plan.forged = true; }, TypeError);
});

test("small fictional plans equal engine batch mapping followed by exact current-state selection and removal oracles", () => {
  const { tables } = fictionalCollationCapabilities();
  for (let targetCursor = 0; targetCursor < 14; targetCursor++) {
    let plan = freshPlan(tables);
    for (let cursor = 0; cursor < targetCursor; cursor++) plan = assertExactAccepted(plan, [0]).nextPlan;
    const { pool } = current(plan), retry = cutoff(pool.poolTotalWeight), tickets = new Set([0, pool.poolTotalWeight - 1, ...pool.officialIdentityChoices.map((choice) => choice.cumulativeExclusiveEnd - 1)]);
    const batches = [[], ...(retry < UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END ? [[retry], [retry, retry]] : []), ...[...tickets].flatMap((ticket) => [[ticket], ...(retry < UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END ? [[retry, ticket]] : [])])];
    for (const samples of batches) {
      const mapping = mapUnsigned32SampleBatchToBoundedTicket(samples, pool.poolTotalWeight);
      const result = transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatch(plan, samples);
      assert.equal(result.consumedSamples, mapping.consumedSamples);
      if (mapping.state === "needs-sample") {
        assert.deepEqual(result, { state: "needs-sample", consumedSamples: mapping.consumedSamples });
        assert.equal(current(plan).cursor, targetCursor);
      } else {
        assert.equal(result.state, "selected");
        const identity = selectOmensPackLocalPoolOfficialIdentityByTicket(current(plan).state, current(plan).position.resolvedPool, mapping.ticket);
        assert.equal(result.officialIdentityReference, identity);
        assert.deepEqual(readOmensPackCollationPlanPoolDrawStateForTransition(result.nextPlan), removeOmensPackLocalPoolOfficialIdentity(current(plan).state, current(plan).position.resolvedPool, identity));
      }
    }
  }
});

test("invalid extra foreign copied malformed and cross-capability inputs fail through one stable source-secret error", () => {
  const first = fictionalCollationCapabilities(), second = fictionalCollationCapabilities(), plan = freshPlan(first.tables), otherPlan = freshPlan(second.tables), { state, position, pool } = current(plan), other = current(otherPlan), before = structuredClone(state);
  safe(() => transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatch());
  safe(() => transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatch(plan));
  safe(() => transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatch(plan, [], "extra"));
  safe(() => transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatch(Object.freeze({}), []));
  safe(() => transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatch(structuredClone(plan), []));
  safe(() => transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatch(plan, new Uint32Array([0])));
  for (const samples of [[-1], [0.5], [NaN], [Infinity], [UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END], "0", null, undefined]) safe(() => transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatch(plan, samples));
  for (const mapping of [null, {}, Object.freeze({ state: "needs-sample", consumedSamples: -1 }), Object.freeze({ state: "accepted", ticket: pool.poolTotalWeight, consumedSamples: 1 }), Object.freeze({ state: "accepted", ticket: 0, consumedSamples: 1, extra: true })]) {
    safe(() => transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatchForTest(plan, [0], () => mapping, selectOmensPackLocalPoolOfficialIdentityByTicket, removeOmensPackLocalPoolOfficialIdentity, () => { throw new Error("must not register"); }));
  }
  safe(() => transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatchForTest(plan, [0], mapUnsigned32SampleBatchToBoundedTicket, () => other.pool.officialIdentityChoices[0].officialIdentityReference, removeOmensPackLocalPoolOfficialIdentity, () => { throw new Error("must not register"); }));
  safe(() => transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatchForTest(plan, [0], mapUnsigned32SampleBatchToBoundedTicket, selectOmensPackLocalPoolOfficialIdentityByTicket, () => state, () => { throw new Error("must not register"); }));
  safe(() => transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatchForTest(plan, [0], mapUnsigned32SampleBatchToBoundedTicket, selectOmensPackLocalPoolOfficialIdentityByTicket, () => removeOmensPackLocalPoolOfficialIdentity(state, state.poolStates[1].poolReference, state.poolStates[1].officialIdentityChoices[0].officialIdentityReference), () => { throw new Error("must not register"); }));
  safe(() => transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatchForTest(plan, [0], mapUnsigned32SampleBatchToBoundedTicket, selectOmensPackLocalPoolOfficialIdentityByTicket, removeOmensPackLocalPoolOfficialIdentity, () => plan));
  safe(() => transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatchForTest(plan, [0], mapUnsigned32SampleBatchToBoundedTicket, selectOmensPackLocalPoolOfficialIdentityByTicket, removeOmensPackLocalPoolOfficialIdentity, () => otherPlan));
  safe(() => transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatchForTest(plan, [0], mapUnsigned32SampleBatchToBoundedTicket, () => position.resolvedPool.entries.at(-1).officialIdentity, removeOmensPackLocalPoolOfficialIdentity, () => plan));
  assert.deepEqual(state, before);
});

test("a plan capability minted by a foreign module instance is rejected", async () => {
  const { tables } = fictionalCollationCapabilities();
  const foreign = await import(new URL("../src/pack-collation-plan.ts?foreign-plan-capability", import.meta.url));
  const foreignPlan = foreign.registerOmensPackCollationPlanForExactSelectedLayout(tables, tables.layoutChoices[0].layoutReference);
  assert.ok(Object.isFrozen(foreignPlan));
  safe(() => transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatch(foreignPlan, []));
});

test("abrupt caller reads and hostile inherited setters remain safely wrapped without partial state", () => {
  const { tables } = fictionalCollationCapabilities(), plan = freshPlan(tables), state = current(plan).state;
  safe(() => transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatch(plan, new Proxy([0], { get(target, property, receiver) { if (property === "0") throw new Error("unsafe getter"); return Reflect.get(target, property, receiver); } })));
  const originalName = Object.getOwnPropertyDescriptor(Error.prototype, "name");
  try {
    Object.defineProperty(Error.prototype, "name", { configurable: true, set() { throw new Error("hostile inherited setter"); } });
    safe(() => transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatch(Object.freeze({}), []));
    const error = new OmensPackCollationPlanPositionTransitionError();
    assert.equal(error.name, "OmensPackCollationPlanPositionTransitionError");
  } finally { Object.defineProperty(Error.prototype, "name", originalName); }
  assert.equal(current(plan).state, state);
});

test("transition error constructor and prototype are frozen and outputs remain hardened after hostile batch getters", () => {
  assert.ok(Object.isFrozen(OmensPackCollationPlanPositionTransitionError));
  assert.ok(Object.isFrozen(OmensPackCollationPlanPositionTransitionError.prototype));
  assert.throws(() => Object.defineProperty(OmensPackCollationPlanPositionTransitionError, Symbol.hasInstance, { value: () => false }), TypeError);
  const { tables } = fictionalCollationCapabilities(), plan = freshPlan(tables), originals = [Object.freeze, Object.isFrozen, Number.isSafeInteger, Math.floor];
  let result;
  try {
    const samples = [0];
    Object.defineProperty(samples, 0, { enumerable: true, configurable: true, get() {
      Object.freeze = (value) => value; Object.isFrozen = () => true; Number.isSafeInteger = () => false; Math.floor = () => { throw new Error("poisoned floor"); }; return 0;
    } });
    result = transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatch(plan, samples);
  } finally { [Object.freeze, Object.isFrozen, Number.isSafeInteger, Math.floor] = originals; }
  assert.equal(result.state, "selected");
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.nextPlan));
});

test("position transition source owns no entropy retry loop pack construction or excluded future policy", () => {
  const source = readFileSync(new URL("../src/finite-batch-plan-position-transition.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /mapUnsigned32SampleToBoundedTicket|FromOneUnsigned32Sample|samples\s*\[|samples\.length|inputs\[1\]\.length|Array\.isArray|Math\.random|crypto|randomBytes|randomUUID|while\s*\(|pack construction|card instance|rear|treatment|printing|image|snapshot|room|simulation|console\.|process\./iu);
});
