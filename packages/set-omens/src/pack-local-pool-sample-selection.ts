import { mapUnsigned32SampleToBoundedTicket } from "@draft-table/engine";
import {
  readOmensPackLocalPoolDrawStatePoolForTicketSelection,
  type OmensPackLocalPoolDrawState
} from "./pack-local-pool-draw-state.ts";
import { selectOmensPackLocalPoolOfficialIdentityByTicket } from "./pack-local-pool-ticket-selection.ts";
import type { OmensRecipePoolOfficialIdentityResolution } from "./recipe-pool-identity-resolution.ts";

/** Stable, source-secret failure for one uint32 sample composed with a current pack-local pool. */
export class OmensPackLocalPoolSampleSelectionError extends Error {
  readonly code = "OMENS_PACK_LOCAL_POOL_SAMPLE_SELECTION_FAILED";

  constructor() {
    super("Omens one-sample pack local pool selection failed.");
    this.name = "OmensPackLocalPoolSampleSelectionError";
    this.stack = `${this.name}: ${this.message}`;
  }
}

type PoolReference = OmensRecipePoolOfficialIdentityResolution[number];
type OfficialIdentityReference = PoolReference["entries"][number]["officialIdentity"];

export type OmensPackLocalPoolSampleSelection = Readonly<{
  state: "selected";
  officialIdentityReference: OfficialIdentityReference;
}> | Readonly<{ state: "retry" }>;

type TicketSelector = (
  state: OmensPackLocalPoolDrawState,
  poolReference: PoolReference,
  ticket: number
) => OfficialIdentityReference;

const fail = (): never => { throw new OmensPackLocalPoolSampleSelectionError(); };
const frozen = <Value>(value: Value): Readonly<Value> => Object.freeze(value);
const retry = (): Readonly<{ state: "retry" }> => frozen({ state: "retry" });
const selected = (officialIdentityReference: OfficialIdentityReference): OmensPackLocalPoolSampleSelection =>
  frozen({ state: "selected", officialIdentityReference });

const composeFromOneSample = (
  state: OmensPackLocalPoolDrawState,
  poolReference: PoolReference,
  sample: number,
  selectOfficialIdentity: TicketSelector
): OmensPackLocalPoolSampleSelection => {
  const scope = readOmensPackLocalPoolDrawStatePoolForTicketSelection(state, poolReference);
  const mapping = mapUnsigned32SampleToBoundedTicket(sample, scope.scopedTotal);
  if (mapping.state === "retry") return retry();
  return selected(selectOfficialIdentity(state, poolReference, mapping.ticket));
};

/**
 * Composes exactly one caller-provided uint32 sample with one exact current pack-local pool.
 * A retry requests no replacement sample and invokes no ticket selector or state transition.
 */
export const selectOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample = (
  ...inputs: [OmensPackLocalPoolDrawState, PoolReference, number]
): OmensPackLocalPoolSampleSelection => {
  if (inputs.length !== 3) return fail();
  try { return composeFromOneSample(inputs[0], inputs[1], inputs[2], selectOmensPackLocalPoolOfficialIdentityByTicket); }
  catch (error) { if (error instanceof OmensPackLocalPoolSampleSelectionError) throw error; return fail(); }
};

/** Package-internal test seam proving retry never invokes the production ticket-selector position. */
export const selectOmensPackLocalPoolOfficialIdentityFromOneUnsigned32SampleForTest = (
  ...inputs: [OmensPackLocalPoolDrawState, PoolReference, number, TicketSelector]
): OmensPackLocalPoolSampleSelection => {
  if (inputs.length !== 4 || typeof inputs[3] !== "function") return fail();
  try { return composeFromOneSample(inputs[0], inputs[1], inputs[2], inputs[3]); }
  catch (error) { if (error instanceof OmensPackLocalPoolSampleSelectionError) throw error; return fail(); }
};
