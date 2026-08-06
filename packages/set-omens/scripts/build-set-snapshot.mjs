import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  parseVerifiedOmensCustomCards,
  parseVerifiedOmensLayouts,
  parseVerifiedOmensPools,
  validateCardVaultOmensOfficialMembership,
  validateVerifiedFabCardSourceDocuments,
  verifyCardVaultOmensProductBytes,
  verifyFabCardSchemaBytes,
  verifyFabEnglishCardBytes,
  verifyOmensRecipeBytes,
  CARD_VAULT_OMENS_PRODUCT_RESPONSE,
  FAB_CARD_SOURCE,
  OMENS_RECIPE
} from "../src/index.ts";
import {
  classifyOmensOfficialDraftEligibility,
  reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData,
  reconcileOmensRecipeCustomCardsWithOfficialUpstreamIdentities,
  reconcileOmensRecipeRaritiesWithOfficialUpstreamPrintings,
  resolveOmensRecipeLayoutsToOfficialIdentityPools,
  resolveOmensRecipePoolsToDraftableOfficialIdentities,
  validateFabEnglishCardDataAgainstSchema
} from "../src/schema-validation.ts";
import { OMENS_SNAPSHOT_SLOT_ROLES, validateOmensSetSnapshot } from "../src/set-snapshot.ts";

/**
 * Regenerates the committed Omens set snapshot from the four checksum-pinned evidence sources.
 *
 * Only this script ever reads the captain-held recipe. It writes card names, pitch values, and
 * rarities that all originate in the pinned public card source, plus the recipe's own weighted pool
 * and layout structure as opaque numbers. No recipe text, URL, or byte is copied into the output.
 *
 *   OMENS_RECIPE_EVIDENCE_PATH=… FAB_CARD_SOURCE_EVIDENCE_PATH=… \
 *   FAB_CARD_SCHEMA_EVIDENCE_PATH=… FAB_CARD_VAULT_EVIDENCE_PATH=… \
 *   npm --workspace @draft-table/set-omens run build:set-snapshot
 *
 * Pass an output path as the only argument to write elsewhere, which the verification command uses
 * to regenerate into a temporary file and compare byte for byte with the committed snapshot.
 */

const ACCEPTED_AGGREGATES = Object.freeze({
  identities: 209,
  pools: 11,
  normalPools: 8,
  rainbowFoilPools: 3,
  rainbowFoilIdentities: 171,
  layouts: 228,
  layoutTotalWeight: 460_800
});

const variables = [
  "OMENS_RECIPE_EVIDENCE_PATH",
  "FAB_CARD_SOURCE_EVIDENCE_PATH",
  "FAB_CARD_SCHEMA_EVIDENCE_PATH",
  "FAB_CARD_VAULT_EVIDENCE_PATH"
];

const refuse = (reason) => {
  console.error(`Set snapshot generation failed: ${reason}`);
  process.exit(1);
};

if (process.argv.length > 3) refuse("expected at most one output path");
const missing = variables.filter((variable) => !process.env[variable]);
if (missing.length > 0) refuse(`missing evidence path variables: ${missing.join(", ")}`);

const outputPath = process.argv[2] ?? fileURLToPath(new URL("../src/set-snapshot.generated.ts", import.meta.url));

const recipe = verifyOmensRecipeBytes(readFileSync(process.env.OMENS_RECIPE_EVIDENCE_PATH));
const cardVaultBytes = readFileSync(process.env.FAB_CARD_VAULT_EVIDENCE_PATH);
verifyCardVaultOmensProductBytes(cardVaultBytes);
const documents = validateVerifiedFabCardSourceDocuments(
  verifyFabEnglishCardBytes(readFileSync(process.env.FAB_CARD_SOURCE_EVIDENCE_PATH)),
  verifyFabCardSchemaBytes(readFileSync(process.env.FAB_CARD_SCHEMA_EVIDENCE_PATH))
);

const official = reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData(
  validateCardVaultOmensOfficialMembership(cardVaultBytes),
  validateFabEnglishCardDataAgainstSchema(documents.card, documents.schema)
);
const identities = reconcileOmensRecipeCustomCardsWithOfficialUpstreamIdentities(parseVerifiedOmensCustomCards(recipe), official);
const eligibility = classifyOmensOfficialDraftEligibility(identities, official);
const resolvedPools = resolveOmensRecipePoolsToDraftableOfficialIdentities(parseVerifiedOmensPools(recipe), identities, eligibility);
const resolvedLayouts = resolveOmensRecipeLayoutsToOfficialIdentityPools(parseVerifiedOmensLayouts(recipe), resolvedPools);
const rarities = reconcileOmensRecipeRaritiesWithOfficialUpstreamPrintings(identities, official);

const officialByPrintId = new Map([...official].map((entry) => [entry.officialPrintId, entry]));
const rarityByPrintId = new Map([...rarities].map((entry) => [entry.officialPrintId, entry.fabRarity]));
const PITCH_VALUES = new Map([["", 0], ["1", 1], ["2", 2], ["3", 3]]);

const identityIds = [...new Set(resolvedPools.flatMap((entry) => entry.entries.map((poolEntry) => poolEntry.officialIdentity.baseCollectorId)))].sort();
if (identityIds.length !== ACCEPTED_AGGREGATES.identities) {
  refuse(`expected ${ACCEPTED_AGGREGATES.identities} draftable identities, found ${identityIds.length}`);
}

const snapshotIdentities = identityIds.map((id) => {
  const upstream = officialByPrintId.get(id);
  if (upstream === undefined) refuse(`identity ${id} has no official upstream row`);
  const pitch = PITCH_VALUES.get(upstream.pitch);
  if (pitch === undefined) refuse(`identity ${id} has an unsupported pitch value`);
  const rarity = rarityByPrintId.get(id);
  if (rarity === undefined) refuse(`identity ${id} has no reconciled rarity`);
  return { id, name: upstream.name, pitch, rarity };
});

const identityIndex = new Map(identityIds.map((id, index) => [id, index]));

const snapshotPools = resolvedPools.map((entry) => ({
  label: entry.sourcePoolLabel,
  rarity: entry.fabRarity,
  category: entry.recipePoolCategory,
  entries: entry.entries.map((poolEntry) => ({
    identity: identityIndex.get(poolEntry.officialIdentity.baseCollectorId),
    weight: poolEntry.weight
  }))
}));

const poolIndex = new Map(snapshotPools.map((entry, index) => [entry.label, index]));

const snapshotLayouts = resolvedLayouts.layouts.map((entry) => {
  if (entry.slots.length !== OMENS_SNAPSHOT_SLOT_ROLES.length) refuse("a layout does not hold fourteen positions");
  entry.slots.forEach((slot, position) => {
    if (slot.recipeStructuralRole !== OMENS_SNAPSHOT_SLOT_ROLES[position]) {
      refuse(`a layout position ${position} holds ${slot.recipeStructuralRole} rather than the reviewed role`);
    }
  });
  return { weight: entry.weight, pools: entry.slots.map((slot) => poolIndex.get(slot.sourcePoolLabel)) };
});

const snapshot = {
  schemaVersion: 1,
  set: "OMN",
  provenance: {
    recipe: { id: OMENS_RECIPE.id, sha256: OMENS_RECIPE.sha256, provenance: OMENS_RECIPE.provenance },
    cardSource: { id: `${FAB_CARD_SOURCE.repository}@${FAB_CARD_SOURCE.tag}:${FAB_CARD_SOURCE.cardPath}`, sha256: FAB_CARD_SOURCE.cardSha256, provenance: FAB_CARD_SOURCE.provenance },
    cardSchema: { id: `${FAB_CARD_SOURCE.repository}@${FAB_CARD_SOURCE.tag}:${FAB_CARD_SOURCE.schemaPath}`, sha256: FAB_CARD_SOURCE.schemaSha256, provenance: FAB_CARD_SOURCE.provenance },
    cardVault: { id: CARD_VAULT_OMENS_PRODUCT_RESPONSE.evidenceId, sha256: CARD_VAULT_OMENS_PRODUCT_RESPONSE.sha256, provenance: CARD_VAULT_OMENS_PRODUCT_RESPONSE.provenance }
  },
  identities: snapshotIdentities,
  pools: snapshotPools,
  layouts: snapshotLayouts
};

const validated = validateOmensSetSnapshot(snapshot);

const normalPools = validated.pools.filter((entry) => entry.category === "normal");
const rainbowFoilPools = validated.pools.filter((entry) => entry.category === "rainbow-foil");
const normalMembership = new Map();
for (const entry of normalPools) {
  for (const poolEntry of entry.entries) {
    if (normalMembership.has(poolEntry.identity)) refuse("the normal pools are not pairwise disjoint");
    normalMembership.set(poolEntry.identity, entry);
  }
}
const rainbowFoilIdentities = new Set(rainbowFoilPools.flatMap((entry) => entry.entries.map((poolEntry) => poolEntry.identity)));
for (const identity of rainbowFoilIdentities) {
  if (!normalMembership.has(identity)) refuse("a Rainbow Foil identity belongs to no normal pool");
}
for (const [identity, owner] of normalMembership) {
  if (owner.rarity !== validated.identities[identity].rarity) {
    refuse(`identity ${validated.identities[identity].id} disagrees with its own pool's rarity`);
  }
}

const totalLayoutWeight = validated.layouts.reduce((total, entry) => total + entry.weight, 0);
const measured = {
  identities: validated.identities.length,
  pools: validated.pools.length,
  normalPools: normalPools.length,
  rainbowFoilPools: rainbowFoilPools.length,
  rainbowFoilIdentities: rainbowFoilIdentities.size,
  layouts: validated.layouts.length,
  layoutTotalWeight: totalLayoutWeight
};
for (const [key, expected] of Object.entries(ACCEPTED_AGGREGATES)) {
  if (measured[key] !== expected) refuse(`${key} measured ${measured[key]} but the accepted evidence records ${expected}`);
}

const rows = (values) => values.map((value) => `  ${JSON.stringify(value)}`).join(",\n");

const output = `// Generated by scripts/build-set-snapshot.mjs from the four checksum-pinned evidence sources.
// Do not edit by hand. Regenerate with:
//   npm --workspace @draft-table/set-omens run build:set-snapshot
import { validateOmensSetSnapshot, type OmensSetSnapshot } from "./set-snapshot.ts";

export {
  OMENS_SNAPSHOT_PACK_SIZE,
  OMENS_SNAPSHOT_SLOT_ROLES,
  OmensSetSnapshotError,
  totalOmensLayoutWeight,
  totalOmensPoolWeight,
  validateOmensSetSnapshot,
  type OmensSetSnapshot,
  type OmensSnapshotIdentity,
  type OmensSnapshotLayout,
  type OmensSnapshotPool,
  type OmensSnapshotPoolCategory,
  type OmensSnapshotPoolEntry,
  type OmensSnapshotRarity,
  type OmensSnapshotSlotRole
} from "./set-snapshot.ts";

const identities = [
${rows(snapshot.identities)}
];

const pools = [
${rows(snapshot.pools)}
];

const layouts = [
${rows(snapshot.layouts)}
];

/**
 * The reviewed Omens set snapshot. It is validated at module load, so the runtime never trusts
 * this generated file: an edit that breaks any structural invariant throws instead of shipping.
 */
export const OMENS_SET_SNAPSHOT: OmensSetSnapshot = validateOmensSetSnapshot({
  schemaVersion: ${snapshot.schemaVersion},
  set: ${JSON.stringify(snapshot.set)},
  provenance: ${JSON.stringify(snapshot.provenance, null, 2).split("\n").join("\n  ")},
  identities,
  pools,
  layouts
});
`;

writeFileSync(outputPath, output);
console.log(`set snapshot generated: ${measured.identities} identities, ${measured.pools} pools, ${measured.layouts} layouts, total layout weight ${measured.layoutTotalWeight}`);
