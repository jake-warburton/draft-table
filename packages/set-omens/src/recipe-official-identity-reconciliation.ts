import {
  readCompletedOmensRecipeCustomCardsForIdentityReconciliation,
  type OmensRecipeCardReference
} from "./custom-cards.ts";
import {
  readOfficialUpstreamIdReconciliationForSuffixFoiling,
  type OfficialUpstreamIdReconciliation
} from "./official-upstream-id-reconciliation.ts";

/** Stable, source-secret failure for build-time recipe/official identity reconciliation. */
export class OmensRecipeOfficialIdentityReconciliationError extends Error {
  readonly code = "OMENS_RECIPE_OFFICIAL_IDENTITY_RECONCILIATION_FAILED";

  constructor() {
    super("Omens recipe official identity reconciliation failed.");
    this.name = "OmensRecipeOfficialIdentityReconciliationError";
    this.stack = `${this.name}: ${this.message}`;
  }
}

export type OmensRecipeOfficialIdentityReconciliation = Readonly<{
  mapped: ReadonlyArray<Readonly<{
    recipeName: string;
    recipeCollectorNumber: string;
    recipeRarityLabel: OmensRecipeCardReference["rarity"];
    officialPrintId: string;
    officialBaseCollectorId: string;
    officialCardUniqueId: string;
  }>>;
  /** Absence from the community recipe is not an exclusion or draftability classification. */
  unmapped: ReadonlyArray<Readonly<{
    officialPrintId: string;
    baseCollectorId: string;
    sourceSetMarker: "OMN" | "IAR";
    suffixMarker: "RF" | "CF" | "MV" | null;
  }>>;
}>;

type ExpectedAggregate = Readonly<{
  recipeEntries: number;
  officialEntries: number;
  candidateEntries: number;
  mappedEntries: number;
  unmappedEntries: number;
  unmappedOmn: number;
  unmappedIar: number;
  unmappedUnsuffixed: number;
  unmappedRf: number;
  unmappedCf: number;
  unmappedMv: number;
}>;

const reconciliationCapabilities = new WeakSet<object>();

const acceptedAggregate: ExpectedAggregate = Object.freeze({
  recipeEntries: 209,
  officialEntries: 260,
  candidateEntries: 242,
  mappedEntries: 209,
  unmappedEntries: 51,
  unmappedOmn: 42,
  unmappedIar: 9,
  unmappedUnsuffixed: 33,
  unmappedRf: 6,
  unmappedCf: 3,
  unmappedMv: 9
});
const fail = (): never => { throw new OmensRecipeOfficialIdentityReconciliationError(); };
const frozen = <Value>(value: Value): Readonly<Value> => Object.freeze(value);

const pitchColour = (pitch: OfficialUpstreamIdReconciliation[number]["pitch"]): "red" | "yellow" | "blue" | null => {
  if (pitch === "") return null;
  if (pitch === "1") return "red";
  if (pitch === "2") return "yellow";
  if (pitch === "3") return "blue";
  return fail();
};

const derivedRecipeName = (entry: OfficialUpstreamIdReconciliation[number]): string => {
  const colour = pitchColour(entry.pitch);
  return colour === null ? entry.name : `${entry.name} (${colour})`;
};

const reconcile = (
  recipeCapability: ReadonlyArray<OmensRecipeCardReference>,
  officialCapability: OfficialUpstreamIdReconciliation,
  expected: ExpectedAggregate
): OmensRecipeOfficialIdentityReconciliation => {
  const references = readCompletedOmensRecipeCustomCardsForIdentityReconciliation(recipeCapability);
  const official = readOfficialUpstreamIdReconciliationForSuffixFoiling(officialCapability);
  const candidates = official.filter((entry) => entry.suffixMarker === null && entry.sourceSetMarker === "OMN");
  const candidateDerivedNames = new Set(candidates.map(derivedRecipeName));
  if (candidates.length !== expected.candidateEntries || candidateDerivedNames.size !== candidates.length) fail();

  const ownedOfficialIndexes = new Set<number>();
  const ownedDerivedNames = new Set<string>();
  const mapped: Array<OmensRecipeOfficialIdentityReconciliation["mapped"][number]> = [];

  for (const reference of references) {
    const collectorMatches: number[] = [];
    for (let index = 0; index < official.length; index++) {
      const entry = official[index];
      if (entry.baseCollectorId === reference.collectorNumber) collectorMatches.push(index);
    }
    if (collectorMatches.length > 1) fail();
    if (collectorMatches.length === 0) continue;
    const index = collectorMatches[0];
    const candidate = official[index];
    if (candidate.suffixMarker !== null || candidate.officialPrintId !== candidate.baseCollectorId || candidate.sourceSetMarker !== "OMN" ||
      derivedRecipeName(candidate) !== reference.name) continue;
    if (ownedOfficialIndexes.has(index)) fail();
    ownedOfficialIndexes.add(index);
    const entry = official[index];
    const exactDerivedName = derivedRecipeName(entry);
    if (ownedDerivedNames.has(exactDerivedName)) fail();
    ownedDerivedNames.add(exactDerivedName);
    mapped.push(frozen({
      recipeName: reference.name,
      recipeCollectorNumber: reference.collectorNumber,
      recipeRarityLabel: reference.rarity,
      officialPrintId: entry.officialPrintId,
      officialBaseCollectorId: entry.baseCollectorId,
      officialCardUniqueId: entry.unique_id
    }));
  }

  const unmapped = official.flatMap((entry, index) => ownedOfficialIndexes.has(index) ? [] : [frozen({
    officialPrintId: entry.officialPrintId,
    baseCollectorId: entry.baseCollectorId,
    sourceSetMarker: entry.sourceSetMarker,
    suffixMarker: entry.suffixMarker
  })]);
  const partitionIds = [...mapped.map((entry) => entry.officialPrintId), ...unmapped.map((entry) => entry.officialPrintId)];
  const unmappedOmn = unmapped.filter((entry) => entry.sourceSetMarker === "OMN").length;
  const unmappedIar = unmapped.filter((entry) => entry.sourceSetMarker === "IAR").length;
  const unmappedUnsuffixed = unmapped.filter((entry) => entry.suffixMarker === null).length;
  const unmappedRf = unmapped.filter((entry) => entry.suffixMarker === "RF").length;
  const unmappedCf = unmapped.filter((entry) => entry.suffixMarker === "CF").length;
  const unmappedMv = unmapped.filter((entry) => entry.suffixMarker === "MV").length;

  if (references.length !== expected.recipeEntries || official.length !== expected.officialEntries ||
    mapped.length !== expected.mappedEntries || unmapped.length !== expected.unmappedEntries ||
    unmappedOmn !== expected.unmappedOmn || unmappedIar !== expected.unmappedIar ||
    unmappedUnsuffixed !== expected.unmappedUnsuffixed || unmappedRf !== expected.unmappedRf ||
    unmappedCf !== expected.unmappedCf || unmappedMv !== expected.unmappedMv ||
    mapped.length + unmapped.length !== official.length || partitionIds.length !== official.length ||
    new Set(partitionIds).size !== official.length || ownedDerivedNames.size !== mapped.length) fail();

  const capability = frozen({ mapped: frozen(mapped), unmapped: frozen(unmapped) });
  reconciliationCapabilities.add(capability);
  return capability;
};

/** Package-internal fictional seam for capability-bound identity contracts. */
export const reconcileOmensRecipeOfficialIdentityRecordsForTest = (
  recipe: ReadonlyArray<OmensRecipeCardReference>,
  official: OfficialUpstreamIdReconciliation,
  expected: ExpectedAggregate
): OmensRecipeOfficialIdentityReconciliation => {
  try {
    return reconcile(recipe, official, expected);
  } catch (error) {
    if (error instanceof OmensRecipeOfficialIdentityReconciliationError) throw error;
    return fail();
  }
};

/** Reads only the exact completed identity reconciliation for the following rarity slice. */
export const readOmensRecipeOfficialIdentityReconciliationForRarityCorrespondence = (
  reconciliation: OmensRecipeOfficialIdentityReconciliation
): OmensRecipeOfficialIdentityReconciliation => reconciliationCapabilities.has(reconciliation) ? reconciliation : fail();

/** Reads only the completed identity partition for Omens product-policy classification. */
export const readOmensRecipeOfficialIdentityReconciliationForDraftEligibility = (
  reconciliation: OmensRecipeOfficialIdentityReconciliation
): OmensRecipeOfficialIdentityReconciliation => reconciliationCapabilities.has(reconciliation) ? reconciliation : fail();

/** Build-time-only exact identity membership reconciliation over both opaque capabilities. */
export const reconcileOmensRecipeCustomCardsWithOfficialUpstreamIdentities = (
  recipe: ReadonlyArray<OmensRecipeCardReference>,
  official: OfficialUpstreamIdReconciliation
): OmensRecipeOfficialIdentityReconciliation => {
  try {
    return reconcile(recipe, official, acceptedAggregate);
  } catch (error) {
    if (error instanceof OmensRecipeOfficialIdentityReconciliationError) throw error;
    return fail();
  }
};
