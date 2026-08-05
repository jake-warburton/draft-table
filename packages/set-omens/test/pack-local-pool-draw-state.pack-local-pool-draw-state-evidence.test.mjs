import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  parseVerifiedOmensCustomCards,
  parseVerifiedOmensLayouts,
  parseVerifiedOmensPools,
  validateCardVaultOmensOfficialMembership,
  validateVerifiedFabCardSourceDocuments,
  verifyCardVaultOmensProductBytes,
  verifyFabCardSchemaBytes,
  verifyFabEnglishCardBytes,
  verifyOmensRecipeBytes
} from "../src/index.ts";
import {
  classifyOmensOfficialDraftEligibility,
  compileOmensCollationWeightTables,
  initializeOmensPackLocalPoolDrawState,
  reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData,
  reconcileOmensRecipeCustomCardsWithOfficialUpstreamIdentities,
  removeOmensPackLocalPoolOfficialIdentity,
  resolveOmensRecipeLayoutsToOfficialIdentityPools,
  resolveOmensRecipePoolsToDraftableOfficialIdentities,
  validateFabEnglishCardDataAgainstSchema
} from "../src/schema-validation.ts";

const variables = ["OMENS_RECIPE_EVIDENCE_PATH", "FAB_CARD_SOURCE_EVIDENCE_PATH", "FAB_CARD_SCHEMA_EVIDENCE_PATH", "FAB_CARD_VAULT_EVIDENCE_PATH"];
const available = variables.every((variable) => Boolean(process.env[variable]));
export const packLocalPoolDrawStateAcceptanceContractName = "four checksum-verified caller-held sources enforce pack-local same-pool removal across every identity-pool entry";
export const packLocalPoolDrawStateAcceptanceMarker = "PACK_LOCAL_POOL_DRAW_STATE_CONTRACT_EXECUTED";

const assertRecurrence = (poolState) => {
  let prior = 0;
  for (const choice of poolState.officialIdentityChoices) {
    assert.ok(Number.isSafeInteger(choice.weight)); assert.ok(choice.weight > 0);
    assert.equal(choice.cumulativeExclusiveEnd, prior + choice.weight);
    prior = choice.cumulativeExclusiveEnd;
  }
  assert.equal(prior, poolState.poolTotalWeight);
};

test(packLocalPoolDrawStateAcceptanceContractName, { skip: !available ? "four-source pack-local pool draw-state acceptance did not run; use npm run test:pack-local-pool-draw-state-evidence" : false }, () => {
  const recipeBytes = readFileSync(process.env.OMENS_RECIPE_EVIDENCE_PATH);
  const cardBytes = readFileSync(process.env.FAB_CARD_SOURCE_EVIDENCE_PATH);
  const schemaBytes = readFileSync(process.env.FAB_CARD_SCHEMA_EVIDENCE_PATH);
  const cardVaultBytes = readFileSync(process.env.FAB_CARD_VAULT_EVIDENCE_PATH);
  const recipe = verifyOmensRecipeBytes(recipeBytes);
  const verifiedCard = verifyFabEnglishCardBytes(cardBytes), verifiedSchema = verifyFabCardSchemaBytes(schemaBytes);
  verifyCardVaultOmensProductBytes(cardVaultBytes);
  const documents = validateVerifiedFabCardSourceDocuments(verifiedCard, verifiedSchema);
  const official = reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData(validateCardVaultOmensOfficialMembership(cardVaultBytes), validateFabEnglishCardDataAgainstSchema(documents.card, documents.schema));
  const identities = reconcileOmensRecipeCustomCardsWithOfficialUpstreamIdentities(parseVerifiedOmensCustomCards(recipe), official);
  const eligibility = classifyOmensOfficialDraftEligibility(identities, official);
  const resolvedPools = resolveOmensRecipePoolsToDraftableOfficialIdentities(parseVerifiedOmensPools(recipe), identities, eligibility);
  const resolvedLayouts = resolveOmensRecipeLayoutsToOfficialIdentityPools(parseVerifiedOmensLayouts(recipe), resolvedPools);
  const tables = compileOmensCollationWeightTables(resolvedLayouts, resolvedPools);
  const initial = initializeOmensPackLocalPoolDrawState(tables);

  assert.equal(initial.poolStates.length, 11);
  let crossPoolOverlapCount = 0;
  for (let poolIndex = 0; poolIndex < initial.poolStates.length; poolIndex++) {
    const sourcePool = initial.poolStates[poolIndex]; assertRecurrence(sourcePool);
    for (let choiceIndex = 0; choiceIndex < sourcePool.officialIdentityChoices.length; choiceIndex++) {
      const fresh = initializeOmensPackLocalPoolDrawState(tables), selectedPool = fresh.poolStates[poolIndex], selected = selectedPool.officialIdentityChoices[choiceIndex];
      const next = removeOmensPackLocalPoolOfficialIdentity(fresh, selectedPool.poolReference, selected.officialIdentityReference), output = next.poolStates[poolIndex];
      assert.equal(output.poolReference, selectedPool.poolReference);
      assert.equal(output.poolTotalWeight, selectedPool.poolTotalWeight - selected.weight);
      assert.deepEqual(output.officialIdentityChoices.map((choice) => [choice.officialIdentityReference, choice.weight]), selectedPool.officialIdentityChoices.filter((_, index) => index !== choiceIndex).map((choice) => [choice.officialIdentityReference, choice.weight]));
      assertRecurrence(output);
      for (let otherIndex = 0; otherIndex < fresh.poolStates.length; otherIndex++) {
        if (otherIndex === poolIndex) continue;
        assert.equal(next.poolStates[otherIndex], fresh.poolStates[otherIndex]);
        assert.deepEqual(next.poolStates[otherIndex], fresh.poolStates[otherIndex]);
        if (fresh.poolStates[otherIndex].officialIdentityChoices.some((choice) => isDeepStrictEqual(choice.officialIdentityReference, selected.officialIdentityReference))) {
          crossPoolOverlapCount++;
          assert.ok(next.poolStates[otherIndex].officialIdentityChoices.some((choice) => isDeepStrictEqual(choice.officialIdentityReference, selected.officialIdentityReference)));
        }
      }
    }
  }
  assert.ok(crossPoolOverlapCount > 0);
  assert.deepEqual(initializeOmensPackLocalPoolDrawState(tables), initial);
  console.log(packLocalPoolDrawStateAcceptanceMarker);
});
