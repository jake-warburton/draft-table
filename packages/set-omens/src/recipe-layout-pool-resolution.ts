import {
  readCompletedOmensRecipeLayoutsForPoolResolution,
  readCompletedOmensRecipeLayoutsSourceOwner,
  type OmensLayouts
} from "./layouts.ts";
import {
  readOmensRecipePoolOfficialIdentityResolutionForLayouts,
  readOmensRecipePoolOfficialIdentityResolutionSourceOwner,
  type OmensRecipePoolOfficialIdentityResolution
} from "./recipe-pool-identity-resolution.ts";

/** Stable, source-secret failure for build-time recipe-layout pool resolution. */
export class OmensRecipeLayoutPoolResolutionError extends Error {
  readonly code = "OMENS_RECIPE_LAYOUT_POOL_RESOLUTION_FAILED";

  constructor() {
    super("Omens recipe layout pool resolution failed.");
    this.name = "OmensRecipeLayoutPoolResolutionError";
    this.stack = `${this.name}: ${this.message}`;
  }
}

export type OmensRecipeLayoutOfficialIdentityPoolResolution = Readonly<{
  /** Retained build-time recipe fact; runtime no-replacement enforcement is not implemented here. */
  withReplacement: false;
  layouts: ReadonlyArray<Readonly<{
    id: string;
    weight: number;
    slots: ReadonlyArray<Readonly<{
      position: number;
      sourcePoolLabel: string;
      /** Exact stable pool fact owned by the input opaque pool-resolution capability. */
      resolvedPool: OmensRecipePoolOfficialIdentityResolution[number];
    }>>;
  }>>;
}>;

const fail = (): never => { throw new OmensRecipeLayoutPoolResolutionError(); };
const frozen = <Value>(value: Value): Readonly<Value> => Object.freeze(value);

const resolve = (
  layoutCapability: OmensLayouts,
  poolCapability: OmensRecipePoolOfficialIdentityResolution
): OmensRecipeLayoutOfficialIdentityPoolResolution => {
  const pools = readOmensRecipePoolOfficialIdentityResolutionForLayouts(poolCapability);
  const poolOwner = readOmensRecipePoolOfficialIdentityResolutionSourceOwner(poolCapability);
  const layouts = readCompletedOmensRecipeLayoutsForPoolResolution(layoutCapability);
  const layoutOwner = readCompletedOmensRecipeLayoutsSourceOwner(layoutCapability);
  if (layoutOwner !== poolOwner) fail();

  const poolsByLabel = new Map<string, OmensRecipePoolOfficialIdentityResolution[number]>();
  const ownedPools = new Set<OmensRecipePoolOfficialIdentityResolution[number]>();
  for (const pool of pools) {
    if (poolsByLabel.has(pool.sourcePoolLabel) || ownedPools.has(pool)) fail();
    poolsByLabel.set(pool.sourcePoolLabel, pool);
    ownedPools.add(pool);
  }

  const usedPools = new Set<OmensRecipePoolOfficialIdentityResolution[number]>();
  const layoutIds = new Set<string>();
  const output: OmensRecipeLayoutOfficialIdentityPoolResolution["layouts"][number][] = [];
  for (const layout of layouts.layouts) {
    if (layoutIds.has(layout.id) || !Number.isSafeInteger(layout.weight) || layout.weight <= 0) fail();
    layoutIds.add(layout.id);
    const slots: OmensRecipeLayoutOfficialIdentityPoolResolution["layouts"][number]["slots"][number][] = [];
    for (const sourceSlot of layout.slots) {
      const pool = poolsByLabel.get(sourceSlot.pool) ?? fail();
      if (!ownedPools.has(pool) || !Number.isSafeInteger(sourceSlot.count) || sourceSlot.count <= 0) fail();
      usedPools.add(pool);
      for (let repetition = 0; repetition < sourceSlot.count; repetition++) {
        slots.push(frozen({ position: slots.length + 1, sourcePoolLabel: sourceSlot.pool, resolvedPool: pool }));
      }
    }
    if (slots.length !== 14) fail();
    output.push(frozen({ id: layout.id, weight: layout.weight, slots: frozen(slots) }));
  }
  if (output.length !== layouts.layouts.length || usedPools.size !== pools.length || [...ownedPools].some((pool) => !usedPools.has(pool))) fail();
  return frozen({ withReplacement: false, layouts: frozen(output) });
};

/** Package-internal compact fictional seam; accepts no policy or aggregate override. */
export const resolveOmensRecipeLayoutsToOfficialIdentityPoolsForTest = (
  ...inputs: [OmensLayouts, OmensRecipePoolOfficialIdentityResolution]
): OmensRecipeLayoutOfficialIdentityPoolResolution => {
  if (inputs.length !== 2) return fail();
  try { return resolve(inputs[0], inputs[1]); }
  catch (error) { if (error instanceof OmensRecipeLayoutPoolResolutionError) throw error; return fail(); }
};

/** Build-time-only resolution of every completed weighted layout slot to its exact resolved official-identity pool. */
export const resolveOmensRecipeLayoutsToOfficialIdentityPools = (
  ...inputs: [OmensLayouts, OmensRecipePoolOfficialIdentityResolution]
): OmensRecipeLayoutOfficialIdentityPoolResolution => resolveOmensRecipeLayoutsToOfficialIdentityPoolsForTest(...inputs);
