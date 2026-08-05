import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END } from "@draft-table/engine";
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
  reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData,
  reconcileOmensRecipeCustomCardsWithOfficialUpstreamIdentities,
  resolveOmensRecipeLayoutsToOfficialIdentityPools,
  resolveOmensRecipePoolsToDraftableOfficialIdentities,
  selectOmensCollationLayoutFromOneUnsigned32Sample,
  selectOmensCollationPoolOfficialIdentityFromOneUnsigned32Sample,
  validateFabEnglishCardDataAgainstSchema
} from "../src/schema-validation.ts";

const variables = ["OMENS_RECIPE_EVIDENCE_PATH", "FAB_CARD_SOURCE_EVIDENCE_PATH", "FAB_CARD_SCHEMA_EVIDENCE_PATH", "FAB_CARD_VAULT_EVIDENCE_PATH"];
const available = variables.every((variable) => Boolean(process.env[variable]));
export const collationSampleSelectionAcceptanceContractName = "four checksum-verified caller-held sources compose one uint32 sample with every exact collation scope";
export const collationSampleSelectionAcceptanceMarker = "COLLATION_SAMPLE_SELECTION_CONTRACT_EXECUTED";
const cutoff = (total) => UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END % total;

const assertScope = (total, choices, select) => {
  const ticketPreimages = Math.floor(UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END / total);
  assert.equal(cutoff(total), ticketPreimages * total);
  assert.equal(UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - cutoff(total), UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END % total);
  assert.ok(UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END % total > 0);
  let priorEnd = 0;
  for (const choice of choices) {
    assert.equal(select(priorEnd).state, "selected");
    assert.equal(select(priorEnd).reference, choice.reference);
    assert.equal(select(choice.cumulativeExclusiveEnd - 1).reference, choice.reference);
    assert.equal(choice.weight * ticketPreimages, (choice.cumulativeExclusiveEnd - priorEnd) * ticketPreimages);
    priorEnd = choice.cumulativeExclusiveEnd;
  }
  assert.equal(priorEnd, total);
  assert.equal(choices.reduce((sum, choice) => sum + choice.weight * ticketPreimages, 0), cutoff(total));
  assert.equal(select(cutoff(total) - 1).reference, choices.at(-1).reference);
  assert.deepEqual(select(cutoff(total)), { state: "retry" });
  assert.deepEqual(select(UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - 1), { state: "retry" });
};

test(collationSampleSelectionAcceptanceContractName, { skip: !available ? "four-source collation sample selection acceptance did not run; use npm run test:collation-sample-selection-evidence" : false }, () => {
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
  const sourcePools = parseVerifiedOmensPools(recipe), resolvedPools = resolveOmensRecipePoolsToDraftableOfficialIdentities(sourcePools, identities, eligibility);
  const resolvedLayouts = resolveOmensRecipeLayoutsToOfficialIdentityPools(parseVerifiedOmensLayouts(recipe), resolvedPools);
  const tables = compileOmensCollationWeightTables(resolvedLayouts, resolvedPools);

  assert.equal(tables.layoutTotalWeight, 460_800);
  assert.equal(tables.poolTables.length, 11);
  assertScope(tables.layoutTotalWeight, tables.layoutChoices.map((choice) => ({ ...choice, reference: choice.layoutReference })), (sample) => {
    const result = selectOmensCollationLayoutFromOneUnsigned32Sample(tables, sample);
    return result.state === "retry" ? result : { state: result.state, reference: result.layoutReference };
  });
  for (const table of tables.poolTables) {
    assertScope(table.poolTotalWeight, table.officialIdentityChoices.map((choice) => ({ ...choice, reference: choice.officialIdentityReference })), (sample) => {
      const result = selectOmensCollationPoolOfficialIdentityFromOneUnsigned32Sample(tables, table.poolReference, sample);
      return result.state === "retry" ? result : { state: result.state, reference: result.officialIdentityReference };
    });
  }
  console.log(collationSampleSelectionAcceptanceMarker);
});
