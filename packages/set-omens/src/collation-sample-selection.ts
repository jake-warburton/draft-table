import { mapUnsigned32SampleToBoundedTicket } from "@draft-table/engine";
import {
  readOmensCollationLayoutWeightTotalForSampleSelection,
  readOmensCollationPoolWeightTotalForSampleSelection,
  type OmensCollationWeightTables
} from "./collation-weight-tables.ts";
import {
  selectOmensCollationLayoutByTicket,
  selectOmensCollationPoolOfficialIdentityByTicket
} from "./collation-weight-ticket-selection.ts";
import type { OmensRecipeLayoutOfficialIdentityPoolResolution } from "./recipe-layout-pool-resolution.ts";
import type { OmensRecipePoolOfficialIdentityResolution } from "./recipe-pool-identity-resolution.ts";

/** Stable, source-secret failure for exactly one uint32 sample composed with collation selection. */
export class OmensCollationSampleSelectionError extends Error {
  readonly code = "OMENS_COLLATION_SAMPLE_SELECTION_FAILED";

  constructor() {
    super("Omens one-sample collation selection failed.");
    this.name = "OmensCollationSampleSelectionError";
    this.stack = `${this.name}: ${this.message}`;
  }
}

export type OmensCollationLayoutSampleSelection = Readonly<{
  state: "selected";
  layoutReference: OmensRecipeLayoutOfficialIdentityPoolResolution["layouts"][number];
}> | Readonly<{ state: "retry" }>;

export type OmensCollationPoolSampleSelection = Readonly<{
  state: "selected";
  officialIdentityReference: OmensRecipePoolOfficialIdentityResolution[number]["entries"][number]["officialIdentity"];
}> | Readonly<{ state: "retry" }>;

const fail = (): never => { throw new OmensCollationSampleSelectionError(); };
const frozen = <Value>(value: Value): Readonly<Value> => Object.freeze(value);
const retry = (): Readonly<{ state: "retry" }> => frozen({ state: "retry" });
const selectedLayout = (
  layoutReference: OmensRecipeLayoutOfficialIdentityPoolResolution["layouts"][number]
): OmensCollationLayoutSampleSelection => frozen({ state: "selected", layoutReference });
const selectedOfficialIdentity = (
  officialIdentityReference: OmensRecipePoolOfficialIdentityResolution[number]["entries"][number]["officialIdentity"]
): OmensCollationPoolSampleSelection => frozen({ state: "selected", officialIdentityReference });

type LayoutTicketSelector = (
  tables: OmensCollationWeightTables,
  ticket: number
) => OmensRecipeLayoutOfficialIdentityPoolResolution["layouts"][number];
type PoolTicketSelector = (
  tables: OmensCollationWeightTables,
  poolReference: OmensRecipePoolOfficialIdentityResolution[number],
  ticket: number
) => OmensRecipePoolOfficialIdentityResolution[number]["entries"][number]["officialIdentity"];

const composeLayoutSelectionFromOneSample = (
  tables: OmensCollationWeightTables,
  sample: number,
  selectLayout: LayoutTicketSelector
): OmensCollationLayoutSampleSelection => {
  const scopedTotal = readOmensCollationLayoutWeightTotalForSampleSelection(tables);
  const mapping = mapUnsigned32SampleToBoundedTicket(sample, scopedTotal);
  if (mapping.state === "retry") return retry();
  return selectedLayout(selectLayout(tables, mapping.ticket));
};

/**
 * Composes exactly one caller-provided uint32 sample with the registered layout scope.
 * A retry requests no replacement sample and invokes no ticket selector.
 */
export const selectOmensCollationLayoutFromOneUnsigned32Sample = (
  ...inputs: [OmensCollationWeightTables, number]
): OmensCollationLayoutSampleSelection => {
  if (inputs.length !== 2) return fail();
  try { return composeLayoutSelectionFromOneSample(inputs[0], inputs[1], selectOmensCollationLayoutByTicket); }
  catch (error) { if (error instanceof OmensCollationSampleSelectionError) throw error; return fail(); }
};

/** Package-internal test seam proving retry never invokes the production selector position. */
export const selectOmensCollationLayoutFromOneUnsigned32SampleForTest = (
  ...inputs: [OmensCollationWeightTables, number, LayoutTicketSelector]
): OmensCollationLayoutSampleSelection => {
  if (inputs.length !== 3 || typeof inputs[2] !== "function") return fail();
  try { return composeLayoutSelectionFromOneSample(inputs[0], inputs[1], inputs[2]); }
  catch (error) { if (error instanceof OmensCollationSampleSelectionError) throw error; return fail(); }
};

const composePoolSelectionFromOneSample = (
  tables: OmensCollationWeightTables,
  poolReference: OmensRecipePoolOfficialIdentityResolution[number],
  sample: number,
  selectOfficialIdentity: PoolTicketSelector
): OmensCollationPoolSampleSelection => {
  const scopedTotal = readOmensCollationPoolWeightTotalForSampleSelection(tables, poolReference);
  const mapping = mapUnsigned32SampleToBoundedTicket(sample, scopedTotal);
  if (mapping.state === "retry") return retry();
  return selectedOfficialIdentity(selectOfficialIdentity(tables, poolReference, mapping.ticket));
};

/**
 * Composes exactly one caller-provided uint32 sample with one exact capability-owned pool scope.
 * A retry requests no replacement sample and invokes no ticket selector.
 */
export const selectOmensCollationPoolOfficialIdentityFromOneUnsigned32Sample = (
  ...inputs: [OmensCollationWeightTables, OmensRecipePoolOfficialIdentityResolution[number], number]
): OmensCollationPoolSampleSelection => {
  if (inputs.length !== 3) return fail();
  try { return composePoolSelectionFromOneSample(inputs[0], inputs[1], inputs[2], selectOmensCollationPoolOfficialIdentityByTicket); }
  catch (error) { if (error instanceof OmensCollationSampleSelectionError) throw error; return fail(); }
};

/** Package-internal test seam proving a pool retry never invokes the production selector position. */
export const selectOmensCollationPoolOfficialIdentityFromOneUnsigned32SampleForTest = (
  ...inputs: [OmensCollationWeightTables, OmensRecipePoolOfficialIdentityResolution[number], number, PoolTicketSelector]
): OmensCollationPoolSampleSelection => {
  if (inputs.length !== 4 || typeof inputs[3] !== "function") return fail();
  try { return composePoolSelectionFromOneSample(inputs[0], inputs[1], inputs[2], inputs[3]); }
  catch (error) { if (error instanceof OmensCollationSampleSelectionError) throw error; return fail(); }
};
