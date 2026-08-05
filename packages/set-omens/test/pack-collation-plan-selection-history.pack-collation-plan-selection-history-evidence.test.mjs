import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END } from "@draft-table/engine";
import { parseVerifiedOmensCustomCards, parseVerifiedOmensLayouts, parseVerifiedOmensPools, validateCardVaultOmensOfficialMembership, validateVerifiedFabCardSourceDocuments, verifyCardVaultOmensProductBytes, verifyFabCardSchemaBytes, verifyFabEnglishCardBytes, verifyOmensRecipeBytes } from "../src/index.ts";
import { classifyOmensOfficialDraftEligibility, compileOmensCollationWeightTables, initializeOmensPackCollationPlanFromUnsigned32SampleBatch, readOmensPackCollationPlanNextPositionForTransition, readOmensPackCollationPlanPoolDrawStateForTransition, reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData, reconcileOmensRecipeCustomCardsWithOfficialUpstreamIdentities, resolveOmensRecipeLayoutsToOfficialIdentityPools, resolveOmensRecipePoolsToDraftableOfficialIdentities, transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatch, validateFabEnglishCardDataAgainstSchema } from "../src/schema-validation.ts";
import { readOmensPackCollationPlanSelectionHistoryForCompletion } from "../src/pack-collation-plan.ts";

const variables = ["OMENS_RECIPE_EVIDENCE_PATH", "FAB_CARD_SOURCE_EVIDENCE_PATH", "FAB_CARD_SCHEMA_EVIDENCE_PATH", "FAB_CARD_VAULT_EVIDENCE_PATH"];
const available = variables.every((variable) => Boolean(process.env[variable]));
export const packCollationPlanSelectionHistoryAcceptanceContractName = "four checksum-verified caller-held sources retain every Omens plan selection in exact source order";
export const packCollationPlanSelectionHistoryAcceptanceMarker = "PACK_COLLATION_PLAN_SELECTION_HISTORY_CONTRACT_EXECUTED";
const cutoff = (bound) => UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END % bound;
const poolFor = (state, poolReference) => {
  const matches = state.poolStates.filter((pool) => pool.poolReference === poolReference);
  assert.equal(matches.length, 1);
  return { pool: matches[0], index: state.poolStates.indexOf(matches[0]) };
};
const expectedChoicesAfter = (pool, selectedIdentity) => {
  let end = 0;
  return pool.officialIdentityChoices.filter((choice) => choice.officialIdentityReference !== selectedIdentity).map((choice) => ({
    officialIdentityReference: choice.officialIdentityReference,
    weight: choice.weight,
    cumulativeExclusiveEnd: (end += choice.weight)
  }));
};

// Captain-held acceptance: only the captain can supply and accept the private recipe measurement.
test(packCollationPlanSelectionHistoryAcceptanceContractName, { skip: !available ? "four-source pack collation plan selection-history acceptance did not run; use npm run test:pack-collation-plan-selection-history-evidence" : false }, () => {
  const recipe = verifyOmensRecipeBytes(readFileSync(process.env.OMENS_RECIPE_EVIDENCE_PATH));
  const cardBytes = readFileSync(process.env.FAB_CARD_SOURCE_EVIDENCE_PATH), schemaBytes = readFileSync(process.env.FAB_CARD_SCHEMA_EVIDENCE_PATH), cardVaultBytes = readFileSync(process.env.FAB_CARD_VAULT_EVIDENCE_PATH);
  const documents = validateVerifiedFabCardSourceDocuments(verifyFabEnglishCardBytes(cardBytes), verifyFabCardSchemaBytes(schemaBytes)); verifyCardVaultOmensProductBytes(cardVaultBytes);
  const official = reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData(validateCardVaultOmensOfficialMembership(cardVaultBytes), validateFabEnglishCardDataAgainstSchema(documents.card, documents.schema));
  const identities = reconcileOmensRecipeCustomCardsWithOfficialUpstreamIdentities(parseVerifiedOmensCustomCards(recipe), official), eligibility = classifyOmensOfficialDraftEligibility(identities, official), pools = resolveOmensRecipePoolsToDraftableOfficialIdentities(parseVerifiedOmensPools(recipe), identities, eligibility), tables = compileOmensCollationWeightTables(resolveOmensRecipeLayoutsToOfficialIdentityPools(parseVerifiedOmensLayouts(recipe), pools), pools);
  assert.equal(tables.layoutChoices.length, 228);
  for (let layoutIndex = 0; layoutIndex < tables.layoutChoices.length; layoutIndex++) {
    const layoutChoice = tables.layoutChoices[layoutIndex], layoutTicket = layoutIndex === 0 ? 0 : tables.layoutChoices[layoutIndex - 1].cumulativeExclusiveEnd;
    const initialized = initializeOmensPackCollationPlanFromUnsigned32SampleBatch(tables, [layoutTicket]);
    assert.equal(initialized.state, "selected"); assert.equal(initialized.layoutReference, layoutChoice.layoutReference);
    let plan = initialized.plan;
    const freshHistory = readOmensPackCollationPlanSelectionHistoryForCompletion(plan);
    assert.equal(readOmensPackCollationPlanNextPositionForTransition(plan), 0); assert.deepEqual(freshHistory, []); assert.ok(Object.isFrozen(freshHistory));
    for (let cursor = 0; cursor < 14; cursor++) {
      const priorPlan = plan, priorCursor = readOmensPackCollationPlanNextPositionForTransition(priorPlan), priorHistory = readOmensPackCollationPlanSelectionHistoryForCompletion(priorPlan), priorState = readOmensPackCollationPlanPoolDrawStateForTransition(priorPlan), position = initialized.layoutReference.slots[cursor], selected = poolFor(priorState, position.resolvedPool), ticket = selected.pool.poolTotalWeight - 1, retry = cutoff(selected.pool.poolTotalWeight), expected = selected.pool.officialIdentityChoices.at(-1), expectedChoices = expectedChoicesAfter(selected.pool, expected.officialIdentityReference);
      assert.equal(priorCursor, cursor); assert.equal(priorHistory.length, cursor); assert.ok(retry < UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END);
      const result = transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatch(priorPlan, [retry, ticket]);
      assert.equal(result.state, "selected"); assert.equal(result.consumedSamples, 2); assert.equal(result.positionReference, position); assert.equal(result.officialIdentityReference, expected.officialIdentityReference);
      const history = readOmensPackCollationPlanSelectionHistoryForCompletion(result.nextPlan), nextCursor = readOmensPackCollationPlanNextPositionForTransition(result.nextPlan), record = history[cursor], nextState = readOmensPackCollationPlanPoolDrawStateForTransition(result.nextPlan), nextPool = nextState.poolStates[selected.index];
      assert.equal(nextCursor, cursor + 1); assert.equal(history.length, nextCursor); assert.notEqual(history, priorHistory); assert.ok(Object.isFrozen(history)); assert.ok(Object.isFrozen(record));
      for (let index = 0; index < priorHistory.length; index++) assert.equal(history[index], priorHistory[index]);
      assert.equal(record.positionReference, result.positionReference); assert.equal(record.positionReference, initialized.layoutReference.slots[cursor]); assert.equal(record.positionReference.position, cursor + 1); assert.equal(record.officialIdentityReference, result.officialIdentityReference);
      assert.equal(nextPool.poolReference, selected.pool.poolReference); assert.equal(nextPool.poolTotalWeight, expectedChoices.at(-1)?.cumulativeExclusiveEnd ?? 0); assert.deepEqual(nextPool.officialIdentityChoices.map((choice) => ({ officialIdentityReference: choice.officialIdentityReference, weight: choice.weight, cumulativeExclusiveEnd: choice.cumulativeExclusiveEnd })), expectedChoices);
      for (let poolIndex = 0; poolIndex < priorState.poolStates.length; poolIndex++) if (poolIndex !== selected.index) assert.equal(nextState.poolStates[poolIndex], priorState.poolStates[poolIndex]);
      assert.equal(readOmensPackCollationPlanNextPositionForTransition(priorPlan), priorCursor); assert.equal(readOmensPackCollationPlanSelectionHistoryForCompletion(priorPlan), priorHistory); assert.equal(readOmensPackCollationPlanPoolDrawStateForTransition(priorPlan), priorState);
      plan = result.nextPlan;
    }
    const terminalHistory = readOmensPackCollationPlanSelectionHistoryForCompletion(plan);
    assert.equal(readOmensPackCollationPlanNextPositionForTransition(plan), 14); assert.equal(terminalHistory.length, 14);
    for (let index = 0; index < 14; index++) { assert.equal(terminalHistory[index].positionReference, initialized.layoutReference.slots[index]); assert.equal(terminalHistory[index].positionReference.position, index + 1); }
  }
  console.log(packCollationPlanSelectionHistoryAcceptanceMarker);
});
