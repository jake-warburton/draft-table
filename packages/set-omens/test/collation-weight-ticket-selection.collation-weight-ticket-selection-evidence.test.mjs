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
  selectOmensCollationLayoutByTicket,
  selectOmensCollationPoolOfficialIdentityByTicket,
  validateFabEnglishCardDataAgainstSchema
} from "../src/schema-validation.ts";

const variables = ["OMENS_RECIPE_EVIDENCE_PATH", "FAB_CARD_SOURCE_EVIDENCE_PATH", "FAB_CARD_SCHEMA_EVIDENCE_PATH", "FAB_CARD_VAULT_EVIDENCE_PATH"];
const available = variables.every((variable) => Boolean(process.env[variable]));
export const collationWeightedSelectionAcceptanceContractName = "four checksum-verified caller-held sources exhaustively select source-order integer collation weights";
export const collationWeightedSelectionAcceptanceMarker = "COLLATION_WEIGHTED_SELECTION_CONTRACT_EXECUTED";

test(collationWeightedSelectionAcceptanceContractName, { skip: !available ? "four-source collation weighted selection acceptance did not run; use npm run test:collation-weighted-selection-evidence" : false }, () => {
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

  const layoutCounts = new Map(tables.layoutChoices.map((choice) => [choice.layoutReference, 0]));
  for (let ticket = 0; ticket < tables.layoutTotalWeight; ticket++) {
    const choice = selectOmensCollationLayoutByTicket(tables, ticket);
    layoutCounts.set(choice, layoutCounts.get(choice) + 1);
  }
  for (const choice of tables.layoutChoices) assert.equal(layoutCounts.get(choice.layoutReference), choice.weight);

  for (const table of tables.poolTables) {
    const counts = new Map(table.officialIdentityChoices.map((choice) => [choice.officialIdentityReference, 0]));
    for (let ticket = 0; ticket < table.poolTotalWeight; ticket++) {
      const choice = selectOmensCollationPoolOfficialIdentityByTicket(tables, table.poolReference, ticket);
      counts.set(choice, counts.get(choice) + 1);
    }
    for (const choice of table.officialIdentityChoices) assert.equal(counts.get(choice.officialIdentityReference), choice.weight);
  }
  console.log(collationWeightedSelectionAcceptanceMarker);
});
