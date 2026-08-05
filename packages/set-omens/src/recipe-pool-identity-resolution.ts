import {
  readOmensDraftEligibilityForPoolIdentityResolution,
  type OmensDraftEligibilityClassification
} from "./draft-eligibility-classification.ts";
import {
  readCompletedOmensRecipePoolEntryOwner,
  readCompletedOmensRecipePoolsForIdentityResolution,
  readCompletedOmensRecipePoolsSourceOwner,
  readOmensRecipePoolDomainFact,
  type OmensPools
} from "./pools.ts";
import {
  readOmensRecipeOfficialIdentityReconciliationForPoolResolution,
  type OmensRecipeOfficialIdentityReconciliation
} from "./recipe-official-identity-reconciliation.ts";
import type { FabNativeRecipeRarity } from "./recipe-rarity-domain.ts";

/** Stable, source-secret failure for build-time recipe-pool identity resolution. */
export class OmensRecipePoolIdentityResolutionError extends Error {
  readonly code = "OMENS_RECIPE_POOL_IDENTITY_RESOLUTION_FAILED";

  constructor() {
    super("Omens recipe pool identity resolution failed.");
    this.name = "OmensRecipePoolIdentityResolutionError";
    this.stack = `${this.name}: ${this.message}`;
  }
}

/**
 * Ordered build-time recipe facts. A rainbow-foil category retains only source recipe
 * membership and does not select an official printing, treatment, foiling, image, or slot.
 */
export type OmensRecipePoolOfficialIdentityResolution = ReadonlyArray<Readonly<{
  sourcePoolLabel: string;
  fabRarity: FabNativeRecipeRarity;
  recipePoolCategory: "normal" | "rainbow-foil";
  entries: ReadonlyArray<Readonly<{
    weight: number;
    officialIdentity: Readonly<{
      baseCollectorId: string;
      cardUniqueId: string;
    }>;
  }>>;
}>>;

const resolutionCapabilities = new WeakMap<object, Readonly<{
  sourceOwner: object;
  poolTotalWeights: WeakMap<object, number>;
}>>();
const fail = (): never => { throw new OmensRecipePoolIdentityResolutionError(); };
const frozen = <Value>(value: Value): Readonly<Value> => Object.freeze(value);
type MappedIdentity = OmensRecipeOfficialIdentityReconciliation["mapped"][number];
type Eligibility = OmensDraftEligibilityClassification[number];

const resolve = (
  pools: ReturnType<typeof readCompletedOmensRecipePoolsForIdentityResolution>,
  identities: ReturnType<typeof readOmensRecipeOfficialIdentityReconciliationForPoolResolution>,
  eligibility: OmensDraftEligibilityClassification
): OmensRecipePoolOfficialIdentityResolution => {

  const identityByRecipeCollector = new Map<string, MappedIdentity>();
  const ownedOfficialBases = new Set<string>();
  const ownedOfficialCards = new Set<string>();
  for (const identity of identities.mapped) {
    if (identityByRecipeCollector.has(identity.recipeCollectorNumber) || ownedOfficialBases.has(identity.officialBaseCollectorId) ||
      ownedOfficialCards.has(identity.officialCardUniqueId) || identity.officialPrintId !== identity.officialBaseCollectorId) fail();
    identityByRecipeCollector.set(identity.recipeCollectorNumber, identity);
    ownedOfficialBases.add(identity.officialBaseCollectorId);
    ownedOfficialCards.add(identity.officialCardUniqueId);
  }

  const eligibilityByPrint = new Map<string, Eligibility>();
  const eligibilityBases = new Set<string>();
  const eligibilityCards = new Set<string>();
  for (const fact of eligibility) {
    if (eligibilityByPrint.has(fact.officialPrintId) || eligibilityBases.has(fact.baseCollectorId) || eligibilityCards.has(fact.officialCardUniqueId)) fail();
    eligibilityByPrint.set(fact.officialPrintId, fact);
    eligibilityBases.add(fact.baseCollectorId);
    eligibilityCards.add(fact.officialCardUniqueId);
  }

  const normalOwnership = new Map<string, number>();
  const poolTotalWeights = new WeakMap<object, number>();
  const output: OmensRecipePoolOfficialIdentityResolution[number][] = [];
  for (const pool of pools.pools) {
    const domain = readOmensRecipePoolDomainFact(pool);
    const entries: OmensRecipePoolOfficialIdentityResolution[number]["entries"][number][] = [];
    let poolTotalWeight = 0;
    for (const entry of pool.entries) {
      if (!Number.isSafeInteger(entry.weight) || entry.weight <= 0 || poolTotalWeight > Number.MAX_SAFE_INTEGER - entry.weight) fail();
      poolTotalWeight += entry.weight;
      // Stage 1: exact same-source pool reference -> its unique validated CustomCards owner.
      const owner = readCompletedOmensRecipePoolEntryOwner(pools, entry);
      // Stage 2: the owner's exact recipe collector -> its accepted official identity.
      const identity = identityByRecipeCollector.get(owner.collectorNumber) ?? fail();
      if (identity.recipeCollectorNumber !== owner.collectorNumber || identity.recipeName !== owner.name || identity.recipeRarityLabel !== owner.rarity) fail();
      // Stage 3: that exact official identity -> its fixed captain-approved eligibility fact.
      const draftFact = eligibilityByPrint.get(identity.officialPrintId) ?? fail();
      if (draftFact.officialPrintId !== identity.officialPrintId || draftFact.baseCollectorId !== identity.officialBaseCollectorId ||
        draftFact.officialCardUniqueId !== identity.officialCardUniqueId || draftFact.draftEligibility !== "draftable") fail();
      if (domain.category === "normal") normalOwnership.set(owner.collectorNumber, (normalOwnership.get(owner.collectorNumber) ?? 0) + 1);
      entries.push(frozen({ weight: entry.weight, officialIdentity: frozen({
        baseCollectorId: identity.officialBaseCollectorId,
        cardUniqueId: identity.officialCardUniqueId
      }) }));
    }
    if (!Number.isSafeInteger(poolTotalWeight) || poolTotalWeight <= 0 || entries.length === 0) fail();
    const resolvedPool = frozen({ sourcePoolLabel: pool.name, fabRarity: domain.fabRarity, recipePoolCategory: domain.category, entries: frozen(entries) });
    poolTotalWeights.set(resolvedPool, poolTotalWeight);
    output.push(resolvedPool);
  }

  if (normalOwnership.size !== identityByRecipeCollector.size ||
    [...identityByRecipeCollector.keys()].some((collector) => normalOwnership.get(collector) !== 1)) fail();
  const capability = frozen(output);
  resolutionCapabilities.set(capability, frozen({ sourceOwner: readCompletedOmensRecipePoolsSourceOwner(pools), poolTotalWeights }));
  return capability;
};

/** Package-internal compact fictional seam; accepts no policy or aggregate override. */
export const resolveOmensRecipePoolsToDraftableOfficialIdentitiesForTest = (
  ...inputs: [OmensPools, OmensRecipeOfficialIdentityReconciliation, OmensDraftEligibilityClassification]
): OmensRecipePoolOfficialIdentityResolution => {
  if (inputs.length !== 3) return fail();
  try {
    const identities = readOmensRecipeOfficialIdentityReconciliationForPoolResolution(inputs[1]);
    return resolve(readCompletedOmensRecipePoolsForIdentityResolution(inputs[0]), identities,
      readOmensDraftEligibilityForPoolIdentityResolution(inputs[2], identities));
  } catch (error) { if (error instanceof OmensRecipePoolIdentityResolutionError) throw error; return fail(); }
};

/**
 * Package-internal synthetic seam for the guard contract. It preserves the validated
 * pool/identity chain while presenting the core with one non-draftable eligibility fact.
 */
export const resolveOmensRecipePoolsWithSyntheticEligibilityForTest = (
  ...inputs: [OmensPools, OmensRecipeOfficialIdentityReconciliation, OmensDraftEligibilityClassification, "excluded" | "unclassified"]
): OmensRecipePoolOfficialIdentityResolution => {
  if (inputs.length !== 4) return fail();
  try {
    const identities = readOmensRecipeOfficialIdentityReconciliationForPoolResolution(inputs[1]);
    const eligibility = readOmensDraftEligibilityForPoolIdentityResolution(inputs[2], identities);
    const synthetic = eligibility.map((fact) => fact.officialPrintId === "OMN100"
      ? Object.freeze({ ...fact, draftEligibility: inputs[3], classificationBasis: inputs[3] === "excluded" ? "captain-approved-IAR-exclusion" : "recipe-source-absence-open" })
      : fact);
    return resolve(readCompletedOmensRecipePoolsForIdentityResolution(inputs[0]), identities, synthetic);
  } catch (error) { if (error instanceof OmensRecipePoolIdentityResolutionError) throw error; return fail(); }
};

/** Reads only the exact completed opaque pool resolution for layout resolution. */
export const readOmensRecipePoolOfficialIdentityResolutionForLayouts = (
  resolution: OmensRecipePoolOfficialIdentityResolution
): OmensRecipePoolOfficialIdentityResolution => resolutionCapabilities.has(resolution) ? resolution : fail();

/** Returns only the opaque source-owner token of an exact completed pool resolution. */
export const readOmensRecipePoolOfficialIdentityResolutionSourceOwner = (
  resolution: OmensRecipePoolOfficialIdentityResolution
): object => resolutionCapabilities.get(resolution)?.sourceOwner ?? fail();

/** Narrow reader for exact completed pool resolution consumed only by collation-weight compilation. */
export const readOmensRecipePoolOfficialIdentityResolutionForCollationWeightCompilation = (
  resolution: OmensRecipePoolOfficialIdentityResolution
): OmensRecipePoolOfficialIdentityResolution => resolutionCapabilities.has(resolution) ? resolution : fail();

/** Reads the established exact total for one exact capability-owned resolved pool. */
export const readOmensRecipePoolOfficialIdentityResolutionPoolTotalWeightForCollationWeightCompilation = (
  resolution: OmensRecipePoolOfficialIdentityResolution,
  pool: OmensRecipePoolOfficialIdentityResolution[number]
): number => resolutionCapabilities.get(resolution)?.poolTotalWeights.get(pool) ?? fail();

/** Build-time-only staged recipe-pool ownership to accepted draftable official identity resolution. */
export const resolveOmensRecipePoolsToDraftableOfficialIdentities = (
  ...inputs: [OmensPools, OmensRecipeOfficialIdentityReconciliation, OmensDraftEligibilityClassification]
): OmensRecipePoolOfficialIdentityResolution => resolveOmensRecipePoolsToDraftableOfficialIdentitiesForTest(...inputs);
