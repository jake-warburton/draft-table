import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { readFileSync } from "node:fs";
import test from "node:test";
import { UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END } from "@draft-table/engine";
import { assertPackLocalInitialProjectionMatchesCompiledTables } from "./pack-local-pool-draw-state-evidence-assertions.mjs";
import {
  parseVerifiedOmensCustomCards, parseVerifiedOmensLayouts, parseVerifiedOmensPools,
  validateCardVaultOmensOfficialMembership, validateVerifiedFabCardSourceDocuments,
  verifyCardVaultOmensProductBytes, verifyFabCardSchemaBytes, verifyFabEnglishCardBytes, verifyOmensRecipeBytes
} from "../src/index.ts";
import {
  classifyOmensOfficialDraftEligibility, compileOmensCollationWeightTables,
  drawOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample, initializeOmensPackLocalPoolDrawState,
  reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData,
  reconcileOmensRecipeCustomCardsWithOfficialUpstreamIdentities, removeOmensPackLocalPoolOfficialIdentity,
  resolveOmensRecipeLayoutsToOfficialIdentityPools, resolveOmensRecipePoolsToDraftableOfficialIdentities,
  validateFabEnglishCardDataAgainstSchema
} from "../src/schema-validation.ts";

const variables = ["OMENS_RECIPE_EVIDENCE_PATH", "FAB_CARD_SOURCE_EVIDENCE_PATH", "FAB_CARD_SCHEMA_EVIDENCE_PATH", "FAB_CARD_VAULT_EVIDENCE_PATH"];
const available = variables.every((variable) => Boolean(process.env[variable]));
export const packLocalPoolSampleDrawTransitionAcceptanceContractName = "four checksum-verified caller-held sources atomically draw one uint32 sample and remove only its exact current pack-local identity";
export const packLocalPoolSampleDrawTransitionAcceptanceMarker = "PACK_LOCAL_POOL_SAMPLE_DRAW_TRANSITION_CONTRACT_EXECUTED";
const cutoff = (bound) => UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END % bound;

const expectedAfterRemoval = (pool, selected) => {
  const selectedChoice = pool.officialIdentityChoices.find((choice) => choice.officialIdentityReference === selected), remaining = pool.officialIdentityChoices.filter((choice) => choice.officialIdentityReference !== selected); let end = 0;
  assert.ok(selectedChoice);
  return { total: pool.poolTotalWeight - selectedChoice.weight, choices: remaining.map((choice) => ({ identity: choice.officialIdentityReference, weight: choice.weight, end: (end += choice.weight) })) };
};
const assertExactTransition = (state, poolIndex, sample) => {
  const pool = state.poolStates[poolIndex], ticket = sample % pool.poolTotalWeight, expectedChoice = pool.officialIdentityChoices.find((choice) => choice.cumulativeExclusiveEnd > ticket), expected = expectedAfterRemoval(pool, expectedChoice.officialIdentityReference), before = structuredClone(state), result = drawOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample(state, pool.poolReference, sample);
  assert.equal(result.state, "selected"); assert.equal(result.officialIdentityReference, expectedChoice.officialIdentityReference); assert.notEqual(result.nextState, state); assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.nextState));
  const output = result.nextState.poolStates[poolIndex]; assert.equal(output.poolReference, pool.poolReference); assert.equal(output.poolTotalWeight, expected.total); assert.deepEqual(output.officialIdentityChoices.map((choice) => ({ identity: choice.officialIdentityReference, weight: choice.weight, end: choice.cumulativeExclusiveEnd })), expected.choices);
  for (let index = 0; index < state.poolStates.length; index++) if (index !== poolIndex) assert.equal(result.nextState.poolStates[index], state.poolStates[index]); assert.deepEqual(state, before); return result;
};
const assertEveryTicketAndRetry = (state, poolIndex) => {
  const pool = state.poolStates[poolIndex], before = structuredClone(state);
  for (let ticket = 0; ticket < pool.poolTotalWeight; ticket++) assertExactTransition(state, poolIndex, ticket);
  const accepted = cutoff(pool.poolTotalWeight);
  if (accepted < UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END) assert.deepEqual(drawOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample(state, pool.poolReference, accepted), { state: "retry" });
  assert.deepEqual(state, before);
};

test(packLocalPoolSampleDrawTransitionAcceptanceContractName, { skip: !available ? "four-source pack-local atomic draw acceptance did not run; use npm run test:pack-local-pool-sample-draw-transition-evidence" : false }, () => {
  const recipeBytes = readFileSync(process.env.OMENS_RECIPE_EVIDENCE_PATH), cardBytes = readFileSync(process.env.FAB_CARD_SOURCE_EVIDENCE_PATH), schemaBytes = readFileSync(process.env.FAB_CARD_SCHEMA_EVIDENCE_PATH), cardVaultBytes = readFileSync(process.env.FAB_CARD_VAULT_EVIDENCE_PATH);
  const recipe = verifyOmensRecipeBytes(recipeBytes), verifiedCard = verifyFabEnglishCardBytes(cardBytes), verifiedSchema = verifyFabCardSchemaBytes(schemaBytes);
  verifyCardVaultOmensProductBytes(cardVaultBytes);
  const documents = validateVerifiedFabCardSourceDocuments(verifiedCard, verifiedSchema), official = reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData(validateCardVaultOmensOfficialMembership(cardVaultBytes), validateFabEnglishCardDataAgainstSchema(documents.card, documents.schema)), identities = reconcileOmensRecipeCustomCardsWithOfficialUpstreamIdentities(parseVerifiedOmensCustomCards(recipe), official), eligibility = classifyOmensOfficialDraftEligibility(identities, official), resolvedPools = resolveOmensRecipePoolsToDraftableOfficialIdentities(parseVerifiedOmensPools(recipe), identities, eligibility), tables = compileOmensCollationWeightTables(resolveOmensRecipeLayoutsToOfficialIdentityPools(parseVerifiedOmensLayouts(recipe), resolvedPools), resolvedPools), initial = initializeOmensPackLocalPoolDrawState(tables);
  assertPackLocalInitialProjectionMatchesCompiledTables(tables, initial); assert.equal(initial.poolStates.length, 11);
  let crossPoolOverlapCount = 0;
  for (let poolIndex = 0; poolIndex < initial.poolStates.length; poolIndex++) {
    const sourcePool = initial.poolStates[poolIndex]; assertEveryTicketAndRetry(initial, poolIndex);
    for (let choiceIndex = 0; choiceIndex < sourcePool.officialIdentityChoices.length; choiceIndex++) {
      const fresh = initializeOmensPackLocalPoolDrawState(tables), selectedPool = fresh.poolStates[poolIndex], selected = selectedPool.officialIdentityChoices[choiceIndex], isolated = removeOmensPackLocalPoolOfficialIdentity(fresh, selectedPool.poolReference, selected.officialIdentityReference), output = isolated.poolStates[poolIndex];
      assert.deepEqual(fresh, initial);
      if (output.poolTotalWeight === 0) assert.throws(() => drawOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample(isolated, output.poolReference, 0));
      else assertEveryTicketAndRetry(isolated, poolIndex);
      for (let otherIndex = 0; otherIndex < fresh.poolStates.length; otherIndex++) if (otherIndex !== poolIndex && fresh.poolStates[otherIndex].officialIdentityChoices.some((choice) => isDeepStrictEqual(choice.officialIdentityReference, selected.officialIdentityReference))) {
        crossPoolOverlapCount++; const result = assertExactTransition(fresh, poolIndex, choiceIndex === 0 ? 0 : selectedPool.officialIdentityChoices[choiceIndex - 1].cumulativeExclusiveEnd);
        assert.ok(result.nextState.poolStates[otherIndex].officialIdentityChoices.some((choice) => isDeepStrictEqual(choice.officialIdentityReference, selected.officialIdentityReference)));
      }
    }
  }
  assert.ok(crossPoolOverlapCount > 0); console.log(packLocalPoolSampleDrawTransitionAcceptanceMarker);
});
