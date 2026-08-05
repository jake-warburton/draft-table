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
  isOmensPackLocalPoolDrawStateExactRemovalForPlanTransition,
  isOmensPackLocalPoolDrawStateFreshForPlanInitialization,
  type OmensPackLocalPoolDrawState
} from "./pack-local-pool-draw-state.ts";
import type { OmensRecipeLayoutOfficialIdentityPoolResolution } from "./recipe-layout-pool-resolution.ts";

const defineOwnDataProperty: typeof Object.defineProperty = Object.defineProperty;
const freeze: typeof Object.freeze = Object.freeze;
const isFrozen: typeof Object.isFrozen = Object.isFrozen;
const isSafeInteger: typeof Number.isSafeInteger = Number.isSafeInteger;

/** Stable, source-secret failure for one selected layout's fresh pack-local collation plan. */
export class OmensPackCollationPlanInitializationError extends Error {
  declare readonly code: "OMENS_PACK_COLLATION_PLAN_INITIALIZATION_FAILED";

  constructor() {
    super("Omens pack collation plan initialization failed.");
    defineOwnDataProperty(this, "name", { value: "OmensPackCollationPlanInitializationError", writable: true, enumerable: true, configurable: true });
    defineOwnDataProperty(this, "code", { value: "OMENS_PACK_COLLATION_PLAN_INITIALIZATION_FAILED", writable: true, enumerable: true, configurable: true });
    defineOwnDataProperty(this, "stack", { value: "OmensPackCollationPlanInitializationError: Omens pack collation plan initialization failed.", writable: true, enumerable: false, configurable: true });
  }
}

freeze(OmensPackCollationPlanInitializationError.prototype);
freeze(OmensPackCollationPlanInitializationError);

type LayoutReference = OmensRecipeLayoutOfficialIdentityPoolResolution["layouts"][number];
type PositionReference = LayoutReference["slots"][number];
type OfficialIdentityReference = PositionReference["resolvedPool"]["entries"][number]["officialIdentity"];
type PlanParts = Readonly<{
  tables: OmensCollationWeightTables;
  layoutReference: LayoutReference;
  poolDrawState: OmensPackLocalPoolDrawState;
  nextPosition: number;
}>;

/** Opaque, immutable historical capability for one exact layout, pool state, and cursor. */
export type OmensPackCollationPlan = Readonly<Record<never, never>>;
export type OmensPackCollationPlanInitialization = Readonly<{
  state: "selected";
  layoutReference: LayoutReference;
  plan: OmensPackCollationPlan;
}> | Readonly<{ state: "retry" }>;

type LayoutSelector = (tables: OmensCollationWeightTables, sample: number) => OmensCollationLayoutSampleSelection;
type PoolStateInitializer = (tables: OmensCollationWeightTables) => OmensPackLocalPoolDrawState;

const EXPECTED_POOL_COUNT = 11;
const EXPECTED_POSITION_COUNT = 14;
const planCapabilities = new WeakMap<object, PlanParts>();
const arrayFrom: typeof Array.from = Array.from;
const arrayEvery = Function.prototype.call.bind(Array.prototype.every) as <Value>(array: readonly Value[], predicate: (value: Value, index: number) => boolean) => boolean;
const arrayFind = Function.prototype.call.bind(Array.prototype.find) as <Value>(array: readonly Value[], predicate: (value: Value) => boolean) => Value | undefined;
const mapConstructor: typeof Map = Map;
const mapGet = Function.prototype.call.bind(Map.prototype.get) as <Key, Value>(map: Map<Key, Value>, key: Key) => Value | undefined;
const mapSet = Function.prototype.call.bind(Map.prototype.set) as <Key, Value>(map: Map<Key, Value>, key: Key, value: Value) => Map<Key, Value>;
const weakMapGet = Function.prototype.call.bind(WeakMap.prototype.get) as <Value>(map: WeakMap<object, Value>, key: object) => Value | undefined;
const weakMapSet = Function.prototype.call.bind(WeakMap.prototype.set) as <Value>(map: WeakMap<object, Value>, key: object, value: Value) => WeakMap<object, Value>;
const fail = (): never => { throw new OmensPackCollationPlanInitializationError(); };
const frozen = <Value>(value: Value): Readonly<Value> => freeze(value);
const expectedRoles = frozen([
  ...arrayFrom({ length: 11 }, () => "common-rarity" as const),
  "fixed-rare" as const,
  "rare-or-majestic" as const,
  "rainbow-foil" as const
]);
const retry = (): Readonly<{ state: "retry" }> => frozen({ state: "retry" });

const validateSelectedPlan = (
  tables: OmensCollationWeightTables,
  layoutReference: LayoutReference
): void => {
  if (!isOmensCollationLayoutRegisteredForPlanInitialization(tables, layoutReference) ||
    !isFrozen(tables.poolTables) || tables.poolTables.length !== EXPECTED_POOL_COUNT ||
    !isFrozen(layoutReference) || !isFrozen(layoutReference.slots) ||
    layoutReference.slots.length !== EXPECTED_POSITION_COUNT) fail();
  // Identity membership is established here; downstream compiled-layout self-comparison is meaningless.
  if (arrayFind(tables.layoutChoices, (choice) => choice.layoutReference === layoutReference) === undefined) return fail();
  const poolTablesByReference = new mapConstructor<OmensCollationWeightTables["poolTables"][number]["poolReference"], OmensCollationWeightTables["poolTables"][number]>();
  if (!arrayEvery(tables.poolTables, (table) => {
    if (mapGet(poolTablesByReference, table.poolReference) !== undefined) return false;
    mapSet(poolTablesByReference, table.poolReference, table);
    return true;
  })) fail();
  const requiredByPool = new mapConstructor<OmensCollationWeightTables["poolTables"][number]["poolReference"], number>();
  if (!arrayEvery(layoutReference.slots, (position, index) => {
    const poolTable = mapGet(poolTablesByReference, position.resolvedPool);
    if (!isFrozen(position) || position.position !== index + 1 ||
      position.recipeStructuralRole !== expectedRoles[index] || poolTable === undefined) return false;
    mapSet(requiredByPool, position.resolvedPool, (mapGet(requiredByPool, position.resolvedPool) ?? 0) + 1);
    return true;
  })) fail();
  if (!arrayEvery(tables.poolTables, (poolTable) => {
    const required = mapGet(requiredByPool, poolTable.poolReference);
    return required === undefined || (poolTable.poolTotalWeight > 0 && poolTable.officialIdentityChoices.length >= required);
  })) fail();
};

const register = (
  tables: OmensCollationWeightTables,
  layoutReference: LayoutReference,
  poolDrawState: OmensPackLocalPoolDrawState
): OmensPackCollationPlan => {
  if (!isOmensCollationLayoutRegisteredForPlanInitialization(tables, layoutReference) ||
    !isFrozen(layoutReference) || !isFrozen(layoutReference.slots) || layoutReference.slots.length !== 14 ||
    !isOmensPackLocalPoolDrawStateFreshForPlanInitialization(tables, poolDrawState)) fail();
  const plan: OmensPackCollationPlan = frozen({});
  weakMapSet(planCapabilities, plan, frozen({ tables, layoutReference, poolDrawState, nextPosition: 0 }));
  return plan;
};

/** Package-internal selected-layout registration boundary shared by finite-batch composition. */
export const registerOmensPackCollationPlanForExactSelectedLayout = (
  tables: OmensCollationWeightTables,
  layoutReference: LayoutReference
): OmensPackCollationPlan => {
  validateSelectedPlan(tables, layoutReference);
  return register(tables, layoutReference, initializeOmensPackLocalPoolDrawState(tables));
};

const compose = (
  tables: OmensCollationWeightTables,
  sample: number,
  selectLayout: LayoutSelector,
  initializePoolDrawState: PoolStateInitializer
): OmensPackCollationPlanInitialization => {
  const selection = selectLayout(tables, sample);
  if (selection.state === "retry") return retry();
  validateSelectedPlan(tables, selection.layoutReference);
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

const partsFor = (plan: OmensPackCollationPlan): PlanParts => weakMapGet(planCapabilities, plan) ?? fail();

/** Narrow reader returning only the exact layout reference bound during initialization. */
export const readOmensPackCollationPlanLayoutForTransition = (plan: OmensPackCollationPlan): LayoutReference => partsFor(plan).layoutReference;

/** Narrow reader returning the registered all-pool historical state bound to this exact plan. */
export const readOmensPackCollationPlanPoolDrawStateForTransition = (plan: OmensPackCollationPlan): OmensPackLocalPoolDrawState => partsFor(plan).poolDrawState;

/** Narrow reader returning the exact next recipe-position cursor. */
export const readOmensPackCollationPlanNextPositionForTransition = (plan: OmensPackCollationPlan): number => partsFor(plan).nextPosition;

/** Package-internal current-position capability reader; terminal plans reject before mapping. */
export const readOmensPackCollationPlanCurrentPositionForTransition = (
  plan: OmensPackCollationPlan
): Readonly<{ positionReference: PositionReference; poolDrawState: OmensPackLocalPoolDrawState }> => {
  const parts = partsFor(plan);
  if (!isSafeInteger(parts.nextPosition) || parts.nextPosition < 0 ||
    parts.nextPosition >= EXPECTED_POSITION_COUNT) return fail();
  const positionReference = parts.layoutReference.slots[parts.nextPosition];
  if (positionReference === undefined || !isFrozen(positionReference) ||
    positionReference.position !== parts.nextPosition + 1) return fail();
  return frozen({ positionReference, poolDrawState: parts.poolDrawState });
};

/** Package-internal registration of exactly one validated atomic position transition. */
export const registerOmensPackCollationPlanPositionTransition = (
  ...inputs: [OmensPackCollationPlan, PositionReference, OfficialIdentityReference, OmensPackLocalPoolDrawState]
): OmensPackCollationPlan => {
  if (inputs.length !== 4) return fail();
  try {
    const [priorPlan, positionReference, officialIdentityReference, nextPoolDrawState] = inputs;
    const prior = partsFor(priorPlan);
    if (!isSafeInteger(prior.nextPosition) || prior.nextPosition < 0 ||
      prior.nextPosition >= EXPECTED_POSITION_COUNT ||
      prior.layoutReference.slots[prior.nextPosition] !== positionReference ||
      !isOmensPackLocalPoolDrawStateExactRemovalForPlanTransition(
        prior.tables, prior.poolDrawState, nextPoolDrawState,
        positionReference.resolvedPool, officialIdentityReference
      )) return fail();
    const nextPlan: OmensPackCollationPlan = frozen({});
    weakMapSet(planCapabilities, nextPlan, frozen({
      tables: prior.tables,
      layoutReference: prior.layoutReference,
      poolDrawState: nextPoolDrawState,
      nextPosition: prior.nextPosition + 1
    }));
    return nextPlan;
  } catch (error) {
    if (error instanceof OmensPackCollationPlanInitializationError) throw error;
    return fail();
  }
};

/** Package-internal exact relationship check for injected registration results. */
export const isOmensPackCollationPlanExactPositionTransition = (
  priorPlan: OmensPackCollationPlan,
  nextPlan: OmensPackCollationPlan,
  positionReference: PositionReference,
  officialIdentityReference: OfficialIdentityReference,
  nextPoolDrawState: OmensPackLocalPoolDrawState
): boolean => {
  try {
    const prior = weakMapGet(planCapabilities, priorPlan), next = weakMapGet(planCapabilities, nextPlan);
    return prior !== undefined && next !== undefined && priorPlan !== nextPlan &&
      isSafeInteger(prior.nextPosition) && isSafeInteger(next.nextPosition) &&
      prior.nextPosition >= 0 && prior.nextPosition < EXPECTED_POSITION_COUNT &&
      prior.layoutReference.slots[prior.nextPosition] === positionReference &&
      next.tables === prior.tables && next.layoutReference === prior.layoutReference &&
      next.poolDrawState === nextPoolDrawState && next.nextPosition === prior.nextPosition + 1 &&
      isOmensPackLocalPoolDrawStateExactRemovalForPlanTransition(
        prior.tables, prior.poolDrawState, nextPoolDrawState,
        positionReference.resolvedPool, officialIdentityReference
      );
  } catch { return false; }
};

/** Package-internal identity reader for capability-retention contracts only. */
export const readOmensPackCollationPlanTablesForTest = (
  plan: OmensPackCollationPlan
): OmensCollationWeightTables => partsFor(plan).tables;
