import { parseOmensCustomCardsFromTrustedBytes } from "./custom-cards.ts";

const UTF8_BOM = new Uint8Array([0xef, 0xbb, 0xbf]);
const SECTION_HEADER = /^\[[A-Za-z][A-Za-z0-9]*\]$/;
const CUSTOM_CARDS_HEADER = "[CustomCards]";
const LAYOUTS_HEADER = "[Layouts]";
const VISIBLE_CARD_TOTAL = 14;
const BASE_COMMON_POOLS = new Set(["Wizard", "Illusionist", "Runeblade", "Lightning", "Generic", "Equipment"]);
const RARE_POOL = "Rare";
const MAJESTIC_POOL = "Majestic";
const RF_COEFFICIENTS: Readonly<Record<string, number>> = Object.freeze({
  "Rare/Rfcommon": 1411,
  "Rare/RFRare": 255,
  "Rare/RFMajestic": 34,
  "Majestic/Rfcommon": 581,
  "Majestic/RFRare": 105,
  "Majestic/RFMajestic": 14
});
const DERIVED_TOTALS = Object.freeze({
  secondRare: 326400,
  secondMajestic: 134400,
  rfcommon: 382464,
  rfrare: 69120,
  rfmajestic: 9216
});
const EXPECTED_OUTCOME_KEYS = new Set(Object.keys(RF_COEFFICIENTS));
type DerivedTotals = Readonly<Record<keyof typeof DERIVED_TOTALS, number>>;

export class OmensRecipeLayoutsError extends Error {
  readonly code = "OMENS_RECIPE_LAYOUTS_INVALID";

  constructor() {
    super("Omens recipe layouts are invalid.");
    this.name = "OmensRecipeLayoutsError";
    this.stack = `${this.name}: ${this.message}`;
  }
}

export type OmensLayoutSlot = Readonly<{
  count: number;
  pool: string;
}>;

export type OmensLayout = Readonly<{
  id: string;
  weight: number;
  slots: ReadonlyArray<OmensLayoutSlot>;
}>;

export type OmensLayouts = Readonly<{
  layouts: ReadonlyArray<OmensLayout>;
}>;

const invalidLayouts = (): never => {
  throw new OmensRecipeLayoutsError();
};

const greatestCommonDivisor = (left: number, right: number): number => {
  let a = left;
  let b = right;
  while (b !== 0) [a, b] = [b, a % b];
  return a;
};

const addSafely = (total: number, value: number): number => {
  if (!Number.isSafeInteger(value) || value < 0 || total > Number.MAX_SAFE_INTEGER - value) return invalidLayouts();
  return total + value;
};

type LayoutOutcome = Readonly<{
  key: string;
  second: "Rare" | "Majestic";
  rainbow: "Rfcommon" | "RFRare" | "RFMajestic";
  commonStructure: string;
}>;

const outcomeForLayout = (layout: OmensLayout): LayoutOutcome => {
  let commonTotal = 0;
  let equipmentTotal = 0;
  let rareTotal = 0;
  let majesticTotal = 0;
  let rainbow: LayoutOutcome["rainbow"] | undefined;
  const commonStructure: string[] = [];

  for (const slot of layout.slots) {
    if (BASE_COMMON_POOLS.has(slot.pool)) {
      commonTotal = addSafely(commonTotal, slot.count);
      if (slot.pool === "Equipment") equipmentTotal = addSafely(equipmentTotal, slot.count);
      commonStructure.push(`${slot.count}:${slot.pool}`);
    } else if (slot.pool === RARE_POOL) {
      rareTotal = addSafely(rareTotal, slot.count);
    } else if (slot.pool === MAJESTIC_POOL) {
      majesticTotal = addSafely(majesticTotal, slot.count);
    } else if (slot.pool === "Rfcommon" || slot.pool === "RFRare" || slot.pool === "RFMajestic") {
      if (rainbow !== undefined || slot.count !== 1) return invalidLayouts();
      rainbow = slot.pool;
    } else return invalidLayouts();
  }
  if (commonTotal !== 11 || equipmentTotal !== 1 || rainbow === undefined || rareTotal < 1) return invalidLayouts();

  const second = rareTotal === 2 && majesticTotal === 0 ? "Rare"
    : rareTotal === 1 && majesticTotal === 1 ? "Majestic"
    : invalidLayouts();
  return Object.freeze({ key: `${second}/${rainbow}`, second, rainbow, commonStructure: commonStructure.join("|") });
};

/** Internal seam for exact derived integer fixtures; intentionally omitted from the package root. */
export const validateOmensRecipeDerivedTotals = (derived: DerivedTotals): void => {
  if (Object.entries(DERIVED_TOTALS).some(([key, value]) => derived[key as keyof DerivedTotals] !== value)) return invalidLayouts();
};

/** Internal seam for exact structural/coefficient fixtures; intentionally omitted from the package root. */
export const validateOmensRecipeLayoutsAggregate = (layouts: OmensLayouts): OmensLayouts => {
  if (layouts.layouts.length !== 228) return invalidLayouts();

  let totalWeight = 0;
  const derived = { secondRare: 0, secondMajestic: 0, rfcommon: 0, rfrare: 0, rfmajestic: 0 };
  for (let offset = 0; offset < layouts.layouts.length; offset += 6) {
    const group = layouts.layouts.slice(offset, offset + 6);
    const divisor = group.reduce((common, layout) => greatestCommonDivisor(common, layout.weight), 0);
    if (divisor === 0) return invalidLayouts();
    const outcomes = new Set<string>();
    let commonStructure: string | undefined;
    for (const layout of group) {
      totalWeight = addSafely(totalWeight, layout.weight);
      const outcome = outcomeForLayout(layout);
      if (layout.weight / divisor !== RF_COEFFICIENTS[outcome.key]) return invalidLayouts();
      outcomes.add(outcome.key);
      if (commonStructure === undefined) commonStructure = outcome.commonStructure;
      else if (commonStructure !== outcome.commonStructure) return invalidLayouts();
      if (outcome.second === "Rare") derived.secondRare = addSafely(derived.secondRare, layout.weight);
      else derived.secondMajestic = addSafely(derived.secondMajestic, layout.weight);
      if (outcome.rainbow === "Rfcommon") derived.rfcommon = addSafely(derived.rfcommon, layout.weight);
      else if (outcome.rainbow === "RFRare") derived.rfrare = addSafely(derived.rfrare, layout.weight);
      else derived.rfmajestic = addSafely(derived.rfmajestic, layout.weight);
    }
    if (outcomes.size !== EXPECTED_OUTCOME_KEYS.size || [...outcomes].some((key) => !EXPECTED_OUTCOME_KEYS.has(key))) return invalidLayouts();
  }
  if (totalWeight !== 460800) return invalidLayouts();
  validateOmensRecipeDerivedTotals(derived);
  return layouts;
};

const hasUtf8Bom = (bytes: Uint8Array): boolean =>
  UTF8_BOM.every((byte, index) => bytes[index] === byte);

const decodeEnvelope = (bytes: Uint8Array): string => {
  if (!hasUtf8Bom(bytes)) return invalidLayouts();

  try {
    const source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes.subarray(UTF8_BOM.length));
    if (source.endsWith("\r\n") || /\r(?!\n)|(?<!\r)\n/.test(source)) return invalidLayouts();
    return source;
  } catch {
    return invalidLayouts();
  }
};

const isNormalizedText = (value: string): boolean =>
  value.length > 0 && value === value.trim() && value === value.normalize("NFC") && !/\p{Cc}/u.test(value);

const positiveSafeInteger = (token: string): number => {
  if (!/^[1-9][0-9]*$/.test(token)) return invalidLayouts();
  const value = Number(token);
  if (!Number.isSafeInteger(value)) return invalidLayouts();
  return value;
};

const layoutsLinesFromTrustedBytes = (bytes: Uint8Array): string[] => {
  parseOmensCustomCardsFromTrustedBytes(bytes);
  const lines = decodeEnvelope(bytes).split("\r\n");
  const headers = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => SECTION_HEADER.test(line));
  const layoutsHeaders = headers.filter(({ line }) => line === LAYOUTS_HEADER);

  if (layoutsHeaders.length !== 1) return invalidLayouts();
  const layoutsHeader = layoutsHeaders[0];
  const headerPosition = headers.findIndex(({ index }) => index === layoutsHeader.index);
  const previousHeader = headers[headerPosition - 1];
  const nextHeader = headers[headerPosition + 1];
  if (previousHeader?.line !== CUSTOM_CARDS_HEADER || nextHeader === undefined) return invalidLayouts();

  return lines.slice(layoutsHeader.index + 1, nextHeader.index);
};

/** Test-only seam for synthetic malformed-input contracts; not publicly exported. */
export const parseOmensLayoutsFromTrustedBytes = (bytes: Uint8Array): OmensLayouts => {
  try {
    const lines = layoutsLinesFromTrustedBytes(bytes);
    if (lines.length === 0) return invalidLayouts();

    const layouts: OmensLayout[] = [];
    const ids = new Set<string>();
    let current: { id: string; weight: number; slots: OmensLayoutSlot[] } | undefined;

    for (const line of lines) {
      const header = line.match(/^\t- (.+) \(([1-9][0-9]*)\)$/);
      if (header !== null) {
        const [, id, weightToken] = header;
        if (!isNormalizedText(id) || ids.has(id)) return invalidLayouts();
        if (current !== undefined) {
          if (current.slots.length === 0 || current.slots.reduce((total, slot) => total + slot.count, 0) !== VISIBLE_CARD_TOTAL) return invalidLayouts();
          layouts.push(Object.freeze({ ...current, slots: Object.freeze(current.slots) }));
        }
        ids.add(id);
        current = { id, weight: positiveSafeInteger(weightToken), slots: [] };
        continue;
      }

      const slot = line.match(/^\t\t([1-9][0-9]*) (.+)$/);
      if (slot === null || current === undefined) return invalidLayouts();
      const [, countToken, pool] = slot;
      if (!isNormalizedText(pool)) return invalidLayouts();
      current.slots.push(Object.freeze({ count: positiveSafeInteger(countToken), pool }));
    }

    if (current === undefined || current.slots.length === 0 || current.slots.reduce((total, slot) => total + slot.count, 0) !== VISIBLE_CARD_TOTAL) return invalidLayouts();
    layouts.push(Object.freeze({ ...current, slots: Object.freeze(current.slots) }));
    return Object.freeze({ layouts: Object.freeze(layouts) });
  } catch (error) {
    if (error instanceof OmensRecipeLayoutsError) throw error;
    return invalidLayouts();
  }
};
