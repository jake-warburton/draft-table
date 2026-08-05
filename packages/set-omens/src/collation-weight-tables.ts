import {
  readOmensRecipeLayoutOfficialIdentityPoolResolutionForCollationWeightCompilation,
  type OmensRecipeLayoutOfficialIdentityPoolResolution
} from "./recipe-layout-pool-resolution.ts";
import {
  readOmensRecipePoolOfficialIdentityResolutionForCollationWeightCompilation,
  readOmensRecipePoolOfficialIdentityResolutionPoolTotalWeightForCollationWeightCompilation,
  type OmensRecipePoolOfficialIdentityResolution
} from "./recipe-pool-identity-resolution.ts";

/** Stable, source-secret failure for build-time collation-weight compilation. */
export class OmensCollationWeightTablesError extends Error {
  readonly code = "OMENS_COLLATION_WEIGHT_TABLES_FAILED";

  constructor() {
    super("Omens collation weight tables failed.");
    this.name = "OmensCollationWeightTablesError";
    this.stack = `${this.name}: ${this.message}`;
  }
}

/** Build-time-only exact integer cumulative-weight tables. This is not a selector. */
export type OmensCollationWeightTables = Readonly<{
  layoutTotalWeight: number;
  layoutChoices: ReadonlyArray<Readonly<{
    /** Exact completed layout fact, including retained recipe-structural roles. */
    layoutReference: OmensRecipeLayoutOfficialIdentityPoolResolution["layouts"][number];
    weight: number;
    cumulativeExclusiveEnd: number;
  }>>;
  poolTables: ReadonlyArray<Readonly<{
    /** Exact completed pool fact; no pool label or identity text is copied here. */
    poolReference: OmensRecipePoolOfficialIdentityResolution[number];
    poolTotalWeight: number;
    officialIdentityChoices: ReadonlyArray<Readonly<{
      /** Exact identity reference owned by the completed pool capability. */
      officialIdentityReference: OmensRecipePoolOfficialIdentityResolution[number]["entries"][number]["officialIdentity"];
      weight: number;
      cumulativeExclusiveEnd: number;
    }>>;
  }>>;
}>;

const EXPECTED_LAYOUT_COUNT = 228;
const EXPECTED_LAYOUT_TOTAL_WEIGHT = 460800;
const EXPECTED_POOL_COUNT = 11;
const collationWeightTableCapabilities = new WeakSet<object>();
const freeze: typeof Object.freeze = Object.freeze;
const isSafeInteger: typeof Number.isSafeInteger = Number.isSafeInteger;
const maximumSafeInteger = Number.MAX_SAFE_INTEGER;
const weakSetHas = Function.prototype.call.bind(WeakSet.prototype.has) as (set: WeakSet<object>, value: object) => boolean;
const arraySome = Function.prototype.call.bind(Array.prototype.some) as <Value>(array: readonly Value[], predicate: (value: Value) => boolean) => boolean;
const arrayFind = Function.prototype.call.bind(Array.prototype.find) as <Value>(array: readonly Value[], predicate: (value: Value) => boolean) => Value | undefined;
const fail = (): never => { throw new OmensCollationWeightTablesError(); };
const frozen = <Value>(value: Value): Readonly<Value> => freeze(value);

const nextExclusiveEnd = (prior: number, weight: number): number => {
  if (!isSafeInteger(prior) || prior < 0 || !isSafeInteger(weight) || weight <= 0 || prior > maximumSafeInteger - weight) fail();
  const next = prior + weight;
  if (!isSafeInteger(next) || next <= prior || next <= 0) fail();
  return next;
};

/** Internal seam proving exact safe-integer prefix arithmetic without accepting a table input. */
export const validateOmensCollationWeightPrefixForTest = (...weights: number[]): number => {
  let prior = 0;
  for (const weight of weights) prior = nextExclusiveEnd(prior, weight);
  return prior;
};

const compile = (
  layoutCapability: OmensRecipeLayoutOfficialIdentityPoolResolution,
  poolCapability: OmensRecipePoolOfficialIdentityResolution
): OmensCollationWeightTables => {
  const layouts = readOmensRecipeLayoutOfficialIdentityPoolResolutionForCollationWeightCompilation(layoutCapability, poolCapability);
  const pools = readOmensRecipePoolOfficialIdentityResolutionForCollationWeightCompilation(poolCapability);
  if (layouts.layouts.length !== EXPECTED_LAYOUT_COUNT || pools.length !== EXPECTED_POOL_COUNT) fail();

  let layoutTotalWeight = 0;
  const layoutReferences = new Set<OmensRecipeLayoutOfficialIdentityPoolResolution["layouts"][number]>();
  const layoutChoices: OmensCollationWeightTables["layoutChoices"][number][] = [];
  for (const layout of layouts.layouts) {
    if (layoutReferences.has(layout)) fail();
    layoutReferences.add(layout);
    layoutTotalWeight = nextExclusiveEnd(layoutTotalWeight, layout.weight);
    layoutChoices.push(frozen({ layoutReference: layout, weight: layout.weight, cumulativeExclusiveEnd: layoutTotalWeight }));
  }
  if (layoutChoices.length !== EXPECTED_LAYOUT_COUNT || layoutTotalWeight !== EXPECTED_LAYOUT_TOTAL_WEIGHT) fail();

  const poolReferences = new Set<OmensRecipePoolOfficialIdentityResolution[number]>();
  const poolTables: OmensCollationWeightTables["poolTables"][number][] = [];
  for (const pool of pools) {
    if (poolReferences.has(pool)) fail();
    poolReferences.add(pool);
    const poolTotalWeight = readOmensRecipePoolOfficialIdentityResolutionPoolTotalWeightForCollationWeightCompilation(poolCapability, pool);
    if (!isSafeInteger(poolTotalWeight) || poolTotalWeight <= 0) fail();
    let prior = 0;
    const officialIdentityChoices: OmensCollationWeightTables["poolTables"][number]["officialIdentityChoices"][number][] = [];
    for (const entry of pool.entries) {
      prior = nextExclusiveEnd(prior, entry.weight);
      officialIdentityChoices.push(frozen({ officialIdentityReference: entry.officialIdentity, weight: entry.weight, cumulativeExclusiveEnd: prior }));
    }
    if (officialIdentityChoices.length === 0 || prior !== poolTotalWeight) fail();
    poolTables.push(frozen({ poolReference: pool, poolTotalWeight, officialIdentityChoices: frozen(officialIdentityChoices) }));
  }
  if (poolTables.length !== EXPECTED_POOL_COUNT) fail();
  const capability = frozen({ layoutTotalWeight, layoutChoices: frozen(layoutChoices), poolTables: frozen(poolTables) });
  collationWeightTableCapabilities.add(capability);
  return capability;
};

/** Package-internal compact fictional seam; accepts no aggregate, identity, or selection override. */
export const compileOmensCollationWeightTablesForTest = (
  ...inputs: [OmensRecipeLayoutOfficialIdentityPoolResolution, OmensRecipePoolOfficialIdentityResolution]
): OmensCollationWeightTables => {
  if (inputs.length !== 2) return fail();
  try { return compile(inputs[0], inputs[1]); }
  catch (error) { if (error instanceof OmensCollationWeightTablesError) throw error; return fail(); }
};

/** Narrow reader for the registered layout table consumed only by bounded-ticket selection. */
export const readOmensCollationLayoutWeightTableForTicketSelection = (
  tables: OmensCollationWeightTables
): Readonly<{
  scopedTotal: number;
  choices: OmensCollationWeightTables["layoutChoices"];
}> => {
  if (!weakSetHas(collationWeightTableCapabilities, tables)) fail();
  return frozen({ scopedTotal: tables.layoutTotalWeight, choices: tables.layoutChoices });
};

/** Narrow reader for the registered layout total consumed only by one-sample composition. */
export const readOmensCollationLayoutWeightTotalForSampleSelection = (
  tables: OmensCollationWeightTables
): number => {
  if (!weakSetHas(collationWeightTableCapabilities, tables)) fail();
  return tables.layoutTotalWeight;
};

/** Narrow ownership check consumed only by selected pack-collation-plan initialization. */
export const isOmensCollationLayoutRegisteredForPlanInitialization = (
  tables: OmensCollationWeightTables,
  layoutReference: OmensRecipeLayoutOfficialIdentityPoolResolution["layouts"][number]
): boolean => weakSetHas(collationWeightTableCapabilities, tables) && arraySome(tables.layoutChoices, (choice) => choice.layoutReference === layoutReference);

/** Narrow reader for all exact registered pool tables consumed only by pack-local draw-state initialization. */
export const readOmensCollationPoolWeightTablesForPackLocalDrawState = (
  tables: OmensCollationWeightTables
): OmensCollationWeightTables["poolTables"] => weakSetHas(collationWeightTableCapabilities, tables) ? tables.poolTables : fail();

/** Narrow reader for one exact registered named pool table consumed only by bounded-ticket selection. */
export const readOmensCollationPoolWeightTableForTicketSelection = (
  tables: OmensCollationWeightTables,
  poolReference: OmensRecipePoolOfficialIdentityResolution[number]
): Readonly<{
  scopedTotal: number;
  choices: OmensCollationWeightTables["poolTables"][number]["officialIdentityChoices"];
}> => {
  if (!weakSetHas(collationWeightTableCapabilities, tables)) fail();
  const table = arrayFind(tables.poolTables, (candidate) => candidate.poolReference === poolReference);
  if (table === undefined) return fail();
  return frozen({ scopedTotal: table.poolTotalWeight, choices: table.officialIdentityChoices });
};

/** Narrow reader for one exact registered named pool total consumed only by one-sample composition. */
export const readOmensCollationPoolWeightTotalForSampleSelection = (
  tables: OmensCollationWeightTables,
  poolReference: OmensRecipePoolOfficialIdentityResolution[number]
): number => {
  if (!weakSetHas(collationWeightTableCapabilities, tables)) fail();
  const table = arrayFind(tables.poolTables, (candidate) => candidate.poolReference === poolReference);
  if (table === undefined) return fail();
  return table.poolTotalWeight;
};

/** Build-time-only compilation of exact source-order integer cumulative-weight tables; no draw is performed. */
export const compileOmensCollationWeightTables = (
  ...inputs: [OmensRecipeLayoutOfficialIdentityPoolResolution, OmensRecipePoolOfficialIdentityResolution]
): OmensCollationWeightTables => compileOmensCollationWeightTablesForTest(...inputs);
