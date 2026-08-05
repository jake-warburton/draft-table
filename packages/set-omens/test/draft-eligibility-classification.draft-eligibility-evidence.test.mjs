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
  classifyOmensOfficialDraftEligibility,
  reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData,
  reconcileOmensRecipeCustomCardsWithOfficialUpstreamIdentities,
  validateFabEnglishCardDataAgainstSchema
} from "../src/schema-validation.ts";

const variables = ["OMENS_RECIPE_EVIDENCE_PATH", "FAB_CARD_SOURCE_EVIDENCE_PATH", "FAB_CARD_SCHEMA_EVIDENCE_PATH", "FAB_CARD_VAULT_EVIDENCE_PATH"];
const available = variables.every((variable) => Boolean(process.env[variable]));
export const draftEligibilityAcceptanceContractName = "four checksum-verified caller-held sources establish the captain-approved Omens draft eligibility classification";
export const draftEligibilityAcceptanceMarker = "DRAFT_ELIGIBILITY_CLASSIFICATION_CONTRACT_EXECUTED";

test(draftEligibilityAcceptanceContractName, { skip: !available ? "four-source draft eligibility acceptance did not run; use npm run test:draft-eligibility-evidence" : false }, () => {
  const recipeBytes = readFileSync(process.env.OMENS_RECIPE_EVIDENCE_PATH);
  const cardBytes = readFileSync(process.env.FAB_CARD_SOURCE_EVIDENCE_PATH);
  const schemaBytes = readFileSync(process.env.FAB_CARD_SCHEMA_EVIDENCE_PATH);
  const cardVaultBytes = readFileSync(process.env.FAB_CARD_VAULT_EVIDENCE_PATH);
  const recipe = verifyOmensRecipeBytes(recipeBytes);
  const card = verifyFabEnglishCardBytes(cardBytes);
  const schema = verifyFabCardSchemaBytes(schemaBytes);
  verifyCardVaultOmensProductBytes(cardVaultBytes);
  const documents = validateVerifiedFabCardSourceDocuments(card, schema);
  const official = reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData(
    validateCardVaultOmensOfficialMembership(cardVaultBytes), validateFabEnglishCardDataAgainstSchema(documents.card, documents.schema)
  );
  const identities = reconcileOmensRecipeCustomCardsWithOfficialUpstreamIdentities(parseVerifiedOmensCustomCards(recipe), official);
  const classification = classifyOmensOfficialDraftEligibility(identities, official);

  assert.equal(classification.length, 260);
  assert.equal(classification.filter((entry) => entry.draftEligibility === "draftable").length, 209);
  assert.equal(classification.filter((entry) => entry.draftEligibility === "excluded").length, 9);
  assert.equal(classification.filter((entry) => entry.draftEligibility === "unclassified").length, 42);
  assert.equal(classification.filter((entry) => entry.draftEligibility === "unclassified" && entry.suffixMarker === null).length, 33);
  assert.equal(classification.filter((entry) => entry.draftEligibility === "unclassified" && entry.suffixMarker === "RF").length, 6);
  assert.equal(classification.filter((entry) => entry.draftEligibility === "unclassified" && entry.suffixMarker === "CF").length, 3);
  assert.equal(classification.filter((entry) => entry.draftEligibility === "draftable" && entry.sourceSetMarker === "IAR").length, 0);
  assert.equal(classification.filter((entry) => entry.draftEligibility === "excluded" && entry.sourceSetMarker !== "IAR").length, 0);
  assert.equal(classification.filter((entry) => entry.draftEligibility === "excluded" && entry.classificationBasis === "captain-approved-IAR-exclusion").length, 9);
  assert.equal(classification.filter((entry) => entry.draftEligibility === "draftable" && entry.classificationBasis === "captain-approved-recipe-draftable").length, 209);
  assert.equal(classification.filter((entry) => entry.draftEligibility === "unclassified" && entry.classificationBasis === "recipe-source-absence-open").length, 42);
  console.log(draftEligibilityAcceptanceMarker);
});
