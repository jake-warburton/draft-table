import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END } from "@draft-table/engine";
import { assertPackLocalInitialProjectionMatchesCompiledTables } from "./pack-local-pool-draw-state-evidence-assertions.mjs";
import { parseVerifiedOmensCustomCards, parseVerifiedOmensLayouts, parseVerifiedOmensPools, validateCardVaultOmensOfficialMembership, validateVerifiedFabCardSourceDocuments, verifyCardVaultOmensProductBytes, verifyFabCardSchemaBytes, verifyFabEnglishCardBytes, verifyOmensRecipeBytes } from "../src/index.ts";
import { classifyOmensOfficialDraftEligibility, compileOmensCollationWeightTables, initializeOmensPackCollationPlanFromUnsigned32SampleBatch, readOmensPackCollationPlanLayoutForTransition, readOmensPackCollationPlanNextPositionForTransition, readOmensPackCollationPlanPoolDrawStateForTransition, reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData, reconcileOmensRecipeCustomCardsWithOfficialUpstreamIdentities, resolveOmensRecipeLayoutsToOfficialIdentityPools, resolveOmensRecipePoolsToDraftableOfficialIdentities, validateFabEnglishCardDataAgainstSchema } from "../src/schema-validation.ts";

const variables = ["OMENS_RECIPE_EVIDENCE_PATH", "FAB_CARD_SOURCE_EVIDENCE_PATH", "FAB_CARD_SCHEMA_EVIDENCE_PATH", "FAB_CARD_VAULT_EVIDENCE_PATH"];
const available = variables.every((variable) => Boolean(process.env[variable]));
export const finiteBatchCollationPlanAcceptanceContractName = "four checksum-verified caller-held sources initialize every Omens layout-bound fresh plan from finite batches";
export const finiteBatchCollationPlanAcceptanceMarker = "FINITE_BATCH_COLLATION_PLAN_INITIALIZATION_CONTRACT_EXECUTED";
const cutoff = (bound) => UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END % bound;

const assertLayoutPositions = (layout) => {
  assert.equal(layout.slots.length, 14);
  for (let index = 0; index < layout.slots.length; index++) {
    const position = layout.slots[index];
    assert.equal(position.position, index + 1);
    assert.ok(Object.isFrozen(position));
    assert.ok(Object.isFrozen(position.resolvedPool));
  }
};

test(finiteBatchCollationPlanAcceptanceContractName, { skip: !available ? "four-source finite batch collation plan acceptance did not run; use npm run test:finite-batch-collation-plan-evidence" : false }, () => {
  const recipe = verifyOmensRecipeBytes(readFileSync(process.env.OMENS_RECIPE_EVIDENCE_PATH)), cardBytes = readFileSync(process.env.FAB_CARD_SOURCE_EVIDENCE_PATH), schemaBytes = readFileSync(process.env.FAB_CARD_SCHEMA_EVIDENCE_PATH), cardVaultBytes = readFileSync(process.env.FAB_CARD_VAULT_EVIDENCE_PATH), documents = validateVerifiedFabCardSourceDocuments(verifyFabEnglishCardBytes(cardBytes), verifyFabCardSchemaBytes(schemaBytes));
  verifyCardVaultOmensProductBytes(cardVaultBytes);
  const official = reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData(validateCardVaultOmensOfficialMembership(cardVaultBytes), validateFabEnglishCardDataAgainstSchema(documents.card, documents.schema)), identities = reconcileOmensRecipeCustomCardsWithOfficialUpstreamIdentities(parseVerifiedOmensCustomCards(recipe), official), eligibility = classifyOmensOfficialDraftEligibility(identities, official), pools = resolveOmensRecipePoolsToDraftableOfficialIdentities(parseVerifiedOmensPools(recipe), identities, eligibility), tables = compileOmensCollationWeightTables(resolveOmensRecipeLayoutsToOfficialIdentityPools(parseVerifiedOmensLayouts(recipe), pools), pools), retry = cutoff(tables.layoutTotalWeight);
  assert.equal(tables.layoutChoices.length, 228);
  assert.deepEqual(initializeOmensPackCollationPlanFromUnsigned32SampleBatch(tables, []), { state: "needs-sample", consumedSamples: 0 });
  assert.deepEqual(initializeOmensPackCollationPlanFromUnsigned32SampleBatch(tables, [retry]), { state: "needs-sample", consumedSamples: 1 });
  for (let index = 0; index < tables.layoutChoices.length; index++) {
    const choice = tables.layoutChoices[index], firstTicket = index === 0 ? 0 : tables.layoutChoices[index - 1].cumulativeExclusiveEnd, lastTicket = choice.cumulativeExclusiveEnd - 1;
    for (const batch of [[retry, firstTicket], [retry, lastTicket]]) {
      const result = initializeOmensPackCollationPlanFromUnsigned32SampleBatch(tables, batch);
      assert.equal(result.state, "selected");
      assert.equal(result.consumedSamples, 2);
      assert.equal(result.layoutReference, choice.layoutReference);
      assert.equal(readOmensPackCollationPlanLayoutForTransition(result.plan), choice.layoutReference);
      assert.equal(readOmensPackCollationPlanNextPositionForTransition(result.plan), 0);
      assertLayoutPositions(result.layoutReference);
      assertPackLocalInitialProjectionMatchesCompiledTables(tables, readOmensPackCollationPlanPoolDrawStateForTransition(result.plan));
    }
  }
  console.log(finiteBatchCollationPlanAcceptanceMarker);
});
