import {
  readOmensCollationPoolWeightTablesForPackLocalDrawState,
  type OmensCollationWeightTables
} from "./collation-weight-tables.ts";
import type { OmensRecipePoolOfficialIdentityResolution } from "./recipe-pool-identity-resolution.ts";

/** Stable, source-secret failure for a pack-local pool draw-state transition. */
export class OmensPackLocalPoolDrawStateError extends Error {
  readonly code = "OMENS_PACK_LOCAL_POOL_DRAW_STATE_FAILED";

  constructor() {
    super("Omens pack local pool draw state failed.");
    this.name = "OmensPackLocalPoolDrawStateError";
    this.stack = `${this.name}: ${this.message}`;
  }
}

type PoolReference = OmensRecipePoolOfficialIdentityResolution[number];
type OfficialIdentityReference = PoolReference["entries"][number]["officialIdentity"];
type PoolChoice = Readonly<{
  officialIdentityReference: OfficialIdentityReference;
  weight: number;
  cumulativeExclusiveEnd: number;
}>;
export type OmensPackLocalPoolDrawState = Readonly<{
  poolStates: ReadonlyArray<Readonly<{
    poolReference: PoolReference;
    poolTotalWeight: number;
    officialIdentityChoices: ReadonlyArray<PoolChoice>;
  }>>;
}>;

type PoolState = OmensPackLocalPoolDrawState["poolStates"][number];
const EXPECTED_POOL_COUNT = 11;
const drawStateCapabilities = new WeakSet<object>();
const drawStateTables = new WeakMap<object, OmensCollationWeightTables>();
const freeze: typeof Object.freeze = Object.freeze;
const isFrozen: typeof Object.isFrozen = Object.isFrozen;
const isSafeInteger: typeof Number.isSafeInteger = Number.isSafeInteger;
const maximumSafeInteger = Number.MAX_SAFE_INTEGER;
const arrayEvery = Function.prototype.call.bind(Array.prototype.every) as <Value>(array: readonly Value[], predicate: (value: Value, index: number) => boolean) => boolean;
const arrayMap = Function.prototype.call.bind(Array.prototype.map) as <Value, Result>(array: readonly Value[], callback: (value: Value, index: number) => Result) => Result[];
const arrayFilter = Function.prototype.call.bind(Array.prototype.filter) as <Value>(array: readonly Value[], predicate: (value: Value) => boolean) => Value[];
const weakSetAdd = Function.prototype.call.bind(WeakSet.prototype.add) as (set: WeakSet<object>, value: object) => WeakSet<object>;
const weakSetHas = Function.prototype.call.bind(WeakSet.prototype.has) as (set: WeakSet<object>, value: object) => boolean;
const weakMapSet = Function.prototype.call.bind(WeakMap.prototype.set) as (map: WeakMap<object, OmensCollationWeightTables>, key: object, value: OmensCollationWeightTables) => WeakMap<object, OmensCollationWeightTables>;
const weakMapGet = Function.prototype.call.bind(WeakMap.prototype.get) as (map: WeakMap<object, OmensCollationWeightTables>, key: object) => OmensCollationWeightTables | undefined;
const setConstructor: typeof Set = Set;
const setHas = Function.prototype.call.bind(Set.prototype.has) as <Value>(set: Set<Value>, value: Value) => boolean;
const setAdd = Function.prototype.call.bind(Set.prototype.add) as <Value>(set: Set<Value>, value: Value) => Set<Value>;
const fail = (): never => { throw new OmensPackLocalPoolDrawStateError(); };
const frozen = <Value>(value: Value): Readonly<Value> => freeze(value);

const nextExclusiveEnd = (prior: number, weight: number): number => {
  if (!isSafeInteger(prior) || prior < 0 || !isSafeInteger(weight) || weight <= 0 || prior > maximumSafeInteger - weight) fail();
  const next = prior + weight;
  if (!isSafeInteger(next) || next <= prior) fail();
  return next;
};

const validPoolState = (poolState: PoolState): boolean => {
  if (!isFrozen(poolState) || !isFrozen(poolState.poolReference) ||
    !isFrozen(poolState.officialIdentityChoices) || !isSafeInteger(poolState.poolTotalWeight) || poolState.poolTotalWeight < 0) return false;
  let prior = 0;
  const identities = new setConstructor<OfficialIdentityReference>();
  for (let index = 0; index < poolState.officialIdentityChoices.length; index++) {
    const choice = poolState.officialIdentityChoices[index];
    if (!isFrozen(choice) || !isFrozen(choice.officialIdentityReference) || setHas(identities, choice.officialIdentityReference)) return false;
    setAdd(identities, choice.officialIdentityReference);
    prior = nextExclusiveEnd(prior, choice.weight);
    if (choice.cumulativeExclusiveEnd !== prior) return false;
  }
  return prior === poolState.poolTotalWeight && (poolState.officialIdentityChoices.length > 0 || poolState.poolTotalWeight === 0);
};

const register = (
  poolStates: ReadonlyArray<PoolState>,
  tables: OmensCollationWeightTables
): OmensPackLocalPoolDrawState => {
  if (poolStates.length !== EXPECTED_POOL_COUNT || !arrayEvery(poolStates, validPoolState)) fail();
  const state = frozen({ poolStates: frozen(poolStates) });
  weakSetAdd(drawStateCapabilities, state);
  weakMapSet(drawStateTables, state, tables);
  return state;
};

const initialize = (tables: OmensCollationWeightTables): OmensPackLocalPoolDrawState => {
  const sourceTables = readOmensCollationPoolWeightTablesForPackLocalDrawState(tables);
  if (sourceTables.length !== EXPECTED_POOL_COUNT) fail();
  const poolReferences = new setConstructor<PoolReference>();
  const poolStates: PoolState[] = arrayMap(sourceTables, (table) => {
    if (setHas(poolReferences, table.poolReference)) return fail();
    setAdd(poolReferences, table.poolReference);
    return frozen({
      poolReference: table.poolReference,
      poolTotalWeight: table.poolTotalWeight,
      officialIdentityChoices: table.officialIdentityChoices
    });
  });
  return register(poolStates, tables);
};

/** Creates a fresh immutable pack-local projection of all registered identity-pool weight tables. */
export const initializeOmensPackLocalPoolDrawState = (
  ...inputs: [OmensCollationWeightTables]
): OmensPackLocalPoolDrawState => {
  if (inputs.length !== 1) return fail();
  try { return initialize(inputs[0]); }
  catch (error) { if (error instanceof OmensPackLocalPoolDrawStateError) throw error; return fail(); }
};

/** Narrow capability check retained as a constituent of exact plan freshness validation. */
export const isOmensPackLocalPoolDrawStateRegisteredForPlanInitialization = (
  tables: OmensCollationWeightTables,
  state: OmensPackLocalPoolDrawState
): boolean => weakSetHas(drawStateCapabilities, state) && weakMapGet(drawStateTables, state) === tables;

/** Narrow exact-freshness check consumed only by selected pack-collation-plan initialization. */
export const isOmensPackLocalPoolDrawStateFreshForPlanInitialization = (
  tables: OmensCollationWeightTables,
  state: OmensPackLocalPoolDrawState
): boolean => {
  if (!isOmensPackLocalPoolDrawStateRegisteredForPlanInitialization(tables, state) ||
    state.poolStates.length !== tables.poolTables.length) return false;
  return arrayEvery(state.poolStates, (poolState, poolIndex) => {
    const poolTable = tables.poolTables[poolIndex];
    if (poolState.poolReference !== poolTable.poolReference ||
      poolState.poolTotalWeight !== poolTable.poolTotalWeight ||
      poolState.officialIdentityChoices.length !== poolTable.officialIdentityChoices.length) return false;
    return arrayEvery(poolState.officialIdentityChoices, (choice, choiceIndex) => {
      const expected = poolTable.officialIdentityChoices[choiceIndex];
      return choice.officialIdentityReference === expected.officialIdentityReference &&
        choice.weight === expected.weight &&
        choice.cumulativeExclusiveEnd === expected.cumulativeExclusiveEnd;
    });
  });
};

const removeFromPool = (selectedPool: PoolState, selectedIdentity: OfficialIdentityReference): PoolState => {
  const choices = selectedPool.officialIdentityChoices;
  const selectedChoices = arrayFilter(choices, (choice) => choice.officialIdentityReference === selectedIdentity);
  if (selectedChoices.length !== 1) fail();
  const selectedChoice = selectedChoices[0];
  const nextTotal = selectedPool.poolTotalWeight - selectedChoice.weight;
  if (!isSafeInteger(nextTotal) || nextTotal < 0) fail();
  let cumulativeExclusiveEnd = 0;
  const nextChoices: PoolChoice[] = [];
  for (let index = 0; index < choices.length; index++) {
    const choice = choices[index];
    if (choice === selectedChoice) continue;
    cumulativeExclusiveEnd = nextExclusiveEnd(cumulativeExclusiveEnd, choice.weight);
    nextChoices.push(frozen({
      officialIdentityReference: choice.officialIdentityReference,
      weight: choice.weight,
      cumulativeExclusiveEnd
    }));
  }
  if (cumulativeExclusiveEnd !== nextTotal) fail();
  return frozen({
    poolReference: selectedPool.poolReference,
    poolTotalWeight: nextTotal,
    officialIdentityChoices: frozen(nextChoices)
  });
};

/** Narrow reader for one current pack-local pool consumed only by current-state selection composition. */
export const readOmensPackLocalPoolDrawStatePoolForTicketSelection = (
  state: OmensPackLocalPoolDrawState,
  poolReference: PoolReference
): Readonly<{
  scopedTotal: number;
  choices: ReadonlyArray<PoolChoice>;
}> => {
  if (!weakSetHas(drawStateCapabilities, state) || !isFrozen(poolReference)) return fail();
  const selectedPools = arrayFilter(state.poolStates, (poolState) => poolState.poolReference === poolReference);
  if (selectedPools.length !== 1 || !validPoolState(selectedPools[0])) return fail();
  const selectedPool = selectedPools[0];
  return frozen({ scopedTotal: selectedPool.poolTotalWeight, choices: selectedPool.officialIdentityChoices });
};

/** Removes one exact identity only from its exact pack-local pool and recompiles that pool's prefixes. */
export const removeOmensPackLocalPoolOfficialIdentity = (
  ...inputs: [OmensPackLocalPoolDrawState, PoolReference, OfficialIdentityReference]
): OmensPackLocalPoolDrawState => {
  if (inputs.length !== 3) return fail();
  try {
    const [state, selectedPoolReference, selectedIdentity] = inputs;
    if (!weakSetHas(drawStateCapabilities, state) || !isFrozen(selectedPoolReference) || !isFrozen(selectedIdentity)) return fail();
    const selectedPools = arrayFilter(state.poolStates, (poolState) => poolState.poolReference === selectedPoolReference);
    if (selectedPools.length !== 1) return fail();
    const selectedPool = selectedPools[0];
    if (!validPoolState(selectedPool)) return fail();
    const nextPoolStates = arrayMap(state.poolStates, (poolState) => poolState === selectedPool
      ? removeFromPool(poolState, selectedIdentity)
      : poolState);
    const tables = weakMapGet(drawStateTables, state);
    if (tables === undefined) return fail();
    return register(nextPoolStates, tables);
  } catch (error) { if (error instanceof OmensPackLocalPoolDrawStateError) throw error; return fail(); }
};
