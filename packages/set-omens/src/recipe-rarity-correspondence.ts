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
  /** Exact, first-observed-order unique upstream row strings; no normalization or semantic renaming. */
  exactUpstreamRarityStrings: ReadonlyArray<FabRarityCode>;
  observedCorrespondenceClass: "exact-common-C" | "pinned-common-C-V-anomaly" | "exact-rare-R" | "exact-majestic-M";
  /** Observation flag only; later draftability/treatment work must classify these identities. */
  requiresDraftabilityTreatmentClassification: boolean;
}>>;

type ExpectedAggregate = Readonly<{
  entries: number;
  exactCommonC: number;
  anomalousCommonCV: number;
  exactRareR: number;
  exactMajesticM: number;
  anomalyOfficialPrintIds: ReadonlyArray<string>;
}>;

const acceptedAggregate: ExpectedAggregate = Object.freeze({
  entries: 209,
  exactCommonC: 132,
  anomalousCommonCV: 2,
  exactRareR: 60,
  exactMajesticM: 15,
  anomalyOfficialPrintIds: Object.freeze(["OMN199", "OMN201"])
});
const fail = (): never => { throw new OmensRecipeRarityCorrespondenceError(); };
const frozen = <Value>(value: Value): Readonly<Value> => Object.freeze(value);

const reconcile = (
  identityCapability: OmensRecipeOfficialIdentityReconciliation,
  officialCapability: OfficialUpstreamIdReconciliation,
  expected: ExpectedAggregate
): OmensRecipeRarityCorrespondence => {
  const identities = readOmensRecipeOfficialIdentityReconciliationForRarityCorrespondence(identityCapability);
  const official = readOfficialUpstreamIdReconciliationForSuffixFoiling(officialCapability);
  const candidates = identities.mapped;
  if (candidates.length !== expected.entries || expected.anomalyOfficialPrintIds.length !== 2) fail();

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

  let exactCommonC = 0, anomalousCommonCV = 0, exactRareR = 0, exactMajesticM = 0;
  const owned = new Set<OfficialUpstreamIdReconciliation[number]>();
  const output: Array<OmensRecipeRarityCorrespondence[number]> = [];
  for (const identity of candidates) {
    const record = byOfficial.get(identity.officialPrintId) ?? fail();
    if (byBase.get(identity.officialBaseCollectorId) !== record || byCard.get(identity.officialCardUniqueId) !== record ||
      record.officialPrintId !== identity.officialPrintId || record.baseCollectorId !== identity.officialBaseCollectorId || record.unique_id !== identity.officialCardUniqueId ||
      owned.has(record) || record.printings.length === 0) fail();
    owned.add(record);

    const rarityStrings: string[] = [];
    const seen = new Set<string>();
    for (const row of record.printings) if (!seen.has(row.rarity)) { seen.add(row.rarity); rarityStrings.push(row.rarity); }
    const key = [...rarityStrings].sort().join("\u0000");
    const label = identity.recipeRarityLabel;
    const translation = translateOmensRecipeRarityAtFabSeam(label);
    const fabRarity = translation.fabRarity;
    let observedCorrespondenceClass: OmensRecipeRarityCorrespondence[number]["observedCorrespondenceClass"] = "exact-common-C";
    let requiresDraftabilityTreatmentClassification = false;
    if (key === translation.correspondingUpstreamCode && fabRarity === "common") { observedCorrespondenceClass = "exact-common-C"; exactCommonC++; }
    else if (fabRarity === "common" && key === "C\u0000V" && isPinnedAnomaly(identity.officialPrintId)) {
      observedCorrespondenceClass = "pinned-common-C-V-anomaly"; requiresDraftabilityTreatmentClassification = true; anomalousCommonCV++;
    } else if (key === translation.correspondingUpstreamCode && fabRarity === "rare") { observedCorrespondenceClass = "exact-rare-R"; exactRareR++; }
    else if (key === translation.correspondingUpstreamCode && fabRarity === "majestic") { observedCorrespondenceClass = "exact-majestic-M"; exactMajesticM++; }
    else fail();

    const retainedRarityCodes = rarityStrings as FabRarityCode[];
    output.push(frozen({ recipeCollectorNumber: identity.recipeCollectorNumber, recipeRarityLabel: label, fabRarity,
      officialPrintId: identity.officialPrintId, exactUpstreamRarityStrings: frozen(retainedRarityCodes), observedCorrespondenceClass,
      requiresDraftabilityTreatmentClassification }));
  }

  const observedAnomalies = output.filter((entry) => entry.observedCorrespondenceClass === "pinned-common-C-V-anomaly").map((entry) => entry.officialPrintId);
  if (output.length !== expected.entries || owned.size !== expected.entries || exactCommonC !== expected.exactCommonC ||
    anomalousCommonCV !== expected.anomalousCommonCV || exactRareR !== expected.exactRareR || exactMajesticM !== expected.exactMajesticM ||
    exactCommonC + anomalousCommonCV + exactRareR + exactMajesticM !== expected.entries || observedAnomalies.length !== 2 ||
    observedAnomalies.some((id) => !isPinnedAnomaly(id)) || anomalyIds.size !== observedAnomalies.length) fail();
  return frozen(output);
};

/** Package-internal fictional seam for capability-bound rarity correspondence contracts. */
export const reconcileOmensRecipeRarityCorrespondenceForTest = (
  identities: OmensRecipeOfficialIdentityReconciliation,
  official: OfficialUpstreamIdReconciliation,
  expected: ExpectedAggregate
): OmensRecipeRarityCorrespondence => {
  try { return reconcile(identities, official, expected); }
  catch (error) { if (error instanceof OmensRecipeRarityCorrespondenceError) throw error; return fail(); }
};

/** Build-time-only observed correspondence over both completed opaque reconciliation capabilities. */
export const reconcileOmensRecipeRaritiesWithOfficialUpstreamPrintings = (
  identities: OmensRecipeOfficialIdentityReconciliation,
  official: OfficialUpstreamIdReconciliation
): OmensRecipeRarityCorrespondence => reconcileOmensRecipeRarityCorrespondenceForTest(identities, official, acceptedAggregate);
