import {
  readOfficialUpstreamIdReconciliationForSuffixFoiling,
  type OfficialUpstreamIdReconciliation
} from "./official-upstream-id-reconciliation.ts";
import {
  readOmensRecipeOfficialIdentityReconciliationForRarityCorrespondence,
  type OmensRecipeOfficialIdentityReconciliation
} from "./recipe-official-identity-reconciliation.ts";
import { translateOmensRecipeRarityAtFabSeam, type FabNativeRecipeRarity, type FabRarityCode, type OmensRecipeRarityLabel } from "./recipe-rarity-domain.ts";

/** Stable, evidence-secret failure for build-time recipe rarity correspondence. */
export class OmensRecipeRarityCorrespondenceError extends Error {
  readonly code = "OMENS_RECIPE_RARITY_CORRESPONDENCE_FAILED";

  constructor() {
    super("Omens recipe rarity correspondence failed.");
    this.name = "OmensRecipeRarityCorrespondenceError";
    this.stack = `${this.name}: ${this.message}`;
  }
}

export type OmensRecipeRarityCorrespondence = ReadonlyArray<Readonly<{
  recipeCollectorNumber: string;
  /** Exact checksum-pinned recipe literal. */
  recipeRarityLabel: OmensRecipeRarityLabel;
  /** Explicit one-way project/FaB domain projection. */
  fabRarity: FabNativeRecipeRarity;
  officialPrintId: string;
  /** Authoritative one-code-per-printing-row sequence in exact source order, including duplicates. */
  sourceOrderUpstreamRarityCodeSequence: ReadonlyArray<FabRarityCode>;
  /** Lossy first-observed unique-code set used only for per-identity correspondence classification. */
  firstObservedUniqueUpstreamRarityCodeSet: ReadonlyArray<FabRarityCode>;
  observedCorrespondenceClass: "exact-common-C" | "pinned-common-C-V-anomaly" | "exact-rare-R" | "exact-majestic-M";
  /** Observation flag only; later draftability/treatment work must classify these identities. */
  requiresDraftabilityTreatmentClassification: boolean;
}>>;

type MappedRecipeRarityExpectedAggregates = Readonly<{
  mappedIdentityEntries: number;
  mappedSourceOrderSequenceCC: number;
  mappedSourceOrderSequenceRR: number;
  mappedSourceOrderSequenceMM: number;
  mappedSourceOrderSequenceC: number;
  mappedSourceOrderSequenceCV: number;
  mappedSourceOrderSequenceR: number;
  mappedSourceOrderSequenceM: number;
  mappedFirstObservedUniqueSetC: number;
  mappedFirstObservedUniqueSetR: number;
  mappedFirstObservedUniqueSetM: number;
  mappedFirstObservedUniqueSetCV: number;
  anomalyOfficialPrintIds: ReadonlyArray<string>;
}>;

const MAPPED_RECIPE_RARITY_ACCEPTED_AGGREGATES: MappedRecipeRarityExpectedAggregates = Object.freeze({
  mappedIdentityEntries: 209,
  mappedSourceOrderSequenceCC: 117,
  mappedSourceOrderSequenceRR: 59,
  mappedSourceOrderSequenceMM: 15,
  mappedSourceOrderSequenceC: 15,
  mappedSourceOrderSequenceCV: 2,
  mappedSourceOrderSequenceR: 1,
  mappedSourceOrderSequenceM: 0,
  mappedFirstObservedUniqueSetC: 132,
  mappedFirstObservedUniqueSetR: 60,
  mappedFirstObservedUniqueSetM: 15,
  mappedFirstObservedUniqueSetCV: 2,
  anomalyOfficialPrintIds: Object.freeze(["OMN199", "OMN201"])
});
const fail = (): never => { throw new OmensRecipeRarityCorrespondenceError(); };
const frozen = <Value>(value: Value): Readonly<Value> => Object.freeze(value);

const reconcile = (
  identityCapability: OmensRecipeOfficialIdentityReconciliation,
  officialCapability: OfficialUpstreamIdReconciliation,
  expected: MappedRecipeRarityExpectedAggregates
): OmensRecipeRarityCorrespondence => {
  const identities = readOmensRecipeOfficialIdentityReconciliationForRarityCorrespondence(identityCapability);
  const official = readOfficialUpstreamIdReconciliationForSuffixFoiling(officialCapability);
  const candidates = identities.mapped;
  if (candidates.length !== expected.mappedIdentityEntries || expected.anomalyOfficialPrintIds.length !== 2) fail();

  const anomalyIds = new Set(expected.anomalyOfficialPrintIds);
  if (anomalyIds.size !== 2) fail();
  const isPinnedAnomaly = (officialPrintId: string): boolean => anomalyIds.has(officialPrintId);
  const byOfficial = new Map<string, OfficialUpstreamIdReconciliation[number]>();
  const byBase = new Map<string, OfficialUpstreamIdReconciliation[number]>();
  const byCard = new Map<string, OfficialUpstreamIdReconciliation[number]>();
  for (const record of official) {
    if (byOfficial.has(record.officialPrintId) || byBase.has(record.baseCollectorId) || byCard.has(record.unique_id)) fail();
    byOfficial.set(record.officialPrintId, record); byBase.set(record.baseCollectorId, record); byCard.set(record.unique_id, record);
  }

  let mappedFirstObservedUniqueSetC = 0, mappedFirstObservedUniqueSetR = 0, mappedFirstObservedUniqueSetM = 0, mappedFirstObservedUniqueSetCV = 0;
  const mappedSourceOrderSequenceCounts = new Map<string, number>();
  const owned = new Set<OfficialUpstreamIdReconciliation[number]>();
  const output: Array<OmensRecipeRarityCorrespondence[number]> = [];
  for (const identity of candidates) {
    const record = byOfficial.get(identity.officialPrintId) ?? fail();
    if (byBase.get(identity.officialBaseCollectorId) !== record || byCard.get(identity.officialCardUniqueId) !== record ||
      record.officialPrintId !== identity.officialPrintId || record.baseCollectorId !== identity.officialBaseCollectorId || record.unique_id !== identity.officialCardUniqueId ||
      owned.has(record) || record.printings.length === 0) fail();
    owned.add(record);

    const rarityStrings = record.printings.map((row) => row.rarity);
    const uniqueRarityStrings: string[] = [];
    const seen = new Set<string>();
    for (const rarity of rarityStrings) if (!seen.has(rarity)) { seen.add(rarity); uniqueRarityStrings.push(rarity); }
    const sourceOrderSequenceKey = rarityStrings.join("\u0000");
    mappedSourceOrderSequenceCounts.set(sourceOrderSequenceKey, (mappedSourceOrderSequenceCounts.get(sourceOrderSequenceKey) ?? 0) + 1);
    const uniqueSetKey = [...uniqueRarityStrings].sort().join("\u0000");
    const label = identity.recipeRarityLabel;
    const translation = translateOmensRecipeRarityAtFabSeam(label);
    const fabRarity = translation.fabRarity;
    let observedCorrespondenceClass: OmensRecipeRarityCorrespondence[number]["observedCorrespondenceClass"] = "exact-common-C";
    let requiresDraftabilityTreatmentClassification = false;
    if (uniqueSetKey === translation.correspondingUpstreamCode && fabRarity === "common") { observedCorrespondenceClass = "exact-common-C"; mappedFirstObservedUniqueSetC++; }
    else if (fabRarity === "common" && uniqueSetKey === "C\u0000V" && isPinnedAnomaly(identity.officialPrintId)) {
      observedCorrespondenceClass = "pinned-common-C-V-anomaly"; requiresDraftabilityTreatmentClassification = true; mappedFirstObservedUniqueSetCV++;
    } else if (uniqueSetKey === translation.correspondingUpstreamCode && fabRarity === "rare") { observedCorrespondenceClass = "exact-rare-R"; mappedFirstObservedUniqueSetR++; }
    else if (uniqueSetKey === translation.correspondingUpstreamCode && fabRarity === "majestic") { observedCorrespondenceClass = "exact-majestic-M"; mappedFirstObservedUniqueSetM++; }
    else fail();

    const retainedRarityCodes = rarityStrings as FabRarityCode[];
    const retainedUniqueRarityCodes = uniqueRarityStrings as FabRarityCode[];
    output.push(frozen({ recipeCollectorNumber: identity.recipeCollectorNumber, recipeRarityLabel: label, fabRarity,
      officialPrintId: identity.officialPrintId, sourceOrderUpstreamRarityCodeSequence: frozen(retainedRarityCodes),
      firstObservedUniqueUpstreamRarityCodeSet: frozen(retainedUniqueRarityCodes), observedCorrespondenceClass,
      requiresDraftabilityTreatmentClassification }));
  }

  const observedAnomalies = output.filter((entry) => entry.observedCorrespondenceClass === "pinned-common-C-V-anomaly").map((entry) => entry.officialPrintId);
  const mappedSourceOrderSequenceCC = mappedSourceOrderSequenceCounts.get("C\u0000C") ?? 0;
  const mappedSourceOrderSequenceRR = mappedSourceOrderSequenceCounts.get("R\u0000R") ?? 0;
  const mappedSourceOrderSequenceMM = mappedSourceOrderSequenceCounts.get("M\u0000M") ?? 0;
  const mappedSourceOrderSequenceC = mappedSourceOrderSequenceCounts.get("C") ?? 0;
  const mappedSourceOrderSequenceCV = mappedSourceOrderSequenceCounts.get("C\u0000V") ?? 0;
  const mappedSourceOrderSequenceR = mappedSourceOrderSequenceCounts.get("R") ?? 0;
  const mappedSourceOrderSequenceM = mappedSourceOrderSequenceCounts.get("M") ?? 0;
  const expectedMappedSourceOrderSequenceShapeCount = [expected.mappedSourceOrderSequenceCC, expected.mappedSourceOrderSequenceRR,
    expected.mappedSourceOrderSequenceMM, expected.mappedSourceOrderSequenceC, expected.mappedSourceOrderSequenceCV,
    expected.mappedSourceOrderSequenceR, expected.mappedSourceOrderSequenceM].filter((count) => count > 0).length;
  if (output.length !== expected.mappedIdentityEntries || owned.size !== expected.mappedIdentityEntries || mappedSourceOrderSequenceCounts.size !== expectedMappedSourceOrderSequenceShapeCount ||
    mappedSourceOrderSequenceCC !== expected.mappedSourceOrderSequenceCC || mappedSourceOrderSequenceRR !== expected.mappedSourceOrderSequenceRR ||
    mappedSourceOrderSequenceMM !== expected.mappedSourceOrderSequenceMM || mappedSourceOrderSequenceC !== expected.mappedSourceOrderSequenceC ||
    mappedSourceOrderSequenceCV !== expected.mappedSourceOrderSequenceCV || mappedSourceOrderSequenceR !== expected.mappedSourceOrderSequenceR ||
    mappedSourceOrderSequenceM !== expected.mappedSourceOrderSequenceM ||
    mappedFirstObservedUniqueSetC !== expected.mappedFirstObservedUniqueSetC || mappedFirstObservedUniqueSetR !== expected.mappedFirstObservedUniqueSetR ||
    mappedFirstObservedUniqueSetM !== expected.mappedFirstObservedUniqueSetM || mappedFirstObservedUniqueSetCV !== expected.mappedFirstObservedUniqueSetCV ||
    mappedFirstObservedUniqueSetC + mappedFirstObservedUniqueSetR + mappedFirstObservedUniqueSetM + mappedFirstObservedUniqueSetCV !== expected.mappedIdentityEntries ||
    observedAnomalies.length !== 2 || observedAnomalies.some((id) => !isPinnedAnomaly(id)) || anomalyIds.size !== observedAnomalies.length) fail();
  return frozen(output);
};

/** Package-internal fictional seam for capability-bound rarity correspondence contracts. */
export const reconcileOmensRecipeRarityCorrespondenceForTest = (
  identities: OmensRecipeOfficialIdentityReconciliation,
  official: OfficialUpstreamIdReconciliation,
  expected: MappedRecipeRarityExpectedAggregates
): OmensRecipeRarityCorrespondence => {
  try { return reconcile(identities, official, expected); }
  catch (error) { if (error instanceof OmensRecipeRarityCorrespondenceError) throw error; return fail(); }
};

/** Build-time-only observed correspondence over both completed opaque reconciliation capabilities. */
export const reconcileOmensRecipeRaritiesWithOfficialUpstreamPrintings = (
  identities: OmensRecipeOfficialIdentityReconciliation,
  official: OfficialUpstreamIdReconciliation
): OmensRecipeRarityCorrespondence => reconcileOmensRecipeRarityCorrespondenceForTest(identities, official, MAPPED_RECIPE_RARITY_ACCEPTED_AGGREGATES);
