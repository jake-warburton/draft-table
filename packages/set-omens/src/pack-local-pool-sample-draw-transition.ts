import {
  selectOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample,
  type OmensPackLocalPoolSampleSelection
} from "./pack-local-pool-sample-selection.ts";
import {
  removeOmensPackLocalPoolOfficialIdentity,
  type OmensPackLocalPoolDrawState
} from "./pack-local-pool-draw-state.ts";
import type { OmensRecipePoolOfficialIdentityResolution } from "./recipe-pool-identity-resolution.ts";

/** Stable, source-secret failure for one atomic pack-local uint32 sample draw transition. */
export class OmensPackLocalPoolSampleDrawTransitionError extends Error {
  readonly code = "OMENS_PACK_LOCAL_POOL_SAMPLE_DRAW_TRANSITION_FAILED";

  constructor() {
    super("Omens one-sample pack local pool draw transition failed.");
    this.name = "OmensPackLocalPoolSampleDrawTransitionError";
    this.stack = `${this.name}: ${this.message}`;
  }
}

type PoolReference = OmensRecipePoolOfficialIdentityResolution[number];
type OfficialIdentityReference = PoolReference["entries"][number]["officialIdentity"];
export type OmensPackLocalPoolSampleDrawTransition = Readonly<{
  state: "selected";
  officialIdentityReference: OfficialIdentityReference;
  nextState: OmensPackLocalPoolDrawState;
}> | Readonly<{ state: "retry" }>;

const fail = (): never => { throw new OmensPackLocalPoolSampleDrawTransitionError(); };
const frozen = <Value>(value: Value): Readonly<Value> => Object.freeze(value);
const retry = (): Readonly<{ state: "retry" }> => frozen({ state: "retry" });
const selected = (
  officialIdentityReference: OfficialIdentityReference,
  nextState: OmensPackLocalPoolDrawState
): OmensPackLocalPoolSampleDrawTransition => frozen({ state: "selected", officialIdentityReference, nextState });

const transitionFromOneSample = (
  state: OmensPackLocalPoolDrawState,
  poolReference: PoolReference,
  sample: number
): OmensPackLocalPoolSampleDrawTransition => {
  const selection: OmensPackLocalPoolSampleSelection = selectOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample(state, poolReference, sample);
  if (selection.state === "retry") return retry();
  const nextState = removeOmensPackLocalPoolOfficialIdentity(state, poolReference, selection.officialIdentityReference);
  if (nextState === state) return fail();
  return selected(selection.officialIdentityReference, nextState);
};

/**
 * Composes exactly one caller-provided uint32 sample with one current pack-local pool and atomically
 * returns either explicit retry or the exact selected identity with its exact immutable same-pool next state.
 */
export const drawOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample = (
  ...inputs: [OmensPackLocalPoolDrawState, PoolReference, number]
): OmensPackLocalPoolSampleDrawTransition => {
  if (inputs.length !== 3) return fail();
  try { return transitionFromOneSample(inputs[0], inputs[1], inputs[2]); }
  catch (error) { if (error instanceof OmensPackLocalPoolSampleDrawTransitionError) throw error; return fail(); }
};
