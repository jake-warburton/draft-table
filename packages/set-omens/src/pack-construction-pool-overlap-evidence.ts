import {
  readOmensRecipePoolOfficialIdentityResolutionForCollationWeightCompilation,
  type OmensRecipePoolOfficialIdentityResolution
} from "./recipe-pool-identity-resolution.ts";

const defineOwnDataProperty: typeof Object.defineProperty = Object.defineProperty;
const freeze: typeof Object.freeze = Object.freeze;
const isFrozen: typeof Object.isFrozen = Object.isFrozen;
const isArray: typeof Array.isArray = Array.isArray;
const setConstructor: typeof Set = Set;
const setHas = Function.prototype.call.bind(Set.prototype.has) as <Value>(set: Set<Value>, value: Value) => boolean;
const setAdd = Function.prototype.call.bind(Set.prototype.add) as <Value>(set: Set<Value>, value: Value) => Set<Value>;

/** Stable source-secret failure for the exact build-time normal/RF pool-overlap facts. */
export class OmensPackConstructionPoolOverlapEvidenceError extends Error {
  declare readonly code: "OMENS_PACK_CONSTRUCTION_POOL_OVERLAP_EVIDENCE_FAILED";

  constructor() {
    super("Omens pack construction pool-overlap evidence failed.");
    defineOwnDataProperty(this, "name", { value: "OmensPackConstructionPoolOverlapEvidenceError", writable: true, enumerable: true, configurable: true });
    defineOwnDataProperty(this, "code", { value: "OMENS_PACK_CONSTRUCTION_POOL_OVERLAP_EVIDENCE_FAILED", writable: true, enumerable: true, configurable: true });
    defineOwnDataProperty(this, "stack", { value: "OmensPackConstructionPoolOverlapEvidenceError: Omens pack construction pool-overlap evidence failed.", writable: true, enumerable: false, configurable: true });
  }
}

freeze(OmensPackConstructionPoolOverlapEvidenceError.prototype);
freeze(OmensPackConstructionPoolOverlapEvidenceError);

type OfficialIdentityReference = OmensRecipePoolOfficialIdentityResolution[number]["entries"][number]["officialIdentity"];
type PoolOverlapFact = Readonly<{
  recipePoolCategory: "normal" | "rainbow-foil";
  officialIdentities: ReadonlyArray<OfficialIdentityReference>;
}>;
export type OmensPackConstructionPoolOverlapEvidence = Readonly<{
  normalPoolCount: 8;
  normalUniqueIdentityCount: 209;
  rainbowFoilPoolCount: 3;
  rainbowFoilUniqueIdentityCount: 171;
}>;

const EXPECTED_NORMAL_POOL_COUNT = 8;
const EXPECTED_NORMAL_UNIQUE_IDENTITIES = 209;
const EXPECTED_RAINBOW_FOIL_POOL_COUNT = 3;
const EXPECTED_RAINBOW_FOIL_UNIQUE_IDENTITIES = 171;
const fail = (): never => { throw new OmensPackConstructionPoolOverlapEvidenceError(); };
const frozen = <Value>(value: Value): Readonly<Value> => freeze(value);
const identityKey = (identity: OfficialIdentityReference): string => {
  if (typeof identity !== "object" || identity === null || !isFrozen(identity) ||
    typeof identity.baseCollectorId !== "string" || identity.baseCollectorId.length === 0 ||
    typeof identity.cardUniqueId !== "string" || identity.cardUniqueId.length === 0) return fail();
  return `${identity.baseCollectorId.length}:${identity.baseCollectorId}${identity.cardUniqueId}`;
};

const validateFacts = (facts: readonly PoolOverlapFact[]): OmensPackConstructionPoolOverlapEvidence => {
  if (!isArray(facts) || !isFrozen(facts) || facts.length !== EXPECTED_NORMAL_POOL_COUNT + EXPECTED_RAINBOW_FOIL_POOL_COUNT) return fail();
  let normalPoolCount = 0, rainbowFoilPoolCount = 0;
  let normalPerPoolUniqueSum = 0, rainbowFoilPerPoolUniqueSum = 0;
  const normalIdentities = new setConstructor<string>();
  const rainbowFoilIdentities = new setConstructor<string>();
  for (let poolIndex = 0; poolIndex < facts.length; poolIndex++) {
    const pool = facts[poolIndex];
    if (typeof pool !== "object" || pool === null || !isFrozen(pool) ||
      !isArray(pool.officialIdentities) || !isFrozen(pool.officialIdentities) ||
      pool.officialIdentities.length === 0 ||
      (pool.recipePoolCategory !== "normal" && pool.recipePoolCategory !== "rainbow-foil")) return fail();
    const uniqueInPool = new setConstructor<string>();
    const categoryUnion = pool.recipePoolCategory === "normal" ? normalIdentities : rainbowFoilIdentities;
    for (let identityIndex = 0; identityIndex < pool.officialIdentities.length; identityIndex++) {
      const key = identityKey(pool.officialIdentities[identityIndex]);
      setAdd(uniqueInPool, key);
    }
    for (const key of uniqueInPool) {
      if (setHas(categoryUnion, key)) return fail();
      setAdd(categoryUnion, key);
    }
    if (pool.recipePoolCategory === "normal") {
      normalPoolCount++;
      normalPerPoolUniqueSum += uniqueInPool.size;
    } else {
      rainbowFoilPoolCount++;
      rainbowFoilPerPoolUniqueSum += uniqueInPool.size;
    }
  }
  if (normalPoolCount !== EXPECTED_NORMAL_POOL_COUNT ||
    rainbowFoilPoolCount !== EXPECTED_RAINBOW_FOIL_POOL_COUNT) return fail();
  if (normalIdentities.size !== EXPECTED_NORMAL_UNIQUE_IDENTITIES) return fail();
  if (normalPerPoolUniqueSum !== normalIdentities.size) return fail();
  if (rainbowFoilIdentities.size !== EXPECTED_RAINBOW_FOIL_UNIQUE_IDENTITIES ||
    rainbowFoilPerPoolUniqueSum !== rainbowFoilIdentities.size) return fail();
  if (rainbowFoilIdentities.size >= normalIdentities.size) return fail();
  for (const key of rainbowFoilIdentities) if (!setHas(normalIdentities, key)) return fail();

  const result = {} as {
    normalPoolCount: 8;
    normalUniqueIdentityCount: 209;
    rainbowFoilPoolCount: 3;
    rainbowFoilUniqueIdentityCount: 171;
  };
  defineOwnDataProperty(result, "normalPoolCount", { value: 8, writable: false, enumerable: true, configurable: false });
  defineOwnDataProperty(result, "normalUniqueIdentityCount", { value: 209, writable: false, enumerable: true, configurable: false });
  defineOwnDataProperty(result, "rainbowFoilPoolCount", { value: 3, writable: false, enumerable: true, configurable: false });
  defineOwnDataProperty(result, "rainbowFoilUniqueIdentityCount", { value: 171, writable: false, enumerable: true, configurable: false });
  return frozen(result);
};

/** Test-only aggregate seam; the production entry point below still requires an exact prior capability. */
export const validateOmensPackConstructionPoolOverlapFactsForTest = (
  ...inputs: [readonly PoolOverlapFact[]]
): OmensPackConstructionPoolOverlapEvidence => {
  try {
    if (inputs.length !== 1) return fail();
    return validateFacts(inputs[0]);
  } catch { return fail(); }
};

/**
 * Pins build-time facts that make construction-time identity-wide suppression unnecessary:
 * normal pools partition 209 identities and RF pools partition a strict 171-identity subset.
 */
export const validateOmensPackConstructionPoolOverlapEvidence = (
  ...inputs: [OmensRecipePoolOfficialIdentityResolution]
): OmensPackConstructionPoolOverlapEvidence => {
  try {
    if (inputs.length !== 1) return fail();
    const pools = readOmensRecipePoolOfficialIdentityResolutionForCollationWeightCompilation(inputs[0]);
    const facts: PoolOverlapFact[] = [];
    for (let poolIndex = 0; poolIndex < pools.length; poolIndex++) {
      const pool = pools[poolIndex], officialIdentities: OfficialIdentityReference[] = [];
      for (let entryIndex = 0; entryIndex < pool.entries.length; entryIndex++) defineOwnDataProperty(officialIdentities, entryIndex, {
        value: pool.entries[entryIndex].officialIdentity, writable: false, enumerable: true, configurable: false
      });
      const fact = {} as { recipePoolCategory: "normal" | "rainbow-foil"; officialIdentities: ReadonlyArray<OfficialIdentityReference> };
      defineOwnDataProperty(fact, "recipePoolCategory", { value: pool.recipePoolCategory, writable: false, enumerable: true, configurable: false });
      defineOwnDataProperty(fact, "officialIdentities", { value: frozen(officialIdentities), writable: false, enumerable: true, configurable: false });
      defineOwnDataProperty(facts, poolIndex, { value: frozen(fact), writable: false, enumerable: true, configurable: false });
    }
    return validateFacts(frozen(facts));
  } catch { return fail(); }
};
