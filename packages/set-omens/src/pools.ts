import { parseOmensLayoutsFromTrustedBytes, type OmensLayouts } from "./layouts.ts";
import type { OmensRecipeCardReference } from "./custom-cards.ts";

const UTF8_BOM = new Uint8Array([0xef, 0xbb, 0xbf]);
const SECTION_HEADER = /^\[([A-Za-z][A-Za-z0-9]*)\]$/;
const LAYOUTS_HEADER = "[Layouts]";

export class OmensRecipePoolsError extends Error {
  readonly code = "OMENS_RECIPE_POOLS_INVALID";

  constructor() {
    super("Omens recipe pools are invalid.");
    this.name = "OmensRecipePoolsError";
    this.stack = `${this.name}: ${this.message}`;
  }
}

export type OmensPoolEntry = Readonly<{
  weight: number;
  reference: string;
}>;

export type OmensPool = Readonly<{
  name: string;
  entries: ReadonlyArray<OmensPoolEntry>;
}>;

export type OmensPools = Readonly<{
  pools: ReadonlyArray<OmensPool>;
}>;

const OMENS_POOL_AGGREGATES: Readonly<Record<string, readonly [number, number]>> = Object.freeze({
  Wizard: [24, 159], Illusionist: [24, 160], Runeblade: [24, 164], Lightning: [42, 227],
  Generic: [6, 28], Equipment: [14, 148], Rare: [60, 120], Majestic: [15, 30],
  Rfcommon: [105, 105], RFRare: [59, 59], RFMajestic: [7, 7]
});
const NORMAL_POOL_NAMES = new Set(["Wizard", "Illusionist", "Runeblade", "Lightning", "Generic", "Equipment", "Rare", "Majestic"]);
const RF_POOL_NAMES = new Set(["Rfcommon", "RFRare", "RFMajestic"]);
const PINNED_POOL_NAMES = new Set([...NORMAL_POOL_NAMES, ...RF_POOL_NAMES]);

const invalidPools = (): never => {
  throw new OmensRecipePoolsError();
};

/** Internal seam for exact cross-reference contracts; intentionally omitted from the package root. */
export const validateOmensRecipeReferences = (
  layouts: OmensLayouts,
  pools: OmensPools,
  cards: ReadonlyArray<OmensRecipeCardReference>
): void => {
  const poolNames = new Set<string>();
  for (const pool of pools.pools) {
    if (poolNames.has(pool.name)) return invalidPools();
    poolNames.add(pool.name);
  }
  const cardNames = new Set<string>();
  for (const card of cards) {
    if (cardNames.has(card.name)) return invalidPools();
    cardNames.add(card.name);
  }
  const pinnedPools = pools.pools.length === PINNED_POOL_NAMES.size &&
    pools.pools.every((pool) => PINNED_POOL_NAMES.has(pool.name));
  const usedPools = new Set<string>();
  for (const layout of layouts.layouts) {
    for (const slot of layout.slots) {
      if (!poolNames.has(slot.pool)) return invalidPools();
      usedPools.add(slot.pool);
    }
  }
  for (const pool of pools.pools) {
    for (const entry of pool.entries) {
      if (!cardNames.has(entry.reference)) return invalidPools();
    }
  }
  if (pinnedPools) {
    for (const poolName of PINNED_POOL_NAMES) {
      if (!usedPools.has(poolName)) return invalidPools();
    }
    const normalCounts = new Map<string, number>();
    for (const pool of pools.pools) {
      if (!NORMAL_POOL_NAMES.has(pool.name)) continue;
      for (const entry of pool.entries) normalCounts.set(entry.reference, (normalCounts.get(entry.reference) ?? 0) + 1);
    }
    if (normalCounts.size !== cardNames.size) return invalidPools();
    for (const cardName of cardNames) {
      if (normalCounts.get(cardName) !== 1) return invalidPools();
    }
    for (const pool of pools.pools) {
      if (!RF_POOL_NAMES.has(pool.name)) continue;
      for (const entry of pool.entries) if (!cardNames.has(entry.reference)) return invalidPools();
    }
  }
};

const hasUtf8Bom = (bytes: Uint8Array): boolean =>
  UTF8_BOM.every((byte, index) => bytes[index] === byte);

const decodeEnvelope = (bytes: Uint8Array): string => {
  if (!hasUtf8Bom(bytes)) return invalidPools();

  try {
    const source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes.subarray(UTF8_BOM.length));
    if (source.endsWith("\r\n") || /\r(?!\n)|(?<!\r)\n/.test(source)) return invalidPools();
    return source;
  } catch {
    return invalidPools();
  }
};

const isNormalizedText = (value: string): boolean =>
  value.length > 0 && value === value.trim() && value === value.normalize("NFC") && !/\p{Cc}/u.test(value);

const positiveSafeInteger = (token: string): number => {
  if (!/^[1-9][0-9]*$/.test(token)) return invalidPools();
  const value = Number(token);
  if (!Number.isSafeInteger(value)) return invalidPools();
  return value;
};

/** Internal seam for synthetic aggregate contracts; intentionally omitted from the package root. */
export const validateOmensRecipePoolsAggregate = (pools: OmensPools): OmensPools => {
  if (pools.pools.length !== Object.keys(OMENS_POOL_AGGREGATES).length) return invalidPools();
  const seen = new Set<string>();
  for (const pool of pools.pools) {
    const fixture = OMENS_POOL_AGGREGATES[pool.name];
    if (fixture === undefined || seen.has(pool.name) || pool.entries.length !== fixture[0]) return invalidPools();
    seen.add(pool.name);
    let total = 0;
    for (const entry of pool.entries) {
      if (entry.weight > Number.MAX_SAFE_INTEGER - total) return invalidPools();
      total += entry.weight;
    }
    if (total !== fixture[1]) return invalidPools();
  }
  return pools;
};

/** Test-only seam for synthetic malformed-input contracts; not publicly exported. */
export const parseOmensPoolsFromTrustedBytes = (bytes: Uint8Array): OmensPools => {
  try {
    // This establishes the preceding verified recipe grammar before pool decoding.
    parseOmensLayoutsFromTrustedBytes(bytes);
    const lines = decodeEnvelope(bytes).split("\r\n");
    const headers = lines
      .map((line, index) => ({ line, index, match: line.match(SECTION_HEADER) }))
      .filter((header): header is { line: string; index: number; match: RegExpMatchArray } => header.match !== null);
    const layoutsPosition = headers.findIndex(({ line }) => line === LAYOUTS_HEADER);
    if (layoutsPosition === -1 || headers.filter(({ line }) => line === LAYOUTS_HEADER).length !== 1) return invalidPools();

    const poolHeaders = headers.slice(layoutsPosition + 1);
    if (poolHeaders.length === 0) return invalidPools();

    const names = new Set<string>();
    const pools: OmensPool[] = [];
    for (let index = 0; index < poolHeaders.length; index += 1) {
      const header = poolHeaders[index];
      const nextHeader = poolHeaders[index + 1];
      const name = header.match[1];
      const entryLines = lines.slice(header.index + 1, nextHeader?.index ?? lines.length);
      if (names.has(name) || entryLines.length === 0) return invalidPools();
      names.add(name);

      const references = new Set<string>();
      const entries: OmensPoolEntry[] = [];
      for (const line of entryLines) {
        const entry = line.match(/^([1-9][0-9]*) (.+)$/);
        if (entry === null) return invalidPools();
        const [, weightToken, reference] = entry;
        if (!isNormalizedText(reference) || references.has(reference)) return invalidPools();
        references.add(reference);
        entries.push(Object.freeze({ weight: positiveSafeInteger(weightToken), reference }));
      }
      pools.push(Object.freeze({ name, entries: Object.freeze(entries) }));
    }
    return Object.freeze({ pools: Object.freeze(pools) });
  } catch (error) {
    if (error instanceof OmensRecipePoolsError) throw error;
    return invalidPools();
  }
};
