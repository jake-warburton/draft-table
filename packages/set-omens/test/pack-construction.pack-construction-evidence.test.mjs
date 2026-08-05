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
  initializeOmensPackCollationPlanFromUnsigned32SampleBatch,
  readOmensPackCollationPlanPoolDrawStateForTransition,
  reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData,
  reconcileOmensRecipeCustomCardsWithOfficialUpstreamIdentities,
  resolveOmensRecipeLayoutsToOfficialIdentityPools,
  resolveOmensRecipePoolsToDraftableOfficialIdentities,
  transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatch,
  validateFabEnglishCardDataAgainstSchema
} from "../src/schema-validation.ts";
import { constructOmensPackFromInitializedPlanAndUnsigned32SampleBatches } from "../src/pack-construction.ts";
import { validateOmensPackConstructionPoolOverlapEvidence } from "../src/pack-construction-pool-overlap-evidence.ts";

const variables = ["OMENS_RECIPE_EVIDENCE_PATH", "FAB_CARD_SOURCE_EVIDENCE_PATH", "FAB_CARD_SCHEMA_EVIDENCE_PATH", "FAB_CARD_VAULT_EVIDENCE_PATH"];
const available = variables.every((variable) => Boolean(process.env[variable]));
export const packConstructionAcceptanceContractName = "four checksum-verified caller-held sources guard pool overlap before constructing complete Omens packs";
export const packConstructionAcceptanceMarker = "COMPLETE_OMENS_PACK_CONSTRUCTION_CONTRACT_EXECUTED";
const identityKey = (identity) => `${identity.baseCollectorId.length}:${identity.baseCollectorId}${identity.cardUniqueId}`;
const initialized = (tables, layoutTicket) => {
  const result = initializeOmensPackCollationPlanFromUnsigned32SampleBatch(tables, [layoutTicket]);
  assert.equal(result.state, "selected");
  assert.equal(result.consumedSamples, 1);
  return result;
};
const poolStateFor = (plan, poolReference) => {
  const matches = readOmensPackCollationPlanPoolDrawStateForTransition(plan).poolStates.filter((pool) => pool.poolReference === poolReference);
  assert.equal(matches.length, 1);
  return matches[0];
};
const firstTicketFor = (poolState, identity) => {
  let start = 0;
  for (const choice of poolState.officialIdentityChoices) {
    if (identityKey(choice.officialIdentityReference) === identityKey(identity)) return start;
    start = choice.cumulativeExclusiveEnd;
  }
  assert.fail("target identity must remain in its exact pool");
};

// Captain-held acceptance: only the captain can supply and accept the private recipe measurement.
test(packConstructionAcceptanceContractName, { skip: !available ? "four-source complete pack construction acceptance did not run; use npm run test:pack-construction-evidence" : false }, () => {
  const recipe = verifyOmensRecipeBytes(readFileSync(process.env.OMENS_RECIPE_EVIDENCE_PATH));
  const cardBytes = readFileSync(process.env.FAB_CARD_SOURCE_EVIDENCE_PATH), schemaBytes = readFileSync(process.env.FAB_CARD_SCHEMA_EVIDENCE_PATH), cardVaultBytes = readFileSync(process.env.FAB_CARD_VAULT_EVIDENCE_PATH);
  const documents = validateVerifiedFabCardSourceDocuments(verifyFabEnglishCardBytes(cardBytes), verifyFabCardSchemaBytes(schemaBytes));
  verifyCardVaultOmensProductBytes(cardVaultBytes);
  const official = reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData(validateCardVaultOmensOfficialMembership(cardVaultBytes), validateFabEnglishCardDataAgainstSchema(documents.card, documents.schema));
  const identities = reconcileOmensRecipeCustomCardsWithOfficialUpstreamIdentities(parseVerifiedOmensCustomCards(recipe), official);
  const eligibility = classifyOmensOfficialDraftEligibility(identities, official);
  const pools = resolveOmensRecipePoolsToDraftableOfficialIdentities(parseVerifiedOmensPools(recipe), identities, eligibility);

  // This exact aggregate guard deliberately runs before compilation or any pack acceptance.
  assert.deepEqual(validateOmensPackConstructionPoolOverlapEvidence(pools), {
    normalPoolCount: 8,
    normalUniqueIdentityCount: 209,
    rainbowFoilPoolCount: 3,
    rainbowFoilUniqueIdentityCount: 171
  });

  const layouts = resolveOmensRecipeLayoutsToOfficialIdentityPools(parseVerifiedOmensLayouts(recipe), pools);
  const tables = compileOmensCollationWeightTables(layouts, pools);
  assert.equal(tables.layoutChoices.length, 228);
  for (let layoutIndex = 0; layoutIndex < tables.layoutChoices.length; layoutIndex++) {
    const layoutChoice = tables.layoutChoices[layoutIndex], layoutTicket = layoutIndex === 0 ? 0 : tables.layoutChoices[layoutIndex - 1].cumulativeExclusiveEnd;
    const plan = initialized(tables, layoutTicket);
    const result = constructOmensPackFromInitializedPlanAndUnsigned32SampleBatches(plan.plan, Array.from({ length: 14 }, () => [0]));
    assert.equal(result.state, "complete");
    assert.equal(result.consumedBatches, 14);
    assert.equal(result.consumedSamples, 14);
    assert.equal(result.totalConsumedBatches, 14);
    assert.equal(result.totalConsumedSamples, 14);
    assert.equal(result.pack.layoutReference, layoutChoice.layoutReference);
    assert.equal(result.pack.positions.length, 14);
    for (let positionIndex = 0; positionIndex < 14; positionIndex++) {
      const selected = result.pack.positions[positionIndex], expectedPosition = layoutChoice.layoutReference.slots[positionIndex];
      assert.equal(selected.positionReference, expectedPosition);
      assert.ok(expectedPosition.resolvedPool.entries.some((entry) => entry.officialIdentity === selected.officialIdentityReference));
    }
  }

  const normalPoolByIdentity = new Map();
  for (const pool of pools.filter((pool) => pool.recipePoolCategory === "normal")) for (const entry of pool.entries) normalPoolByIdentity.set(identityKey(entry.officialIdentity), pool);
  let overlap;
  for (let layoutIndex = 0; layoutIndex < layouts.layouts.length && overlap === undefined; layoutIndex++) {
    const layout = layouts.layouts[layoutIndex], rfPositionIndex = layout.slots.findIndex((position) => position.recipeStructuralRole === "rainbow-foil"), rfPool = layout.slots[rfPositionIndex].resolvedPool;
    for (const rfEntry of rfPool.entries) {
      const normalPool = normalPoolByIdentity.get(identityKey(rfEntry.officialIdentity));
      const normalPositionIndex = layout.slots.findIndex((position) => position.resolvedPool === normalPool);
      if (normalPositionIndex !== -1) { overlap = { layoutIndex, normalPositionIndex, rfPositionIndex, identity: rfEntry.officialIdentity }; break; }
    }
  }
  assert.notEqual(overlap, undefined, "accepted RF subset must have one layout-local normal/RF overlap witness");
  const overlapLayoutChoice = tables.layoutChoices[overlap.layoutIndex], overlapLayoutTicket = overlap.layoutIndex === 0 ? 0 : tables.layoutChoices[overlap.layoutIndex - 1].cumulativeExclusiveEnd;
  let oraclePlan = initialized(tables, overlapLayoutTicket).plan;
  const batches = [];
  for (let positionIndex = 0; positionIndex < 14; positionIndex++) {
    const position = overlapLayoutChoice.layoutReference.slots[positionIndex], poolState = poolStateFor(oraclePlan, position.resolvedPool), sample = positionIndex === overlap.normalPositionIndex || positionIndex === overlap.rfPositionIndex ? firstTicketFor(poolState, overlap.identity) : 0;
    batches.push([sample]);
    const transition = transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatch(oraclePlan, [sample]);
    assert.equal(transition.state, "selected");
    oraclePlan = transition.nextPlan;
  }
  const overlapPack = constructOmensPackFromInitializedPlanAndUnsigned32SampleBatches(initialized(tables, overlapLayoutTicket).plan, batches);
  assert.equal(overlapPack.state, "complete");
  const normalSelection = overlapPack.pack.positions[overlap.normalPositionIndex], rfSelection = overlapPack.pack.positions[overlap.rfPositionIndex];
  assert.equal(normalSelection.positionReference.recipeStructuralRole === "rainbow-foil", false);
  assert.equal(rfSelection.positionReference.recipeStructuralRole, "rainbow-foil");
  assert.equal(identityKey(normalSelection.officialIdentityReference), identityKey(overlap.identity));
  assert.equal(identityKey(rfSelection.officialIdentityReference), identityKey(overlap.identity));
  assert.equal(overlapPack.pack.positions.filter((selection) => identityKey(selection.officialIdentityReference) === identityKey(overlap.identity)).length >= 2, true);
  console.log(packConstructionAcceptanceMarker);
});
