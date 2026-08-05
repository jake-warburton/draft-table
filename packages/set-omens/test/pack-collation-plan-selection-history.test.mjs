import assert from "node:assert/strict";
import test from "node:test";
import { UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END } from "@draft-table/engine";
import { fictionalCollationCapabilities } from "./fictional-collation-capabilities.mjs";
import {
  initializeOmensPackCollationPlanFromUnsigned32SampleBatch,
  readOmensPackCollationPlanLayoutForTransition,
  readOmensPackCollationPlanNextPositionForTransition,
  readOmensPackCollationPlanPoolDrawStateForTransition,
  transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatch
} from "../src/schema-validation.ts";
import { removeOmensPackLocalPoolOfficialIdentity } from "../src/pack-local-pool-draw-state.ts";
import {
  OmensPackCollationPlanInitializationError,
  readOmensPackCollationPlanSelectionHistoryForCompletion,
  registerOmensPackCollationPlanPositionTransitionWithPriorHistoryForTest
} from "../src/pack-collation-plan.ts";

const freshPlan = (tables, ticket = 0) => {
  const initialized = initializeOmensPackCollationPlanFromUnsigned32SampleBatch(tables, [ticket]);
  assert.equal(initialized.state, "selected");
  return initialized.plan;
};
const currentFacts = (plan) => {
  const layout = readOmensPackCollationPlanLayoutForTransition(plan);
  const cursor = readOmensPackCollationPlanNextPositionForTransition(plan);
  const state = readOmensPackCollationPlanPoolDrawStateForTransition(plan);
  const positionReference = layout.slots[cursor];
  const pool = state.poolStates.find((candidate) => candidate.poolReference === positionReference.resolvedPool);
  assert.ok(pool);
  return { layout, cursor, state, positionReference, pool };
};
const accepted = (plan, sample = 0) => {
  const priorHistory = readOmensPackCollationPlanSelectionHistoryForCompletion(plan);
  const prior = currentFacts(plan);
  const result = transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatch(plan, [sample]);
  assert.equal(result.state, "selected");
  const cursor = readOmensPackCollationPlanNextPositionForTransition(result.nextPlan);
  const history = readOmensPackCollationPlanSelectionHistoryForCompletion(result.nextPlan);
  assert.equal(cursor, prior.cursor + 1);
  assert.equal(history.length, cursor);
  assert.notEqual(history, priorHistory);
  assert.ok(Object.isFrozen(history));
  for (let index = 0; index < priorHistory.length; index++) assert.equal(history[index], priorHistory[index]);
  assert.equal(readOmensPackCollationPlanSelectionHistoryForCompletion(plan), priorHistory);
  assert.equal(readOmensPackCollationPlanNextPositionForTransition(plan), prior.cursor);
  const record = history.at(-1);
  assert.ok(Object.isFrozen(record));
  assert.deepEqual(Object.keys(record), ["positionReference", "officialIdentityReference"]);
  assert.equal(record.positionReference, result.positionReference);
  assert.equal(record.officialIdentityReference, result.officialIdentityReference);
  assert.equal(record.positionReference, prior.layout.slots[prior.cursor]);
  assert.equal(record.positionReference.position, prior.cursor + 1);
  return { result, history, record, priorHistory };
};
const planFailure = (action) => assert.throws(action, (error) => {
  assert.ok(error instanceof OmensPackCollationPlanInitializationError);
  assert.equal(error.code, "OMENS_PACK_COLLATION_PLAN_INITIALIZATION_FAILED");
  assert.equal(error.message, "Omens pack collation plan initialization failed.");
  return true;
});

// RED: selection history does not exist in production before this slice.
test("freshly registered fictional plans own independent exact empty immutable selection histories", () => {
  const { tables } = fictionalCollationCapabilities(), first = freshPlan(tables), second = freshPlan(tables);
  const firstHistory = readOmensPackCollationPlanSelectionHistoryForCompletion(first), secondHistory = readOmensPackCollationPlanSelectionHistoryForCompletion(second);
  assert.deepEqual(firstHistory, []);
  assert.deepEqual(secondHistory, []);
  assert.equal(firstHistory.length, readOmensPackCollationPlanNextPositionForTransition(first));
  assert.notEqual(firstHistory, secondHistory);
  assert.ok(Object.isFrozen(firstHistory));
  assert.ok(Object.isFrozen(secondHistory));
});

test("every accepted fictional transition appends its exact returned references in source order through terminal fourteen", () => {
  const { tables } = fictionalCollationCapabilities();
  let plan = freshPlan(tables);
  const layout = readOmensPackCollationPlanLayoutForTransition(plan), historicalHistories = [readOmensPackCollationPlanSelectionHistoryForCompletion(plan)];
  for (let cursor = 0; cursor < 14; cursor++) {
    const step = accepted(plan);
    assert.equal(step.result.positionReference, layout.slots[cursor]);
    for (let index = 0; index <= cursor; index++) {
      assert.equal(step.history[index].positionReference, layout.slots[index]);
      assert.equal(step.history[index].positionReference.position, index + 1);
    }
    assert.equal(step.priorHistory, historicalHistories[cursor]);
    historicalHistories.push(step.history);
    plan = step.result.nextPlan;
  }
  const terminalHistory = readOmensPackCollationPlanSelectionHistoryForCompletion(plan);
  assert.equal(readOmensPackCollationPlanNextPositionForTransition(plan), 14);
  assert.equal(terminalHistory.length, 14);
  for (const history of historicalHistories) assert.ok(Object.isFrozen(history));
});

test("need-more leaves the exact prior history unchanged and performs no history registration", () => {
  const { tables } = fictionalCollationCapabilities(), plan = freshPlan(tables), history = readOmensPackCollationPlanSelectionHistoryForCompletion(plan), { pool } = currentFacts(plan), retry = UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END % pool.poolTotalWeight;
  for (const samples of [[], [retry], [retry, retry]]) {
    assert.deepEqual(transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatch(plan, samples), { state: "needs-sample", consumedSamples: samples.length });
    assert.equal(readOmensPackCollationPlanSelectionHistoryForCompletion(plan), history);
    assert.equal(history.length, 0);
  }
});

test("old histories remain immutable and sibling transitions mint independent history arrays and records", () => {
  const { tables } = fictionalCollationCapabilities(), plan = freshPlan(tables), oldHistory = readOmensPackCollationPlanSelectionHistoryForCompletion(plan);
  const first = accepted(plan, 0), second = accepted(plan, 1);
  assert.equal(readOmensPackCollationPlanSelectionHistoryForCompletion(plan), oldHistory);
  assert.deepEqual(oldHistory, []);
  assert.notEqual(first.history, second.history);
  assert.notEqual(first.record, second.record);
  assert.throws(() => { first.history[0] = second.record; }, TypeError);
  assert.throws(() => { first.record.positionReference = second.record.positionReference; }, TypeError);
});

test("registration rejects malformed missing extra reordered copied foreign cross-layout cross-capability cursor and removal facts without partial history", () => {
  const first = fictionalCollationCapabilities(), second = fictionalCollationCapabilities(), plan = freshPlan(first.tables), siblingPlan = freshPlan(first.tables), otherLayoutPlan = freshPlan(first.tables, first.tables.layoutChoices[0].cumulativeExclusiveEnd), otherPlan = freshPlan(second.tables), priorHistory = readOmensPackCollationPlanSelectionHistoryForCompletion(plan), prior = currentFacts(plan), identity = prior.pool.officialIdentityChoices[0].officialIdentityReference, nextState = removeOmensPackLocalPoolOfficialIdentity(prior.state, prior.positionReference.resolvedPool, identity);
  const register = (history, position = prior.positionReference, selectedIdentity = identity, state = nextState) => registerOmensPackCollationPlanPositionTransitionWithPriorHistoryForTest(plan, history, position, selectedIdentity, state);
  planFailure(() => registerOmensPackCollationPlanPositionTransitionWithPriorHistoryForTest());
  planFailure(() => register(undefined));
  planFailure(() => register(Object.freeze([Object.freeze({ positionReference: prior.positionReference, officialIdentityReference: identity })])));
  planFailure(() => register(Object.freeze([])));
  planFailure(() => register(Object.freeze([...priorHistory])));
  planFailure(() => register(readOmensPackCollationPlanSelectionHistoryForCompletion(siblingPlan)));
  planFailure(() => register(readOmensPackCollationPlanSelectionHistoryForCompletion(otherLayoutPlan)));
  planFailure(() => register(readOmensPackCollationPlanSelectionHistoryForCompletion(otherPlan)));
  const firstStep = accepted(plan), advancedPlan = firstStep.result.nextPlan, advancedHistory = firstStep.history, advanced = currentFacts(advancedPlan), advancedIdentity = advanced.pool.officialIdentityChoices[0].officialIdentityReference, advancedState = removeOmensPackLocalPoolOfficialIdentity(advanced.state, advanced.positionReference.resolvedPool, advancedIdentity);
  const copiedRecord = Object.freeze({ positionReference: advancedHistory[0].positionReference, officialIdentityReference: advancedHistory[0].officialIdentityReference });
  planFailure(() => registerOmensPackCollationPlanPositionTransitionWithPriorHistoryForTest(advancedPlan, Object.freeze([copiedRecord]), advanced.positionReference, advancedIdentity, advancedState));
  planFailure(() => registerOmensPackCollationPlanPositionTransitionWithPriorHistoryForTest(advancedPlan, priorHistory, advanced.positionReference, advancedIdentity, advancedState));
  const secondStep = accepted(advancedPlan), twoPlan = secondStep.result.nextPlan, twoHistory = secondStep.history, two = currentFacts(twoPlan), twoIdentity = two.pool.officialIdentityChoices[0].officialIdentityReference, twoState = removeOmensPackLocalPoolOfficialIdentity(two.state, two.positionReference.resolvedPool, twoIdentity);
  planFailure(() => registerOmensPackCollationPlanPositionTransitionWithPriorHistoryForTest(twoPlan, Object.freeze([twoHistory[0]]), two.positionReference, twoIdentity, twoState));
  planFailure(() => registerOmensPackCollationPlanPositionTransitionWithPriorHistoryForTest(twoPlan, Object.freeze([twoHistory[1], twoHistory[0]]), two.positionReference, twoIdentity, twoState));
  planFailure(() => registerOmensPackCollationPlanPositionTransitionWithPriorHistoryForTest(twoPlan, Object.freeze([twoHistory[0], twoHistory[1], twoHistory[1]]), two.positionReference, twoIdentity, twoState));
  planFailure(() => register(priorHistory, first.tables.layoutChoices[1].layoutReference.slots[0]));
  planFailure(() => register(priorHistory, currentFacts(otherPlan).positionReference));
  planFailure(() => register(priorHistory, prior.positionReference, currentFacts(otherPlan).pool.officialIdentityChoices[0].officialIdentityReference));
  planFailure(() => register(priorHistory, prior.positionReference, identity, prior.state));
  planFailure(() => register(priorHistory, prior.positionReference, identity, removeOmensPackLocalPoolOfficialIdentity(prior.state, prior.state.poolStates[1].poolReference, prior.state.poolStates[1].officialIdentityChoices[0].officialIdentityReference)));
  assert.equal(readOmensPackCollationPlanSelectionHistoryForCompletion(plan), priorHistory);
  assert.equal(priorHistory.length, 0);
});
