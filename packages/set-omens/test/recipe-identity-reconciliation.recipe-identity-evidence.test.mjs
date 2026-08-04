import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  parseVerifiedOmensCustomCards,
  validateCardVaultOmensOfficialMembership,
  validateVerifiedFabCardSourceDocuments,
  verifyCardVaultOmensProductBytes,
  verifyFabCardSchemaBytes,
  verifyFabEnglishCardBytes,
  verifyOmensRecipeBytes
} from "../src/index.ts";
import {
  reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData,
  reconcileOmensRecipeCustomCardsWithOfficialUpstreamIdentities,
  validateFabEnglishCardDataAgainstSchema
} from "../src/schema-validation.ts";

const variables = [
  "OMENS_RECIPE_EVIDENCE_PATH",
  "FAB_CARD_SOURCE_EVIDENCE_PATH",
  "FAB_CARD_SCHEMA_EVIDENCE_PATH",
  "FAB_CARD_VAULT_EVIDENCE_PATH"
];
const available = variables.every((variable) => Boolean(process.env[variable]));

export const recipeIdentityAcceptanceContractName = "four checksum-verified caller-held sources establish the accepted recipe identity partition";
export const recipeIdentityAcceptanceMarker = "RECIPE_IDENTITY_RECONCILIATION_CONTRACT_EXECUTED";

test(recipeIdentityAcceptanceContractName, {
  skip: !available ? "four-source recipe identity acceptance did not run; use npm run test:recipe-identity-evidence" : false
}, () => {
  const recipeBytes = readFileSync(process.env.OMENS_RECIPE_EVIDENCE_PATH);
  const cardBytes = readFileSync(process.env.FAB_CARD_SOURCE_EVIDENCE_PATH);
  const schemaBytes = readFileSync(process.env.FAB_CARD_SCHEMA_EVIDENCE_PATH);
  const cardVaultBytes = readFileSync(process.env.FAB_CARD_VAULT_EVIDENCE_PATH);

  const verifiedRecipe = verifyOmensRecipeBytes(recipeBytes);
  const verifiedCard = verifyFabEnglishCardBytes(cardBytes);
  const verifiedSchema = verifyFabCardSchemaBytes(schemaBytes);
  verifyCardVaultOmensProductBytes(cardVaultBytes);

  const recipe = parseVerifiedOmensCustomCards(verifiedRecipe);
  const documents = validateVerifiedFabCardSourceDocuments(verifiedCard, verifiedSchema);
  const schemaValidated = validateFabEnglishCardDataAgainstSchema(documents.card, documents.schema);
  const official = reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData(
    validateCardVaultOmensOfficialMembership(cardVaultBytes),
    schemaValidated
  );
  const result = reconcileOmensRecipeCustomCardsWithOfficialUpstreamIdentities(recipe, official);

  assert.equal(result.mapped.length, 209);
  assert.equal(new Set(result.mapped.map((entry) => entry.recipeName)).size, 209);
  assert.equal(new Set(result.mapped.map((entry) => entry.recipeCollectorNumber)).size, 209);
  assert.equal(new Set(result.mapped.map((entry) => entry.officialPrintId)).size, 209);
  assert.equal(result.unmapped.length, 51);
  assert.equal(result.unmapped.filter((entry) => entry.sourceSetMarker === "OMN").length, 42);
  assert.equal(result.unmapped.filter((entry) => entry.sourceSetMarker === "IAR").length, 9);
  assert.equal(result.unmapped.filter((entry) => entry.suffixMarker === null).length, 33);
  assert.equal(result.unmapped.filter((entry) => entry.suffixMarker === "RF").length, 6);
  assert.equal(result.unmapped.filter((entry) => entry.suffixMarker === "CF").length, 3);
  assert.equal(result.unmapped.filter((entry) => entry.suffixMarker === "MV").length, 9);
  const partition = [...result.mapped.map((entry) => entry.officialPrintId), ...result.unmapped.map((entry) => entry.officialPrintId)];
  assert.equal(partition.length, 260);
  assert.equal(new Set(partition).size, 260);
  assert.deepEqual(new Set(partition), new Set(official.map((entry) => entry.officialPrintId)));
  console.log(recipeIdentityAcceptanceMarker);
});
