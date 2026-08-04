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
  reconcileOmensRecipeRaritiesWithOfficialUpstreamPrintings,
  validateFabEnglishCardDataAgainstSchema
} from "../src/schema-validation.ts";

const variables = ["OMENS_RECIPE_EVIDENCE_PATH", "FAB_CARD_SOURCE_EVIDENCE_PATH", "FAB_CARD_SCHEMA_EVIDENCE_PATH", "FAB_CARD_VAULT_EVIDENCE_PATH"];
const available = variables.every((variable) => Boolean(process.env[variable]));
export const recipeRarityAcceptanceContractName = "four checksum-verified caller-held sources establish the accepted recipe rarity correspondence";
export const recipeRarityAcceptanceMarker = "RECIPE_RARITY_CORRESPONDENCE_CONTRACT_EXECUTED";

test(recipeRarityAcceptanceContractName, { skip: !available ? "four-source recipe rarity acceptance did not run; use npm run test:recipe-rarity-evidence" : false }, () => {
  const recipeBytes = readFileSync(process.env.OMENS_RECIPE_EVIDENCE_PATH);
  const cardBytes = readFileSync(process.env.FAB_CARD_SOURCE_EVIDENCE_PATH);
  const schemaBytes = readFileSync(process.env.FAB_CARD_SCHEMA_EVIDENCE_PATH);
  const cardVaultBytes = readFileSync(process.env.FAB_CARD_VAULT_EVIDENCE_PATH);

  const verifiedRecipe = verifyOmensRecipeBytes(recipeBytes);
  const verifiedCard = verifyFabEnglishCardBytes(cardBytes);
  const verifiedSchema = verifyFabCardSchemaBytes(schemaBytes);
  verifyCardVaultOmensProductBytes(cardVaultBytes);
  const documents = validateVerifiedFabCardSourceDocuments(verifiedCard, verifiedSchema);
  const official = reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData(
    validateCardVaultOmensOfficialMembership(cardVaultBytes), validateFabEnglishCardDataAgainstSchema(documents.card, documents.schema)
  );
  const identities = reconcileOmensRecipeCustomCardsWithOfficialUpstreamIdentities(parseVerifiedOmensCustomCards(verifiedRecipe), official);
  const correspondence = reconcileOmensRecipeRaritiesWithOfficialUpstreamPrintings(identities, official);

  assert.equal(correspondence.length, 209);
  assert.equal(correspondence.filter((entry) => entry.recipeRarityLabel === "mythic").length, 15);
  assert.equal(correspondence.filter((entry) => entry.recipeRarityLabel === "majestic").length, 0);
  assert.equal(correspondence.filter((entry) => entry.fabRarity === "majestic").length, 15);
  assert.deepEqual(correspondence.map((entry) => entry.recipeCollectorNumber), identities.mapped.map((entry) => entry.recipeCollectorNumber));
  assert.equal(correspondence.filter((entry) => entry.observedCorrespondenceClass === "exact-common-C").length, 132);
  assert.equal(correspondence.filter((entry) => entry.observedCorrespondenceClass === "pinned-common-C-V-anomaly").length, 2);
  assert.equal(correspondence.filter((entry) => entry.observedCorrespondenceClass === "exact-rare-R").length, 60);
  assert.equal(correspondence.filter((entry) => entry.observedCorrespondenceClass === "exact-majestic-M" && entry.recipeRarityLabel === "mythic" && entry.fabRarity === "majestic").length, 15);
  const anomalies = correspondence.filter((entry) => entry.requiresDraftabilityTreatmentClassification);
  assert.deepEqual(new Set(anomalies.map((entry) => entry.officialPrintId)), new Set(["OMN199", "OMN201"]));
  assert.ok(anomalies.every((entry) => entry.recipeRarityLabel === "common" && entry.exactUpstreamRarityStrings.length === 2 && new Set(entry.exactUpstreamRarityStrings).has("C") && new Set(entry.exactUpstreamRarityStrings).has("V")));
  assert.ok(correspondence.filter((entry) => !entry.requiresDraftabilityTreatmentClassification).every((entry) => entry.exactUpstreamRarityStrings.length === 1));
  console.log(recipeRarityAcceptanceMarker);
});
