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
  isOmensPackLocalPoolDrawStateRegisteredForPlanInitialization,
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
export type OmensPackCollationPlanPositionSelection = Readonly<{
  positionReference: PositionReference;
  officialIdentityReference: OfficialIdentityReference;
}>;
export type OmensPackCollationPlanSelectionHistory = ReadonlyArray<OmensPackCollationPlanPositionSelection>;
type PlanParts = Readonly<{
  tables: OmensCollationWeightTables;
  layoutReference: LayoutReference;
  poolDrawState: OmensPackLocalPoolDrawState;
  nextPosition: number;
  selectionHistory: OmensPackCollationPlanSelectionHistory;
}>;

/** Opaque, immutable historical capability for one exact layout, pool state, cursor, and accepted-selection history. */
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

const freshSelectionHistory = (): OmensPackCollationPlanSelectionHistory => frozen([]);

const exactSelectionHistory = (
  parts: PlanParts,
  candidate: unknown
): candidate is OmensPackCollationPlanSelectionHistory => {
  if (candidate !== parts.selectionHistory || !isFrozen(parts.selectionHistory) ||
    !isSafeInteger(parts.nextPosition) || parts.nextPosition < 0 ||
    parts.nextPosition > EXPECTED_POSITION_COUNT ||
    parts.selectionHistory.length !== parts.nextPosition ||
    !isOmensPackLocalPoolDrawStateRegisteredForPlanInitialization(parts.tables, parts.poolDrawState) ||
    parts.poolDrawState.poolStates.length !== parts.tables.poolTables.length) return false;
  if (!arrayEvery(parts.selectionHistory, (record, index) =>
    isFrozen(record) && isFrozen(record.positionReference) &&
    isFrozen(record.officialIdentityReference) &&
    record.positionReference === parts.layoutReference.slots[index] &&
    record.positionReference.position === index + 1)) return false;
  return arrayEvery(parts.tables.poolTables, (poolTable, poolIndex) => {
    const poolState = parts.poolDrawState.poolStates[poolIndex];
    if (poolState === undefined || poolState.poolReference !== poolTable.poolReference) return false;
    let selectedCount = 0;
    arrayEvery(parts.selectionHistory, (record) => {
      if (record.positionReference.resolvedPool === poolTable.poolReference) selectedCount++;
      return true;
    });
    if (poolState.officialIdentityChoices.length !== poolTable.officialIdentityChoices.length - selectedCount) return false;
    let stateChoiceIndex = 0, cumulativeExclusiveEnd = 0;
    const choicesAreExact = arrayEvery(poolTable.officialIdentityChoices, (tableChoice) => {
      const wasSelected = arrayFind(parts.selectionHistory, (record) =>
        record.positionReference.resolvedPool === poolTable.poolReference &&
        record.officialIdentityReference === tableChoice.officialIdentityReference
      ) !== undefined;
      if (wasSelected) return true;
      cumulativeExclusiveEnd += tableChoice.weight;
      const stateChoice = poolState.officialIdentityChoices[stateChoiceIndex++];
      return stateChoice !== undefined &&
        stateChoice.officialIdentityReference === tableChoice.officialIdentityReference &&
        stateChoice.weight === tableChoice.weight &&
        stateChoice.cumulativeExclusiveEnd === cumulativeExclusiveEnd;
    });
    return choicesAreExact && stateChoiceIndex === poolState.officialIdentityChoices.length &&
      poolState.poolTotalWeight === cumulativeExclusiveEnd;
  });
};

const appendSelectionHistory = (
  prior: OmensPackCollationPlanSelectionHistory,
  positionReference: PositionReference,
  officialIdentityReference: OfficialIdentityReference
): OmensPackCollationPlanSelectionHistory => {
  const record = {} as {
    positionReference: PositionReference;
    officialIdentityReference: OfficialIdentityReference;
  };
  defineOwnDataProperty(record, "positionReference", { value: positionReference, writable: false, enumerable: true, configurable: false });
  defineOwnDataProperty(record, "officialIdentityReference", { value: officialIdentityReference, writable: false, enumerable: true, configurable: false });
  const immutableRecord = frozen(record);
  const history: OmensPackCollationPlanPositionSelection[] = [];
  arrayEvery(prior, (priorRecord, index) => {
    defineOwnDataProperty(history, index, { value: priorRecord, writable: false, enumerable: true, configurable: false });
    return true;
  });
  defineOwnDataProperty(history, prior.length, { value: immutableRecord, writable: false, enumerable: true, configurable: false });
  // Both sequential numeric writes use captured own-property definition, so this mismatch is
  // unreachable in the current construction. Retain it as defense in depth for a future
  // wrong-length construction defect.
  if (history.length !== prior.length + 1) return fail();
  return frozen(history);
};

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
  const selectionHistory = freshSelectionHistory();
  const parts = frozen({ tables, layoutReference, poolDrawState, nextPosition: 0, selectionHistory });
  if (!isFrozen(selectionHistory) || selectionHistory.length !== 0) return fail();
  const plan: OmensPackCollationPlan = frozen({});
  weakMapSet(planCapabilities, plan, parts);
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

/** Package-internal immutable source-order facts for a future completed-plan boundary. */
export const readOmensPackCollationPlanSelectionHistoryForCompletion = (
  plan: OmensPackCollationPlan
): OmensPackCollationPlanSelectionHistory => {
  const parts = partsFor(plan);
  return exactSelectionHistory(parts, parts.selectionHistory) ? parts.selectionHistory : fail();
};

/** Package-internal current-position capability reader; terminal plans reject before mapping. */
export const readOmensPackCollationPlanCurrentPositionForTransition = (
  plan: OmensPackCollationPlan
): Readonly<{ positionReference: PositionReference; poolDrawState: OmensPackLocalPoolDrawState }> => {
  const parts = partsFor(plan);
  if (!exactSelectionHistory(parts, parts.selectionHistory) ||
    !isSafeInteger(parts.nextPosition) || parts.nextPosition < 0 ||
    parts.nextPosition >= EXPECTED_POSITION_COUNT) return fail();
  const positionReference = parts.layoutReference.slots[parts.nextPosition];
  if (positionReference === undefined || !isFrozen(positionReference) ||
    positionReference.position !== parts.nextPosition + 1) return fail();
  return frozen({ positionReference, poolDrawState: parts.poolDrawState });
};

const registerPositionTransition = (
  priorPlan: OmensPackCollationPlan,
  priorSelectionHistory: unknown,
  positionReference: PositionReference,
  officialIdentityReference: OfficialIdentityReference,
  nextPoolDrawState: OmensPackLocalPoolDrawState
): OmensPackCollationPlan => {
  const prior = partsFor(priorPlan);
  if (!exactSelectionHistory(prior, priorSelectionHistory) ||
    prior.nextPosition >= EXPECTED_POSITION_COUNT ||
    prior.layoutReference.slots[prior.nextPosition] !== positionReference ||
    !isOmensPackLocalPoolDrawStateExactRemovalForPlanTransition(
      prior.tables, prior.poolDrawState, nextPoolDrawState,
      positionReference.resolvedPool, officialIdentityReference
    )) return fail();
  const selectionHistory = appendSelectionHistory(
    prior.selectionHistory, positionReference, officialIdentityReference
  );
  const nextParts = frozen({
    tables: prior.tables,
    layoutReference: prior.layoutReference,
    poolDrawState: nextPoolDrawState,
    nextPosition: prior.nextPosition + 1,
    selectionHistory
  });
  if (!exactSelectionHistory(nextParts, selectionHistory)) return fail();
  const nextPlan: OmensPackCollationPlan = frozen({});
  weakMapSet(planCapabilities, nextPlan, nextParts);
  return nextPlan;
};

/** Package-internal registration of exactly one validated atomic position transition. */
export const registerOmensPackCollationPlanPositionTransition = (
  ...inputs: [OmensPackCollationPlan, PositionReference, OfficialIdentityReference, OmensPackLocalPoolDrawState]
): OmensPackCollationPlan => {
  if (inputs.length !== 4) return fail();
  try {
    const [priorPlan, positionReference, officialIdentityReference, nextPoolDrawState] = inputs;
    const prior = partsFor(priorPlan);
    return registerPositionTransition(
      priorPlan, prior.selectionHistory, positionReference, officialIdentityReference, nextPoolDrawState
    );
  } catch (error) {
    if (error instanceof OmensPackCollationPlanInitializationError) throw error;
    return fail();
  }
};

/** Package-internal seam proving supplied prior history facts cannot be forged or substituted. */
export const registerOmensPackCollationPlanPositionTransitionWithPriorHistoryForTest = (
  ...inputs: [OmensPackCollationPlan, OmensPackCollationPlanSelectionHistory, PositionReference, OfficialIdentityReference, OmensPackLocalPoolDrawState]
): OmensPackCollationPlan => {
  if (inputs.length !== 5) return fail();
  try { return registerPositionTransition(inputs[0], inputs[1], inputs[2], inputs[3], inputs[4]); }
  catch (error) {
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
    const appendedRecord = next === undefined ? undefined : next.selectionHistory[next.selectionHistory.length - 1];
    return prior !== undefined && next !== undefined && priorPlan !== nextPlan &&
      exactSelectionHistory(prior, prior.selectionHistory) &&
      exactSelectionHistory(next, next.selectionHistory) &&
      isSafeInteger(prior.nextPosition) && isSafeInteger(next.nextPosition) &&
      prior.nextPosition >= 0 && prior.nextPosition < EXPECTED_POSITION_COUNT &&
      prior.layoutReference.slots[prior.nextPosition] === positionReference &&
      next.tables === prior.tables && next.layoutReference === prior.layoutReference &&
      next.poolDrawState === nextPoolDrawState && next.nextPosition === prior.nextPosition + 1 &&
      next.selectionHistory !== prior.selectionHistory &&
      next.selectionHistory.length === prior.selectionHistory.length + 1 &&
      arrayEvery(prior.selectionHistory, (record, index) => next.selectionHistory[index] === record) &&
      appendedRecord !== undefined && arrayFind(prior.selectionHistory, (record) => record === appendedRecord) === undefined &&
      appendedRecord.positionReference === positionReference &&
      appendedRecord.officialIdentityReference === officialIdentityReference &&
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
