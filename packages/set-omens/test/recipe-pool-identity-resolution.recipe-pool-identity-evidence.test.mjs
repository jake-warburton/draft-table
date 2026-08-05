import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  parseVerifiedOmensCustomCards,
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
  reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData,
  reconcileOmensRecipeCustomCardsWithOfficialUpstreamIdentities,
  resolveOmensRecipePoolsToDraftableOfficialIdentities,
  validateFabEnglishCardDataAgainstSchema
} from "../src/schema-validation.ts";

const variables = ["OMENS_RECIPE_EVIDENCE_PATH", "FAB_CARD_SOURCE_EVIDENCE_PATH", "FAB_CARD_SCHEMA_EVIDENCE_PATH", "FAB_CARD_VAULT_EVIDENCE_PATH"];
const available = variables.every((variable) => Boolean(process.env[variable]));
export const recipePoolIdentityAcceptanceContractName = "four checksum-verified caller-held sources resolve every validated recipe pool entry to its exact draftable official identity";
export const recipePoolIdentityAcceptanceMarker = "RECIPE_POOL_IDENTITY_RESOLUTION_CONTRACT_EXECUTED";

const poolAggregates = Object.freeze({
  Wizard: [24, 159, "common", "normal"], Illusionist: [24, 160, "common", "normal"], Runeblade: [24, 164, "common", "normal"], Lightning: [42, 227, "common", "normal"],
  Generic: [6, 28, "common", "normal"], Equipment: [14, 148, "common", "normal"], Rare: [60, 120, "rare", "normal"], Majestic: [15, 30, "majestic", "normal"],
  Rfcommon: [105, 105, "common", "rainbow-foil"], RFRare: [59, 59, "rare", "rainbow-foil"], RFMajestic: [7, 7, "majestic", "rainbow-foil"]
});

test(recipePoolIdentityAcceptanceContractName, { skip: !available ? "four-source recipe pool identity acceptance did not run; use npm run test:recipe-pool-identity-evidence" : false }, () => {
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
  const eligibility = classifyOmensOfficialDraftEligibility(identities, official);
  const pools = parseVerifiedOmensPools(verifiedRecipe);
  const resolved = resolveOmensRecipePoolsToDraftableOfficialIdentities(pools, identities, eligibility);

  assert.equal(pools.pools.length, Object.keys(poolAggregates).length);
  assert.equal(resolved.length, pools.pools.length);
  assert.deepEqual(resolved.map((pool) => pool.sourcePoolLabel), pools.pools.map((pool) => pool.name));
  for (let poolIndex = 0; poolIndex < pools.pools.length; poolIndex++) {
    const sourcePool = pools.pools[poolIndex], resultPool = resolved[poolIndex], expected = poolAggregates[sourcePool.name];
    assert.ok(expected); assert.equal(sourcePool.entries.length, expected[0]); assert.equal(sourcePool.entries.reduce((sum, entry) => sum + entry.weight, 0), expected[1]);
    assert.equal(resultPool.fabRarity, expected[2]); assert.equal(resultPool.recipePoolCategory, expected[3]); assert.equal(resultPool.entries.length, sourcePool.entries.length);
    assert.deepEqual(resultPool.entries.map((entry) => entry.weight), sourcePool.entries.map((entry) => entry.weight));
  }
  const normal = resolved.filter((pool) => pool.recipePoolCategory === "normal").flatMap((pool) => pool.entries.map((entry) => entry.officialIdentity));
  const rainbow = resolved.filter((pool) => pool.recipePoolCategory === "rainbow-foil").flatMap((pool) => pool.entries.map((entry) => entry.officialIdentity));
  const key = (identity) => `${identity.baseCollectorId}\u0000${identity.cardUniqueId}`;
  assert.equal(normal.length, identities.mapped.length); assert.equal(new Set(normal.map(key)).size, identities.mapped.length);
  assert.equal(normal.length, 209); assert.equal(rainbow.length, 171); assert.equal(rainbow.every((identity) => new Set(normal.map(key)).has(key(identity))), true);
  const draftable = new Set(eligibility.filter((fact) => fact.draftEligibility === "draftable").map((fact) => `${fact.baseCollectorId}\u0000${fact.officialCardUniqueId}`));
  const rejected = new Set(eligibility.filter((fact) => fact.draftEligibility !== "draftable").map((fact) => `${fact.baseCollectorId}\u0000${fact.officialCardUniqueId}`));
  assert.equal(draftable.size, 209); assert.equal(rejected.size, 51); assert.equal([...normal, ...rainbow].every((identity) => draftable.has(key(identity)) && !rejected.has(key(identity))), true);
  assert.ok(Object.isFrozen(resolved)); assert.ok(resolved.every((pool) => Object.isFrozen(pool) && Object.isFrozen(pool.entries) && pool.entries.every((entry) => Object.isFrozen(entry) && Object.isFrozen(entry.officialIdentity))));
  assert.equal(resolved.filter((pool) => pool.recipePoolCategory === "rainbow-foil").every((pool) => pool.entries.every((entry) => Object.keys(entry.officialIdentity).length === 2)), true);
  console.log(recipePoolIdentityAcceptanceMarker);
});
