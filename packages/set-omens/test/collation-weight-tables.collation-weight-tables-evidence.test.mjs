import assert from "node:assert/strict";
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
  reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData,
  reconcileOmensRecipeCustomCardsWithOfficialUpstreamIdentities,
  resolveOmensRecipeLayoutsToOfficialIdentityPools,
  resolveOmensRecipePoolsToDraftableOfficialIdentities,
  validateFabEnglishCardDataAgainstSchema
} from "../src/schema-validation.ts";

const variables = ["OMENS_RECIPE_EVIDENCE_PATH", "FAB_CARD_SOURCE_EVIDENCE_PATH", "FAB_CARD_SCHEMA_EVIDENCE_PATH", "FAB_CARD_VAULT_EVIDENCE_PATH"];
const available = variables.every((variable) => Boolean(process.env[variable]));
export const collationWeightTablesAcceptanceContractName = "four checksum-verified caller-held sources compile exact source-order integer collation weight tables";
export const collationWeightTablesAcceptanceMarker = "COLLATION_WEIGHT_TABLES_CONTRACT_EXECUTED";

test(collationWeightTablesAcceptanceContractName, { skip: !available ? "four-source collation weight tables acceptance did not run; use npm run test:collation-weight-tables-evidence" : false }, () => {
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

  assert.equal(tables.layoutChoices.length, 228);
  assert.equal(tables.layoutTotalWeight, 460800);
  assert.equal(tables.layoutChoices.at(-1).cumulativeExclusiveEnd, tables.layoutTotalWeight);
  assert.equal(tables.poolTables.length, 11);
  assert.equal(tables.layoutChoices.every((choice, index) => choice.layoutReference === resolvedLayouts.layouts[index] &&
    choice.cumulativeExclusiveEnd === (index === 0 ? choice.weight : tables.layoutChoices[index - 1].cumulativeExclusiveEnd + choice.weight)), true);
  assert.equal(tables.poolTables.every((table, index) => table.poolReference === resolvedPools[index] &&
    table.officialIdentityChoices.at(-1).cumulativeExclusiveEnd === table.poolTotalWeight &&
    table.officialIdentityChoices.every((choice, choiceIndex) => choice.officialIdentityReference === resolvedPools[index].entries[choiceIndex].officialIdentity)), true);
  assert.ok(Object.isFrozen(tables)); assert.ok(Object.isFrozen(tables.layoutChoices)); assert.ok(Object.isFrozen(tables.poolTables));
  console.log(collationWeightTablesAcceptanceMarker);
});
