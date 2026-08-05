import {
  readOfficialUpstreamIdReconciliationForDraftEligibility,
  type OfficialUpstreamIdReconciliation
} from "./official-upstream-id-reconciliation.ts";
import {
  readOmensRecipeOfficialIdentityReconciliationForDraftEligibility,
  type OmensRecipeOfficialIdentityReconciliation
} from "./recipe-official-identity-reconciliation.ts";

/** Stable, source-secret failure for the Omens product-policy classification. */
export class DraftEligibilityClassificationError extends Error {
  readonly code = "DRAFT_ELIGIBILITY_CLASSIFICATION_FAILED";

  constructor() {
    super("Draft eligibility classification failed.");
    this.name = "DraftEligibilityClassificationError";
    this.stack = `${this.name}: ${this.message}`;
  }
}

/**
 * Build-time Omens product facts. Evidence establishes ownership and recipe absence;
 * captain-approved product policy supplies the draftable and excluded meanings.
 */
export type OmensDraftEligibilityClassification = ReadonlyArray<Readonly<{
  officialPrintId: string;
  baseCollectorId: string;
  sourceSetMarker: "OMN" | "IAR";
  suffixMarker: "RF" | "CF" | "MV" | null;
  officialCardUniqueId: string;
  draftEligibility: "draftable" | "excluded" | "unclassified";
  classificationBasis: "captain-approved-recipe-draftable" | "captain-approved-IAR-exclusion" | "recipe-source-absence-open";
}>>;

type ExpectedAggregate = Readonly<{
  officialEntries: number;
  mappedEntries: number;
  mappedIarEntries: number;
  excludedEntries: number;
  excludedIarEntries: number;
  excludedNonIarEntries: number;
  unclassifiedEntries: number;
  unclassifiedOmnEntries: number;
  unclassifiedIarEntries: number;
  unclassifiedUnsuffixed: number;
  unclassifiedRf: number;
  unclassifiedCf: number;
  unclassifiedMv: number;
}>;

const acceptedAggregate: ExpectedAggregate = Object.freeze({
  officialEntries: 260,
  mappedEntries: 209,
  mappedIarEntries: 0,
  excludedEntries: 9,
  excludedIarEntries: 9,
  excludedNonIarEntries: 0,
  unclassifiedEntries: 42,
  unclassifiedOmnEntries: 42,
  unclassifiedIarEntries: 0,
  unclassifiedUnsuffixed: 33,
  unclassifiedRf: 6,
  unclassifiedCf: 3,
  unclassifiedMv: 0
});
const classificationCapabilities = new WeakMap<object, OmensRecipeOfficialIdentityReconciliation>();
const fail = (): never => { throw new DraftEligibilityClassificationError(); };
const frozen = <Value>(value: Value): Readonly<Value> => Object.freeze(value);

type OfficialRecord = OfficialUpstreamIdReconciliation[number];
type MappedIdentity = OmensRecipeOfficialIdentityReconciliation["mapped"][number];
type UnmappedIdentity = OmensRecipeOfficialIdentityReconciliation["unmapped"][number];

const reconcile = (
  identityCapability: OmensRecipeOfficialIdentityReconciliation,
  officialCapability: OfficialUpstreamIdReconciliation,
  expected: ExpectedAggregate
): OmensDraftEligibilityClassification => {
  const identities = readOmensRecipeOfficialIdentityReconciliationForDraftEligibility(identityCapability);
  const official = readOfficialUpstreamIdReconciliationForDraftEligibility(officialCapability);
  const officialByPrint = new Map<string, OfficialRecord>();
  const officialByBase = new Map<string, OfficialRecord>();
  const officialByCard = new Map<string, OfficialRecord>();
  for (const record of official) {
    if (officialByPrint.has(record.officialPrintId) || officialByBase.has(record.baseCollectorId) || officialByCard.has(record.unique_id)) fail();
    officialByPrint.set(record.officialPrintId, record);
    officialByBase.set(record.baseCollectorId, record);
    officialByCard.set(record.unique_id, record);
  }

  const mappedByOfficial = new Map<string, MappedIdentity>();
  const mappedOwned = new Set<OfficialRecord>();
  for (const identity of identities.mapped) {
    const record = officialByPrint.get(identity.officialPrintId) ?? fail();
    if (mappedByOfficial.has(identity.officialPrintId) || mappedOwned.has(record) ||
      record.officialPrintId !== identity.officialPrintId || record.baseCollectorId !== identity.officialBaseCollectorId || record.unique_id !== identity.officialCardUniqueId ||
      officialByBase.get(identity.officialBaseCollectorId) !== record || officialByCard.get(identity.officialCardUniqueId) !== record ||
      record.sourceSetMarker !== "OMN" || record.suffixMarker !== null) fail();
    mappedByOfficial.set(identity.officialPrintId, identity);
    mappedOwned.add(record);
  }

  const unmappedByOfficial = new Map<string, UnmappedIdentity>();
  const unmappedOwned = new Set<OfficialRecord>();
  for (const identity of identities.unmapped) {
    const record = officialByPrint.get(identity.officialPrintId) ?? fail();
    if (unmappedByOfficial.has(identity.officialPrintId) || unmappedOwned.has(record) || mappedOwned.has(record) ||
      record.officialPrintId !== identity.officialPrintId || record.baseCollectorId !== identity.baseCollectorId ||
      record.sourceSetMarker !== identity.sourceSetMarker || record.suffixMarker !== identity.suffixMarker || officialByBase.get(identity.baseCollectorId) !== record) fail();
    unmappedByOfficial.set(identity.officialPrintId, identity);
    unmappedOwned.add(record);
  }
  if (mappedOwned.size + unmappedOwned.size !== official.length || mappedOwned.size !== identities.mapped.length || unmappedOwned.size !== identities.unmapped.length) fail();

  let mappedIarEntries = 0, excludedIarEntries = 0, excludedNonIarEntries = 0;
  let unclassifiedOmnEntries = 0, unclassifiedIarEntries = 0, unclassifiedUnsuffixed = 0, unclassifiedRf = 0, unclassifiedCf = 0, unclassifiedMv = 0;
  const output: OmensDraftEligibilityClassification[number][] = [];
  for (const record of official) {
    const mapped = mappedByOfficial.has(record.officialPrintId);
    const unmapped = unmappedByOfficial.has(record.officialPrintId);
    if (mapped === unmapped) fail();
    const draftEligibility = mapped ? "draftable" : record.sourceSetMarker === "IAR" ? "excluded" : "unclassified";
    const classificationBasis = draftEligibility === "draftable" ? "captain-approved-recipe-draftable"
      : draftEligibility === "excluded" ? "captain-approved-IAR-exclusion" : "recipe-source-absence-open";
    if (mapped) { if (record.sourceSetMarker === "IAR") mappedIarEntries++; }
    else if (draftEligibility === "excluded") {
      if (record.sourceSetMarker === "IAR") excludedIarEntries++; else excludedNonIarEntries++;
    } else {
      if (record.sourceSetMarker === "OMN") unclassifiedOmnEntries++; else unclassifiedIarEntries++;
      if (record.suffixMarker === null) unclassifiedUnsuffixed++;
      else if (record.suffixMarker === "RF") unclassifiedRf++;
      else if (record.suffixMarker === "CF") unclassifiedCf++;
      else if (record.suffixMarker === "MV") unclassifiedMv++;
      else fail();
    }
    output.push(frozen({ officialPrintId: record.officialPrintId, baseCollectorId: record.baseCollectorId, sourceSetMarker: record.sourceSetMarker,
      suffixMarker: record.suffixMarker, officialCardUniqueId: record.unique_id, draftEligibility, classificationBasis }));
  }

  const mappedEntries = output.filter((entry) => entry.draftEligibility === "draftable").length;
  const excludedEntries = output.filter((entry) => entry.draftEligibility === "excluded").length;
  const unclassifiedEntries = output.filter((entry) => entry.draftEligibility === "unclassified").length;
  if (output.length !== expected.officialEntries || official.length !== expected.officialEntries ||
    mappedEntries !== expected.mappedEntries || mappedIarEntries !== expected.mappedIarEntries ||
    excludedEntries !== expected.excludedEntries || excludedIarEntries !== expected.excludedIarEntries || excludedNonIarEntries !== expected.excludedNonIarEntries ||
    unclassifiedEntries !== expected.unclassifiedEntries || unclassifiedOmnEntries !== expected.unclassifiedOmnEntries || unclassifiedIarEntries !== expected.unclassifiedIarEntries ||
    unclassifiedUnsuffixed !== expected.unclassifiedUnsuffixed || unclassifiedRf !== expected.unclassifiedRf || unclassifiedCf !== expected.unclassifiedCf || unclassifiedMv !== expected.unclassifiedMv ||
    mappedEntries + excludedEntries + unclassifiedEntries !== official.length ||
    unclassifiedUnsuffixed + unclassifiedRf + unclassifiedCf + unclassifiedMv !== unclassifiedEntries) fail();
  const capability = frozen(output);
  classificationCapabilities.set(capability, identityCapability);
  return capability;
};

/** Package-internal fictional seam for opaque capability classification contracts. */
export const classifyOmensDraftEligibilityForTest = (
  identities: OmensRecipeOfficialIdentityReconciliation,
  official: OfficialUpstreamIdReconciliation,
  expected: ExpectedAggregate
): OmensDraftEligibilityClassification => {
  try { return reconcile(identities, official, expected); }
  catch (error) { if (error instanceof DraftEligibilityClassificationError) throw error; return fail(); }
};

/** Reads only the exact completed product-policy capability for recipe-pool identity resolution. */
export const readOmensDraftEligibilityForPoolIdentityResolution = (
  classification: OmensDraftEligibilityClassification,
  identities: OmensRecipeOfficialIdentityReconciliation
): OmensDraftEligibilityClassification => classificationCapabilities.get(classification) === identities ? classification : fail();

/** Build-time Omens product classification; policy is fixed here and never caller supplied. */
export const classifyOmensOfficialDraftEligibility = (
  ...inputs: [OmensRecipeOfficialIdentityReconciliation, OfficialUpstreamIdReconciliation]
): OmensDraftEligibilityClassification => {
  if (inputs.length !== 2) return fail();
  return classifyOmensDraftEligibilityForTest(inputs[0], inputs[1], acceptedAggregate);
};
