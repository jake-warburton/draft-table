import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  parseVerifiedOmensCustomCards,
  parseVerifiedOmensLayouts,
  parseVerifiedOmensPools,
  parseVerifiedOmensSettings,
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
  resolveOmensRecipeLayoutsToOfficialIdentityPools,
  resolveOmensRecipePoolsToDraftableOfficialIdentities,
  validateFabEnglishCardDataAgainstSchema
} from "../src/schema-validation.ts";

const variables = ["OMENS_RECIPE_EVIDENCE_PATH", "FAB_CARD_SOURCE_EVIDENCE_PATH", "FAB_CARD_SCHEMA_EVIDENCE_PATH", "FAB_CARD_VAULT_EVIDENCE_PATH"];
const available = variables.every((variable) => Boolean(process.env[variable]));
export const recipeLayoutPoolResolutionAcceptanceContractName = "four checksum-verified caller-held sources resolve all exact weighted layout slots through their capability-owned official-identity pools";
export const recipeLayoutPoolResolutionAcceptanceMarker = "RECIPE_LAYOUT_POOL_RESOLUTION_CONTRACT_EXECUTED";
const coefficients = Object.freeze({ "Rare/Rfcommon": 1411, "Rare/RFRare": 255, "Rare/RFMajestic": 34, "Majestic/Rfcommon": 581, "Majestic/RFRare": 105, "Majestic/RFMajestic": 14 });
const gcd = (left, right) => { let a = left, b = right; while (b !== 0) [a, b] = [b, a % b]; return a; };

test(recipeLayoutPoolResolutionAcceptanceContractName, { skip: !available ? "four-source recipe layout pool resolution acceptance did not run; use npm run test:recipe-layout-pool-resolution-evidence" : false }, () => {
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
  const sourceLayouts = parseVerifiedOmensLayouts(recipe), sourcePools = parseVerifiedOmensPools(recipe);
  const resolvedPools = resolveOmensRecipePoolsToDraftableOfficialIdentities(sourcePools, identities, eligibility);
  const resolved = resolveOmensRecipeLayoutsToOfficialIdentityPools(sourceLayouts, resolvedPools);

  assert.deepEqual(parseVerifiedOmensSettings(recipe), { withReplacement: false });
  assert.equal(resolved.withReplacement, false);
  assert.equal(resolved.layouts.length, 228);
  assert.equal(resolved.layouts.reduce((total, layout) => total + layout.weight, 0), 460800);
  assert.deepEqual(resolved.layouts.map(({ id, weight }) => ({ id, weight })), sourceLayouts.layouts.map(({ id, weight }) => ({ id, weight })));
  const poolsByLabel = new Map(resolvedPools.map((pool) => [pool.sourcePoolLabel, pool]));
  const usedPools = new Set();
  for (let index = 0; index < resolved.layouts.length; index++) {
    const source = sourceLayouts.layouts[index], layout = resolved.layouts[index];
    const expandedLabels = source.slots.flatMap((slot) => Array(slot.count).fill(slot.pool));
    assert.equal(layout.slots.length, 14);
    assert.deepEqual(layout.slots.map((slot) => slot.position), Array.from({ length: 14 }, (_, position) => position + 1));
    assert.deepEqual(layout.slots.map((slot) => slot.sourcePoolLabel), expandedLabels);
    assert.equal(layout.slots.every((slot) => slot.resolvedPool === poolsByLabel.get(slot.sourcePoolLabel)), true);
    for (const slot of layout.slots) usedPools.add(slot.resolvedPool);
    const normalCommon = layout.slots.filter((slot) => slot.resolvedPool.recipePoolCategory === "normal" && slot.resolvedPool.fabRarity === "common").length;
    const normalRare = layout.slots.filter((slot) => slot.resolvedPool.recipePoolCategory === "normal" && slot.resolvedPool.fabRarity === "rare").length;
    const normalMajestic = layout.slots.filter((slot) => slot.resolvedPool.recipePoolCategory === "normal" && slot.resolvedPool.fabRarity === "majestic").length;
    const rainbow = layout.slots.filter((slot) => slot.resolvedPool.recipePoolCategory === "rainbow-foil");
    assert.equal(normalCommon, 11); assert.equal(normalRare + normalMajestic, 2); assert.equal(normalRare >= 1, true); assert.equal(rainbow.length, 1);
  }
  assert.equal(usedPools.size, resolvedPools.length);
  assert.equal([...usedPools].every((pool) => resolvedPools.includes(pool)), true);
  for (let offset = 0; offset < resolved.layouts.length; offset += 6) {
    const group = resolved.layouts.slice(offset, offset + 6), divisor = group.reduce((value, layout) => gcd(value, layout.weight), 0), outcomes = new Set();
    for (const layout of group) {
      const normalMajestic = layout.slots.some((slot) => slot.resolvedPool.recipePoolCategory === "normal" && slot.resolvedPool.fabRarity === "majestic");
      const rainbow = layout.slots.find((slot) => slot.resolvedPool.recipePoolCategory === "rainbow-foil");
      const key = `${normalMajestic ? "Majestic" : "Rare"}/${rainbow.sourcePoolLabel}`;
      assert.equal(layout.weight / divisor, coefficients[key]); outcomes.add(key);
    }
    assert.deepEqual(new Set(Object.keys(coefficients)), outcomes);
  }
  assert.ok(Object.isFrozen(resolved)); assert.ok(Object.isFrozen(resolved.layouts));
  assert.equal(resolved.layouts.every((layout) => Object.isFrozen(layout) && Object.isFrozen(layout.slots) && layout.slots.every((slot) => Object.isFrozen(slot) && Object.isFrozen(slot.resolvedPool))), true);
  console.log(recipeLayoutPoolResolutionAcceptanceMarker);
});
