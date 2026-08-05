import {
  selectOmensCollationLayoutFromOneUnsigned32Sample,
  type OmensCollationLayoutSampleSelection
} from "./collation-sample-selection.ts";
import {
  isOmensCollationLayoutRegisteredForPlanInitialization,
  type OmensCollationWeightTables
} from "./collation-weight-tables.ts";
import {
  initializeOmensPackLocalPoolDrawState,
  isOmensPackLocalPoolDrawStateRegisteredForPlanInitialization,
  type OmensPackLocalPoolDrawState
} from "./pack-local-pool-draw-state.ts";
import type { OmensRecipeLayoutOfficialIdentityPoolResolution } from "./recipe-layout-pool-resolution.ts";

/** Stable, source-secret failure for one selected layout's fresh pack-local collation plan. */
export class OmensPackCollationPlanInitializationError extends Error {
  readonly code = "OMENS_PACK_COLLATION_PLAN_INITIALIZATION_FAILED";

  constructor() {
    super("Omens pack collation plan initialization failed.");
    this.name = "OmensPackCollationPlanInitializationError";
    this.stack = `${this.name}: ${this.message}`;
  }
}

type LayoutReference = OmensRecipeLayoutOfficialIdentityPoolResolution["layouts"][number];
type PlanParts = Readonly<{
  tables: OmensCollationWeightTables;
  layoutReference: LayoutReference;
  poolDrawState: OmensPackLocalPoolDrawState;
  nextPosition: 0;
}>;

/** Opaque, immutable initial state for future recipe-position transitions. */
export type OmensPackCollationPlan = Readonly<Record<never, never>>;
export type OmensPackCollationPlanInitialization = Readonly<{
  state: "selected";
  layoutReference: LayoutReference;
  plan: OmensPackCollationPlan;
}> | Readonly<{ state: "retry" }>;

type LayoutSelector = (tables: OmensCollationWeightTables, sample: number) => OmensCollationLayoutSampleSelection;
type PoolStateInitializer = (tables: OmensCollationWeightTables) => OmensPackLocalPoolDrawState;

const planCapabilities = new WeakMap<object, PlanParts>();
const fail = (): never => { throw new OmensPackCollationPlanInitializationError(); };
const frozen = <Value>(value: Value): Readonly<Value> => Object.freeze(value);
const retry = (): Readonly<{ state: "retry" }> => frozen({ state: "retry" });

const register = (
  tables: OmensCollationWeightTables,
  layoutReference: LayoutReference,
  poolDrawState: OmensPackLocalPoolDrawState
): OmensPackCollationPlan => {
  if (!isOmensCollationLayoutRegisteredForPlanInitialization(tables, layoutReference) ||
    !Object.isFrozen(layoutReference) || !Object.isFrozen(layoutReference.slots) || layoutReference.slots.length !== 14 ||
    !isOmensPackLocalPoolDrawStateRegisteredForPlanInitialization(tables, poolDrawState)) fail();
  const plan: OmensPackCollationPlan = frozen({});
  planCapabilities.set(plan, frozen({ tables, layoutReference, poolDrawState, nextPosition: 0 }));
  return plan;
};

const compose = (
  tables: OmensCollationWeightTables,
  sample: number,
  selectLayout: LayoutSelector,
  initializePoolDrawState: PoolStateInitializer
): OmensPackCollationPlanInitialization => {
  const selection = selectLayout(tables, sample);
  if (selection.state === "retry") return retry();
  const plan = register(tables, selection.layoutReference, initializePoolDrawState(tables));
  return frozen({ state: "selected", layoutReference: selection.layoutReference, plan });
};

/**
 * Uses one caller-provided uint32 sample to select one exact layout and, only when selected,
 * creates one fresh immutable all-pool plan. It performs no position transition or card draw.
 */
export const initializeOmensPackCollationPlanFromOneUnsigned32Sample = (
  ...inputs: [OmensCollationWeightTables, number]
): OmensPackCollationPlanInitialization => {
  if (inputs.length !== 2) return fail();
  try { return compose(inputs[0], inputs[1], selectOmensCollationLayoutFromOneUnsigned32Sample, initializeOmensPackLocalPoolDrawState); }
  catch (error) { if (error instanceof OmensPackCollationPlanInitializationError) throw error; return fail(); }
};

/** Package-internal seam proving composition cannot initialize on retry or substitute accepted inputs. */
export const initializeOmensPackCollationPlanFromOneUnsigned32SampleForTest = (
  ...inputs: [OmensCollationWeightTables, number, LayoutSelector, PoolStateInitializer]
): OmensPackCollationPlanInitialization => {
  if (inputs.length !== 4 || typeof inputs[2] !== "function" || typeof inputs[3] !== "function") return fail();
  try { return compose(inputs[0], inputs[1], inputs[2], inputs[3]); }
  catch (error) { if (error instanceof OmensPackCollationPlanInitializationError) throw error; return fail(); }
};

const partsFor = (plan: OmensPackCollationPlan): PlanParts => planCapabilities.get(plan) ?? fail();

/** Narrow reader returning only the exact layout reference bound during initialization. */
export const readOmensPackCollationPlanLayoutForTransition = (plan: OmensPackCollationPlan): LayoutReference => partsFor(plan).layoutReference;

/** Narrow reader returning only the fresh registered all-pool state bound during initialization. */
export const readOmensPackCollationPlanPoolDrawStateForTransition = (plan: OmensPackCollationPlan): OmensPackLocalPoolDrawState => partsFor(plan).poolDrawState;

/** Narrow reader returning the initial recipe-position cursor for a future transition. */
export const readOmensPackCollationPlanNextPositionForTransition = (plan: OmensPackCollationPlan): number => partsFor(plan).nextPosition;
