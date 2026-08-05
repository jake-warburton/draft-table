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
const MAPPED_SOURCE_ORDER_RARITY_CODE_SEQUENCE_COUNTS = Object.freeze({ "C,C": 117, "R,R": 59, "M,M": 15, C: 15, "C,V": 2, R: 1 });
const MAPPED_SOURCE_ORDER_RARITY_CODE_SEQUENCE_IDENTITY_TOTAL = 209;
const MAPPED_SOURCE_ORDER_RARITY_CODE_SEQUENCE_REPEATED_CODE_IDENTITY_TOTAL = 191;
const MAPPED_FIRST_OBSERVED_UNIQUE_RARITY_CODE_SET_COUNTS = Object.freeze({ C: 132, R: 60, M: 15, "C,V": 2 });

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

  assert.equal(correspondence.length, MAPPED_SOURCE_ORDER_RARITY_CODE_SEQUENCE_IDENTITY_TOTAL);
  const mappedSourceOrderRarityCodeSequenceCounts = Object.fromEntries([...correspondence.reduce((counts, entry) => {
    const key = entry.sourceOrderUpstreamRarityCodeSequence.join(","); return counts.set(key, (counts.get(key) ?? 0) + 1);
  }, new Map()).entries()].sort(([left], [right]) => left.localeCompare(right)));
  const mappedFirstObservedUniqueRarityCodeSetCounts = Object.fromEntries([...correspondence.reduce((counts, entry) => {
    const key = [...entry.firstObservedUniqueUpstreamRarityCodeSet].sort().join(","); return counts.set(key, (counts.get(key) ?? 0) + 1);
  }, new Map()).entries()].sort(([left], [right]) => left.localeCompare(right)));
  assert.deepEqual(mappedSourceOrderRarityCodeSequenceCounts, MAPPED_SOURCE_ORDER_RARITY_CODE_SEQUENCE_COUNTS);
  assert.deepEqual(mappedFirstObservedUniqueRarityCodeSetCounts, MAPPED_FIRST_OBSERVED_UNIQUE_RARITY_CODE_SET_COUNTS);
  assert.equal(correspondence.filter((entry) => entry.sourceOrderUpstreamRarityCodeSequence.length > entry.firstObservedUniqueUpstreamRarityCodeSet.length).length, MAPPED_SOURCE_ORDER_RARITY_CODE_SEQUENCE_REPEATED_CODE_IDENTITY_TOTAL);
  assert.equal(MAPPED_SOURCE_ORDER_RARITY_CODE_SEQUENCE_COUNTS["C,C"] + MAPPED_SOURCE_ORDER_RARITY_CODE_SEQUENCE_COUNTS.C, MAPPED_FIRST_OBSERVED_UNIQUE_RARITY_CODE_SET_COUNTS.C);
  assert.equal(correspondence.filter((entry) => entry.recipeRarityLabel === "mythic").length, 15);
  assert.equal(correspondence.filter((entry) => entry.recipeRarityLabel === "majestic").length, 0);
  assert.equal(correspondence.filter((entry) => entry.fabRarity === "majestic").length, 15);
  assert.deepEqual(correspondence.map((entry) => entry.recipeCollectorNumber), identities.mapped.map((entry) => entry.recipeCollectorNumber));
  const officialIarIds = new Set(official.filter((entry) => entry.sourceSetMarker === "IAR").map((entry) => entry.officialPrintId));
  const mappedIds = new Set(identities.mapped.map((entry) => entry.officialPrintId));
  const unmappedIarIds = new Set(identities.unmapped.filter((entry) => entry.sourceSetMarker === "IAR").map((entry) => entry.officialPrintId));
  assert.equal(officialIarIds.size, 9);
  assert.equal([...officialIarIds].filter((id) => mappedIds.has(id)).length, 0);
  assert.deepEqual(unmappedIarIds, officialIarIds);
  assert.equal(identities.unmapped.filter((entry) => entry.sourceSetMarker === "IAR").length, 9);
  assert.equal(correspondence.filter((entry) => entry.observedCorrespondenceClass === "exact-common-C").length, 132);
  assert.equal(correspondence.filter((entry) => entry.observedCorrespondenceClass === "pinned-common-C-V-anomaly").length, 2);
  assert.equal(correspondence.filter((entry) => entry.observedCorrespondenceClass === "exact-rare-R").length, 60);
  assert.equal(correspondence.filter((entry) => entry.observedCorrespondenceClass === "exact-majestic-M" && entry.recipeRarityLabel === "mythic" && entry.fabRarity === "majestic").length, 15);
  const anomalies = correspondence.filter((entry) => entry.requiresDraftabilityTreatmentClassification);
  assert.deepEqual(new Set(anomalies.map((entry) => entry.officialPrintId)), new Set(["OMN199", "OMN201"]));
  assert.ok(anomalies.every((entry) => entry.recipeRarityLabel === "common" && entry.sourceOrderUpstreamRarityCodeSequence.join(",") === "C,V" && entry.firstObservedUniqueUpstreamRarityCodeSet.join(",") === "C,V"));
  assert.ok(correspondence.filter((entry) => !entry.requiresDraftabilityTreatmentClassification).every((entry) => entry.firstObservedUniqueUpstreamRarityCodeSet.length === 1));
  console.log(recipeRarityAcceptanceMarker);
});
