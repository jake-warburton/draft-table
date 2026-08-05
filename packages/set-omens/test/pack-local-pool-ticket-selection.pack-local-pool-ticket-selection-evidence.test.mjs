import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assertPackLocalInitialProjectionMatchesCompiledTables } from "./pack-local-pool-draw-state-evidence-assertions.mjs";
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
  selectOmensPackLocalPoolOfficialIdentityByTicket,
  validateFabEnglishCardDataAgainstSchema
} from "../src/schema-validation.ts";

const variables = ["OMENS_RECIPE_EVIDENCE_PATH", "FAB_CARD_SOURCE_EVIDENCE_PATH", "FAB_CARD_SCHEMA_EVIDENCE_PATH", "FAB_CARD_VAULT_EVIDENCE_PATH"];
const available = variables.every((variable) => Boolean(process.env[variable]));
export const packLocalPoolTicketSelectionAcceptanceContractName = "four checksum-verified caller-held sources enforce dynamic pack-local ticket selection across every remaining identity-pool entry";
export const packLocalPoolTicketSelectionAcceptanceMarker = "PACK_LOCAL_POOL_TICKET_SELECTION_CONTRACT_EXECUTED";

const assertPoolHistogramAndBoundaries = (state, poolIndex, removedIdentity) => {
  const pool = state.poolStates[poolIndex], counts = new Map(pool.officialIdentityChoices.map((choice) => [choice.officialIdentityReference, 0]));
  let priorEnd = 0;
  for (const choice of pool.officialIdentityChoices) {
    assert.equal(selectOmensPackLocalPoolOfficialIdentityByTicket(state, pool.poolReference, priorEnd), choice.officialIdentityReference);
    assert.equal(selectOmensPackLocalPoolOfficialIdentityByTicket(state, pool.poolReference, choice.cumulativeExclusiveEnd - 1), choice.officialIdentityReference);
    assert.equal(choice.cumulativeExclusiveEnd, priorEnd + choice.weight); priorEnd = choice.cumulativeExclusiveEnd;
  }
  assert.equal(priorEnd, pool.poolTotalWeight);
  for (let ticket = 0; ticket < pool.poolTotalWeight; ticket++) {
    const identity = selectOmensPackLocalPoolOfficialIdentityByTicket(state, pool.poolReference, ticket);
    counts.set(identity, counts.get(identity) + 1); assert.notEqual(identity, removedIdentity);
  }
  for (const choice of pool.officialIdentityChoices) assert.equal(counts.get(choice.officialIdentityReference), choice.weight);
  assert.equal(counts.get(removedIdentity) ?? 0, 0);
};

test(packLocalPoolTicketSelectionAcceptanceContractName, { skip: !available ? "four-source pack-local ticket selection acceptance did not run; use npm run test:pack-local-pool-ticket-selection-evidence" : false }, () => {
  const recipeBytes = readFileSync(process.env.OMENS_RECIPE_EVIDENCE_PATH);
  const cardBytes = readFileSync(process.env.FAB_CARD_SOURCE_EVIDENCE_PATH);
  const schemaBytes = readFileSync(process.env.FAB_CARD_SCHEMA_EVIDENCE_PATH);
  const cardVaultBytes = readFileSync(process.env.FAB_CARD_VAULT_EVIDENCE_PATH);
  const recipe = verifyOmensRecipeBytes(recipeBytes), verifiedCard = verifyFabEnglishCardBytes(cardBytes), verifiedSchema = verifyFabCardSchemaBytes(schemaBytes);
  verifyCardVaultOmensProductBytes(cardVaultBytes);
  const documents = validateVerifiedFabCardSourceDocuments(verifiedCard, verifiedSchema);
  const official = reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData(validateCardVaultOmensOfficialMembership(cardVaultBytes), validateFabEnglishCardDataAgainstSchema(documents.card, documents.schema));
  const identities = reconcileOmensRecipeCustomCardsWithOfficialUpstreamIdentities(parseVerifiedOmensCustomCards(recipe), official);
  const eligibility = classifyOmensOfficialDraftEligibility(identities, official);
  const resolvedPools = resolveOmensRecipePoolsToDraftableOfficialIdentities(parseVerifiedOmensPools(recipe), identities, eligibility);
  const tables = compileOmensCollationWeightTables(resolveOmensRecipeLayoutsToOfficialIdentityPools(parseVerifiedOmensLayouts(recipe), resolvedPools), resolvedPools);
  const initial = initializeOmensPackLocalPoolDrawState(tables);

  assertPackLocalInitialProjectionMatchesCompiledTables(tables, initial);
  assert.equal(initial.poolStates.length, 11);
  for (let poolIndex = 0; poolIndex < initial.poolStates.length; poolIndex++) {
    const sourcePool = initial.poolStates[poolIndex]; assertPoolHistogramAndBoundaries(initial, poolIndex);
    for (let choiceIndex = 0; choiceIndex < sourcePool.officialIdentityChoices.length; choiceIndex++) {
      const fresh = initializeOmensPackLocalPoolDrawState(tables), selectedPool = fresh.poolStates[poolIndex], selected = selectedPool.officialIdentityChoices[choiceIndex];
      const next = removeOmensPackLocalPoolOfficialIdentity(fresh, selectedPool.poolReference, selected.officialIdentityReference), output = next.poolStates[poolIndex];
      assert.equal(output.poolReference, selectedPool.poolReference); assert.equal(output.poolTotalWeight, selectedPool.poolTotalWeight - selected.weight);
      assert.deepEqual(output.officialIdentityChoices.map((choice) => [choice.officialIdentityReference, choice.weight]), selectedPool.officialIdentityChoices.filter((_, index) => index !== choiceIndex).map((choice) => [choice.officialIdentityReference, choice.weight]));
      if (output.poolTotalWeight === 0) assert.throws(() => selectOmensPackLocalPoolOfficialIdentityByTicket(next, output.poolReference, 0));
      else assertPoolHistogramAndBoundaries(next, poolIndex, selected.officialIdentityReference);
    }
  }
  console.log(packLocalPoolTicketSelectionAcceptanceMarker);
});
