import assert from "node:assert/strict";
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
  initializeOmensPackLocalPoolDrawState, reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData,
  reconcileOmensRecipeCustomCardsWithOfficialUpstreamIdentities, removeOmensPackLocalPoolOfficialIdentity,
  resolveOmensRecipeLayoutsToOfficialIdentityPools, resolveOmensRecipePoolsToDraftableOfficialIdentities,
  selectOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample, validateFabEnglishCardDataAgainstSchema
} from "../src/schema-validation.ts";

const variables = ["OMENS_RECIPE_EVIDENCE_PATH", "FAB_CARD_SOURCE_EVIDENCE_PATH", "FAB_CARD_SCHEMA_EVIDENCE_PATH", "FAB_CARD_VAULT_EVIDENCE_PATH"];
const available = variables.every((variable) => Boolean(process.env[variable]));
export const packLocalPoolSampleSelectionAcceptanceContractName = "four checksum-verified caller-held sources compose one uint32 sample with every current pack-local identity-pool state";
export const packLocalPoolSampleSelectionAcceptanceMarker = "PACK_LOCAL_POOL_SAMPLE_SELECTION_CONTRACT_EXECUTED";
const cutoff = (bound) => UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END % bound;

const assertCurrentPool = (state, poolIndex, removedIdentity) => {
  const pool = state.poolStates[poolIndex], before = structuredClone(state), accepted = cutoff(pool.poolTotalWeight), multiplier = Math.floor(UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END / pool.poolTotalWeight);
  assert.ok(pool.poolTotalWeight > 0); assert.equal(accepted, multiplier * pool.poolTotalWeight);
  assert.equal(UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - accepted, UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END % pool.poolTotalWeight);
  let prior = 0, acceptedPreimages = 0;
  for (const choice of pool.officialIdentityChoices) {
    const first = selectOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample(state, pool.poolReference, prior);
    const last = selectOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample(state, pool.poolReference, choice.cumulativeExclusiveEnd - 1);
    assert.equal(first.state, "selected"); assert.equal(last.state, "selected"); assert.equal(first.officialIdentityReference, choice.officialIdentityReference); assert.equal(last.officialIdentityReference, choice.officialIdentityReference);
    assert.notEqual(first.officialIdentityReference, removedIdentity); assert.notEqual(last.officialIdentityReference, removedIdentity);
    assert.equal(choice.cumulativeExclusiveEnd, prior + choice.weight); acceptedPreimages += choice.weight * multiplier; prior = choice.cumulativeExclusiveEnd;
  }
  assert.equal(prior, pool.poolTotalWeight); assert.equal(acceptedPreimages, accepted);
  const boundary = selectOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample(state, pool.poolReference, accepted - 1);
  assert.equal(boundary.state, "selected"); assert.equal(boundary.officialIdentityReference, pool.officialIdentityChoices.at(-1).officialIdentityReference); assert.notEqual(boundary.officialIdentityReference, removedIdentity);
  if (accepted < UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END) {
    assert.deepEqual(selectOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample(state, pool.poolReference, accepted), { state: "retry" });
    assert.deepEqual(selectOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample(state, pool.poolReference, UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - 1), { state: "retry" });
  } else assert.equal(selectOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample(state, pool.poolReference, UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - 1).state, "selected");
  assert.deepEqual(state, before);
};

test(packLocalPoolSampleSelectionAcceptanceContractName, { skip: !available ? "four-source pack-local sample selection acceptance did not run; use npm run test:pack-local-pool-sample-selection-evidence" : false }, () => {
  const recipeBytes = readFileSync(process.env.OMENS_RECIPE_EVIDENCE_PATH), cardBytes = readFileSync(process.env.FAB_CARD_SOURCE_EVIDENCE_PATH), schemaBytes = readFileSync(process.env.FAB_CARD_SCHEMA_EVIDENCE_PATH), cardVaultBytes = readFileSync(process.env.FAB_CARD_VAULT_EVIDENCE_PATH);
  const recipe = verifyOmensRecipeBytes(recipeBytes), verifiedCard = verifyFabEnglishCardBytes(cardBytes), verifiedSchema = verifyFabCardSchemaBytes(schemaBytes);
  verifyCardVaultOmensProductBytes(cardVaultBytes);
  const documents = validateVerifiedFabCardSourceDocuments(verifiedCard, verifiedSchema), official = reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData(validateCardVaultOmensOfficialMembership(cardVaultBytes), validateFabEnglishCardDataAgainstSchema(documents.card, documents.schema)), identities = reconcileOmensRecipeCustomCardsWithOfficialUpstreamIdentities(parseVerifiedOmensCustomCards(recipe), official), eligibility = classifyOmensOfficialDraftEligibility(identities, official), resolvedPools = resolveOmensRecipePoolsToDraftableOfficialIdentities(parseVerifiedOmensPools(recipe), identities, eligibility), tables = compileOmensCollationWeightTables(resolveOmensRecipeLayoutsToOfficialIdentityPools(parseVerifiedOmensLayouts(recipe), resolvedPools), resolvedPools), initial = initializeOmensPackLocalPoolDrawState(tables);
  assertPackLocalInitialProjectionMatchesCompiledTables(tables, initial); assert.equal(initial.poolStates.length, 11);
  for (let poolIndex = 0; poolIndex < initial.poolStates.length; poolIndex++) {
    const sourcePool = initial.poolStates[poolIndex]; assertCurrentPool(initial, poolIndex);
    for (let choiceIndex = 0; choiceIndex < sourcePool.officialIdentityChoices.length; choiceIndex++) {
      const fresh = initializeOmensPackLocalPoolDrawState(tables), selectedPool = fresh.poolStates[poolIndex], selected = selectedPool.officialIdentityChoices[choiceIndex], next = removeOmensPackLocalPoolOfficialIdentity(fresh, selectedPool.poolReference, selected.officialIdentityReference), output = next.poolStates[poolIndex];
      assert.deepEqual(fresh, initial); if (output.poolTotalWeight === 0) assert.throws(() => selectOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample(next, output.poolReference, 0)); else assertCurrentPool(next, poolIndex, selected.officialIdentityReference);
    }
  }
  console.log(packLocalPoolSampleSelectionAcceptanceMarker);
});
