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

export type OmensRecipeStructuralRole = "common-rarity" | "fixed-rare" | "rare-or-majestic" | "rainbow-foil";

export type OmensRecipeLayoutOfficialIdentityPoolResolution = Readonly<{
  /** Retained build-time recipe fact; runtime no-replacement enforcement is not implemented here. */
  withReplacement: false;
  layouts: ReadonlyArray<Readonly<{
    id: string;
    weight: number;
    slots: ReadonlyArray<Readonly<{
      position: number;
      sourcePoolLabel: string;
      recipeStructuralRole: OmensRecipeStructuralRole;
      /** Exact stable pool fact owned by the input opaque pool-resolution capability. */
      resolvedPool: OmensRecipePoolOfficialIdentityResolution[number];
    }>>;
  }>>;
}>;

const layoutResolutionCapabilities = new WeakMap<object, OmensRecipePoolOfficialIdentityResolution>();
const fail = (): never => { throw new OmensRecipeLayoutPoolResolutionError(); };
const frozen = <Value>(value: Value): Readonly<Value> => Object.freeze(value);

/** Internal fictional seam for the exact recipe-structural outcome-count contract. */
export const validateOmensRecipeStructuralOutcomeCountsForTest = (
  layoutCount: number,
  rareSecondOutcomes: number,
  majesticSecondOutcomes: number
): void => {
  if (layoutCount === 228 && (rareSecondOutcomes !== 114 || majesticSecondOutcomes !== 114)) fail();
};

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
  let rareSecondOutcomes = 0;
  let majesticSecondOutcomes = 0;
  const output: OmensRecipeLayoutOfficialIdentityPoolResolution["layouts"][number][] = [];
  for (const layout of layouts.layouts) {
    if (layoutIds.has(layout.id) || !Number.isSafeInteger(layout.weight) || layout.weight <= 0) fail();
    layoutIds.add(layout.id);
    const slots: OmensRecipeLayoutOfficialIdentityPoolResolution["layouts"][number]["slots"][number][] = [];
    let commonCount = 0;
    let rareCount = 0;
    let majesticCount = 0;
    let rainbowCount = 0;
    for (const sourceSlot of layout.slots) {
      const pool = poolsByLabel.get(sourceSlot.pool) ?? fail();
      if (!ownedPools.has(pool) || !Number.isSafeInteger(sourceSlot.count) || sourceSlot.count <= 0) fail();
      usedPools.add(pool);
      for (let repetition = 0; repetition < sourceSlot.count; repetition++) {
        let recipeStructuralRole: OmensRecipeStructuralRole = "common-rarity";
        if (pool.recipePoolCategory === "rainbow-foil") {
          rainbowCount++;
          recipeStructuralRole = "rainbow-foil";
        } else if (pool.recipePoolCategory === "normal" && pool.fabRarity === "common") {
          commonCount++;
          recipeStructuralRole = "common-rarity";
        } else if (pool.recipePoolCategory === "normal" && pool.fabRarity === "rare") {
          rareCount++;
          recipeStructuralRole = rareCount === 1 ? "fixed-rare" : "rare-or-majestic";
        } else if (pool.recipePoolCategory === "normal" && pool.fabRarity === "majestic") {
          majesticCount++;
          recipeStructuralRole = "rare-or-majestic";
        } else fail();
        slots.push(frozen({ position: slots.length + 1, sourcePoolLabel: sourceSlot.pool, recipeStructuralRole, resolvedPool: pool }));
      }
    }
    if (slots.length !== 14 || commonCount !== 11 || rareCount < 1 || rareCount + majesticCount !== 2 ||
      rainbowCount !== 1 || (rareCount === 2 && majesticCount !== 0) || (rareCount === 1 && majesticCount !== 1)) fail();
    if (majesticCount === 0) rareSecondOutcomes++;
    else majesticSecondOutcomes++;
    output.push(frozen({ id: layout.id, weight: layout.weight, slots: frozen(slots) }));
  }
  if (output.length !== layouts.layouts.length || usedPools.size !== pools.length || [...ownedPools].some((pool) => !usedPools.has(pool))) fail();
  validateOmensRecipeStructuralOutcomeCountsForTest(output.length, rareSecondOutcomes, majesticSecondOutcomes);
  const capability = frozen({ withReplacement: false as const, layouts: frozen(output) });
  layoutResolutionCapabilities.set(capability, poolCapability);
  return capability;
};

/** Package-internal compact fictional seam; accepts no policy or aggregate override. */
export const resolveOmensRecipeLayoutsToOfficialIdentityPoolsForTest = (
  ...inputs: [OmensLayouts, OmensRecipePoolOfficialIdentityResolution]
): OmensRecipeLayoutOfficialIdentityPoolResolution => {
  if (inputs.length !== 2) return fail();
  try { return resolve(inputs[0], inputs[1]); }
  catch (error) { if (error instanceof OmensRecipeLayoutPoolResolutionError) throw error; return fail(); }
};

/** Narrow reader joining only an exact layout-resolution capability to its exact source pool capability. */
export const readOmensRecipeLayoutOfficialIdentityPoolResolutionForCollationWeightCompilation = (
  resolution: OmensRecipeLayoutOfficialIdentityPoolResolution,
  poolCapability: OmensRecipePoolOfficialIdentityResolution
): OmensRecipeLayoutOfficialIdentityPoolResolution => layoutResolutionCapabilities.get(resolution) === poolCapability ? resolution : fail();

/** Build-time-only resolution of every completed weighted layout slot to its exact resolved official-identity pool. */
export const resolveOmensRecipeLayoutsToOfficialIdentityPools = (
  ...inputs: [OmensLayouts, OmensRecipePoolOfficialIdentityResolution]
): OmensRecipeLayoutOfficialIdentityPoolResolution => resolveOmensRecipeLayoutsToOfficialIdentityPoolsForTest(...inputs);
