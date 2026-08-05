import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END } from "@draft-table/engine";
import { parseVerifiedOmensCustomCards, parseVerifiedOmensLayouts, parseVerifiedOmensPools, validateCardVaultOmensOfficialMembership, validateVerifiedFabCardSourceDocuments, verifyCardVaultOmensProductBytes, verifyFabCardSchemaBytes, verifyFabEnglishCardBytes, verifyOmensRecipeBytes } from "../src/index.ts";
import { OmensPackCollationPlanPositionTransitionError, classifyOmensOfficialDraftEligibility, compileOmensCollationWeightTables, initializeOmensPackCollationPlanFromUnsigned32SampleBatch, readOmensPackCollationPlanLayoutForTransition, readOmensPackCollationPlanNextPositionForTransition, readOmensPackCollationPlanPoolDrawStateForTransition, reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData, reconcileOmensRecipeCustomCardsWithOfficialUpstreamIdentities, resolveOmensRecipeLayoutsToOfficialIdentityPools, resolveOmensRecipePoolsToDraftableOfficialIdentities, transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatch, validateFabEnglishCardDataAgainstSchema } from "../src/schema-validation.ts";

const variables = ["OMENS_RECIPE_EVIDENCE_PATH", "FAB_CARD_SOURCE_EVIDENCE_PATH", "FAB_CARD_SCHEMA_EVIDENCE_PATH", "FAB_CARD_VAULT_EVIDENCE_PATH"];
const available = variables.every((variable) => Boolean(process.env[variable]));
export const finiteBatchPlanPositionTransitionAcceptanceContractName = "four checksum-verified caller-held sources transition every position of every Omens plan from finite batches";
export const finiteBatchPlanPositionTransitionAcceptanceMarker = "FINITE_BATCH_COLLATION_PLAN_POSITION_TRANSITION_CONTRACT_EXECUTED";
const cutoff = (bound) => UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END % bound;
const initializedPlan = (tables, layoutTicket) => {
  const result = initializeOmensPackCollationPlanFromUnsigned32SampleBatch(tables, [layoutTicket]);
  assert.equal(result.state, "selected");
  assert.equal(result.consumedSamples, 1);
  return result;
};
const poolFor = (state, poolReference) => {
  const pools = state.poolStates.filter((pool) => pool.poolReference === poolReference);
  assert.equal(pools.length, 1);
  return { pool: pools[0], index: state.poolStates.indexOf(pools[0]) };
};
const expectedRemovedChoices = (pool, selectedIdentity) => {
  let end = 0;
  return pool.officialIdentityChoices.filter((choice) => choice.officialIdentityReference !== selectedIdentity).map((choice) => ({
    officialIdentityReference: choice.officialIdentityReference,
    weight: choice.weight,
    cumulativeExclusiveEnd: (end += choice.weight)
  }));
};

// Captain-held acceptance: only the captain can supply and accept the private recipe measurement.
test(finiteBatchPlanPositionTransitionAcceptanceContractName, { skip: !available ? "four-source finite batch plan-position transition acceptance did not run; use npm run test:finite-batch-plan-position-transition-evidence" : false }, () => {
  const recipe = verifyOmensRecipeBytes(readFileSync(process.env.OMENS_RECIPE_EVIDENCE_PATH));
  const cardBytes = readFileSync(process.env.FAB_CARD_SOURCE_EVIDENCE_PATH), schemaBytes = readFileSync(process.env.FAB_CARD_SCHEMA_EVIDENCE_PATH), cardVaultBytes = readFileSync(process.env.FAB_CARD_VAULT_EVIDENCE_PATH);
  const documents = validateVerifiedFabCardSourceDocuments(verifyFabEnglishCardBytes(cardBytes), verifyFabCardSchemaBytes(schemaBytes)); verifyCardVaultOmensProductBytes(cardVaultBytes);
  const official = reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData(validateCardVaultOmensOfficialMembership(cardVaultBytes), validateFabEnglishCardDataAgainstSchema(documents.card, documents.schema));
  const identities = reconcileOmensRecipeCustomCardsWithOfficialUpstreamIdentities(parseVerifiedOmensCustomCards(recipe), official), eligibility = classifyOmensOfficialDraftEligibility(identities, official), pools = resolveOmensRecipePoolsToDraftableOfficialIdentities(parseVerifiedOmensPools(recipe), identities, eligibility), tables = compileOmensCollationWeightTables(resolveOmensRecipeLayoutsToOfficialIdentityPools(parseVerifiedOmensLayouts(recipe), pools), pools);
  assert.equal(tables.layoutChoices.length, 228);
  for (let layoutIndex = 0; layoutIndex < tables.layoutChoices.length; layoutIndex++) {
    const layoutChoice = tables.layoutChoices[layoutIndex], layoutTicket = layoutIndex === 0 ? 0 : tables.layoutChoices[layoutIndex - 1].cumulativeExclusiveEnd;
    const noTransition = initializedPlan(tables, layoutTicket), noTransitionState = readOmensPackCollationPlanPoolDrawStateForTransition(noTransition.plan), firstPool = poolFor(noTransitionState, noTransition.layoutReference.slots[0].resolvedPool).pool, retry = cutoff(firstPool.poolTotalWeight);
    assert.ok(retry < UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END);
    assert.deepEqual(transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatch(noTransition.plan, []), { state: "needs-sample", consumedSamples: 0 });
    assert.deepEqual(transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatch(noTransition.plan, [retry, retry]), { state: "needs-sample", consumedSamples: 2 });
    assert.equal(readOmensPackCollationPlanNextPositionForTransition(noTransition.plan), 0);
    assert.equal(readOmensPackCollationPlanPoolDrawStateForTransition(noTransition.plan), noTransitionState);
    for (const ticketFor of [(pool) => 0, (pool) => pool.poolTotalWeight - 1]) {
      const initialized = initializedPlan(tables, layoutTicket);
      assert.equal(initialized.layoutReference, layoutChoice.layoutReference);
      let plan = initialized.plan;
      for (let cursor = 0; cursor < 14; cursor++) {
        const historicalPlan = plan, historicalState = readOmensPackCollationPlanPoolDrawStateForTransition(historicalPlan), position = initialized.layoutReference.slots[cursor], selected = poolFor(historicalState, position.resolvedPool), ticket = ticketFor(selected.pool), retryCutoff = cutoff(selected.pool.poolTotalWeight);
        assert.ok(retryCutoff < UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END);
        const expectedChoice = selected.pool.officialIdentityChoices.find((choice) => choice.cumulativeExclusiveEnd > ticket), expectedChoices = expectedRemovedChoices(selected.pool, expectedChoice.officialIdentityReference), expectedWeight = selected.pool.officialIdentityChoices.find((choice) => choice.officialIdentityReference === expectedChoice.officialIdentityReference).weight;
        const result = transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatch(historicalPlan, [retryCutoff, ticket]);
        assert.equal(result.state, "selected"); assert.equal(result.consumedSamples, 2); assert.equal(result.positionReference, position); assert.equal(result.officialIdentityReference, expectedChoice.officialIdentityReference); assert.notEqual(result.nextPlan, historicalPlan); assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.nextPlan));
        assert.equal(readOmensPackCollationPlanLayoutForTransition(result.nextPlan), initialized.layoutReference); assert.equal(readOmensPackCollationPlanNextPositionForTransition(result.nextPlan), cursor + 1);
        const nextState = readOmensPackCollationPlanPoolDrawStateForTransition(result.nextPlan), nextSelectedPool = nextState.poolStates[selected.index];
        assert.equal(nextSelectedPool.poolReference, selected.pool.poolReference); assert.equal(nextSelectedPool.poolTotalWeight, selected.pool.poolTotalWeight - expectedWeight); assert.deepEqual(nextSelectedPool.officialIdentityChoices.map((choice) => ({ officialIdentityReference: choice.officialIdentityReference, weight: choice.weight, cumulativeExclusiveEnd: choice.cumulativeExclusiveEnd })), expectedChoices);
        for (let poolIndex = 0; poolIndex < historicalState.poolStates.length; poolIndex++) if (poolIndex !== selected.index) assert.equal(nextState.poolStates[poolIndex], historicalState.poolStates[poolIndex]);
        assert.equal(readOmensPackCollationPlanNextPositionForTransition(historicalPlan), cursor); assert.equal(readOmensPackCollationPlanPoolDrawStateForTransition(historicalPlan), historicalState); assert.ok(Object.isFrozen(historicalState));
        plan = result.nextPlan;
      }
      assert.equal(readOmensPackCollationPlanNextPositionForTransition(plan), 14);
      assert.throws(() => transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatch(plan, []), (error) => error instanceof OmensPackCollationPlanPositionTransitionError && error.code === "OMENS_PACK_COLLATION_PLAN_POSITION_TRANSITION_FAILED");
    }
  }
  console.log(finiteBatchPlanPositionTransitionAcceptanceMarker);
});
