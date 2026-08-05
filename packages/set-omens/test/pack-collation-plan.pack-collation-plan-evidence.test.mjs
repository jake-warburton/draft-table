import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END } from "@draft-table/engine";
import { assertPackLocalInitialProjectionMatchesCompiledTables } from "./pack-local-pool-draw-state-evidence-assertions.mjs";
import { parseVerifiedOmensCustomCards, parseVerifiedOmensLayouts, parseVerifiedOmensPools, validateCardVaultOmensOfficialMembership, validateVerifiedFabCardSourceDocuments, verifyCardVaultOmensProductBytes, verifyFabCardSchemaBytes, verifyFabEnglishCardBytes, verifyOmensRecipeBytes } from "../src/index.ts";
import { classifyOmensOfficialDraftEligibility, compileOmensCollationWeightTables, initializeOmensPackCollationPlanFromOneUnsigned32Sample, readOmensPackCollationPlanLayoutForTransition, readOmensPackCollationPlanNextPositionForTransition, readOmensPackCollationPlanPoolDrawStateForTransition, reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData, reconcileOmensRecipeCustomCardsWithOfficialUpstreamIdentities, resolveOmensRecipeLayoutsToOfficialIdentityPools, resolveOmensRecipePoolsToDraftableOfficialIdentities, validateFabEnglishCardDataAgainstSchema } from "../src/schema-validation.ts";

const variables = ["OMENS_RECIPE_EVIDENCE_PATH", "FAB_CARD_SOURCE_EVIDENCE_PATH", "FAB_CARD_SCHEMA_EVIDENCE_PATH", "FAB_CARD_VAULT_EVIDENCE_PATH"];
const available = variables.every((variable) => Boolean(process.env[variable]));
export const packCollationPlanAcceptanceContractName = "four checksum-verified caller-held sources initialize every selected Omens collation layout with a fresh exact all-pool plan";
export const packCollationPlanAcceptanceMarker = "PACK_COLLATION_PLAN_INITIALIZATION_CONTRACT_EXECUTED";
const cutoff = (bound) => UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END % bound;

test(packCollationPlanAcceptanceContractName, { skip: !available ? "four-source pack collation plan acceptance did not run; use npm run test:pack-collation-plan-evidence" : false }, () => {
  const recipe = verifyOmensRecipeBytes(readFileSync(process.env.OMENS_RECIPE_EVIDENCE_PATH)), cardBytes = readFileSync(process.env.FAB_CARD_SOURCE_EVIDENCE_PATH), schemaBytes = readFileSync(process.env.FAB_CARD_SCHEMA_EVIDENCE_PATH), cardVaultBytes = readFileSync(process.env.FAB_CARD_VAULT_EVIDENCE_PATH), documents = validateVerifiedFabCardSourceDocuments(verifyFabEnglishCardBytes(cardBytes), verifyFabCardSchemaBytes(schemaBytes));
  verifyCardVaultOmensProductBytes(cardVaultBytes);
  const official = reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData(validateCardVaultOmensOfficialMembership(cardVaultBytes), validateFabEnglishCardDataAgainstSchema(documents.card, documents.schema)), identities = reconcileOmensRecipeCustomCardsWithOfficialUpstreamIdentities(parseVerifiedOmensCustomCards(recipe), official), eligibility = classifyOmensOfficialDraftEligibility(identities, official), pools = resolveOmensRecipePoolsToDraftableOfficialIdentities(parseVerifiedOmensPools(recipe), identities, eligibility), tables = compileOmensCollationWeightTables(resolveOmensRecipeLayoutsToOfficialIdentityPools(parseVerifiedOmensLayouts(recipe), pools), pools), accepted = cutoff(tables.layoutTotalWeight);
  assert.equal(tables.layoutChoices.length, 228);
  for (let index = 0; index < tables.layoutChoices.length; index++) {
    const choice = tables.layoutChoices[index], first = index === 0 ? 0 : tables.layoutChoices[index - 1].cumulativeExclusiveEnd;
    for (const sample of [first, choice.cumulativeExclusiveEnd - 1]) {
      const result = initializeOmensPackCollationPlanFromOneUnsigned32Sample(tables, sample); assert.equal(result.state, "selected"); assert.equal(result.layoutReference, choice.layoutReference); assert.equal(readOmensPackCollationPlanLayoutForTransition(result.plan), choice.layoutReference); assert.equal(readOmensPackCollationPlanNextPositionForTransition(result.plan), 0); assertPackLocalInitialProjectionMatchesCompiledTables(tables, readOmensPackCollationPlanPoolDrawStateForTransition(result.plan));
    }
  }
  const first = initializeOmensPackCollationPlanFromOneUnsigned32Sample(tables, 0), second = initializeOmensPackCollationPlanFromOneUnsigned32Sample(tables, 0); assert.notEqual(first.plan, second.plan); assert.notEqual(readOmensPackCollationPlanPoolDrawStateForTransition(first.plan), readOmensPackCollationPlanPoolDrawStateForTransition(second.plan)); assert.deepEqual(initializeOmensPackCollationPlanFromOneUnsigned32Sample(tables, accepted), { state: "retry" }); console.log(packCollationPlanAcceptanceMarker);
});
