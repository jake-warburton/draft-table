import { parseOmensSettingsFromTrustedBytes } from "./settings.ts";

const UTF8_BOM = new Uint8Array([0xef, 0xbb, 0xbf]);
const SECTION_HEADER = /^\[[A-Za-z][A-Za-z0-9]*\]$/;
const CUSTOM_CARDS_HEADER = "[CustomCards]";
const EXPECTED_CARD_KEYS = new Set([
  "collector_number",
  "image_uris",
  "mana_cost",
  "name",
  "rarity",
  "type"
]);
const EXPECTED_IMAGE_URI_KEYS = new Set(["en"]);
const ALLOWED_RARITIES = new Set(["common", "rare", "mythic"]);
const OMENS_RECIPE_CUSTOM_CARD_TOTALS = Object.freeze({ common: 134, rare: 60, mythic: 15 });
const parsedReferenceCapabilities = new WeakSet<object>();
const completedReferenceCapabilities = new WeakSet<object>();

export class OmensRecipeCustomCardsError extends Error {
  readonly code = "OMENS_RECIPE_CUSTOM_CARDS_INVALID";

  constructor() {
    super("Omens recipe custom cards are invalid.");
    this.name = "OmensRecipeCustomCardsError";
    this.stack = `${this.name}: ${this.message}`;
  }
}

export type OmensRecipeCardReference = Readonly<{
  name: string;
  collectorNumber: string;
  rarity: "common" | "rare" | "mythic";
}>;

type OmensRecipeRarity = OmensRecipeCardReference["rarity"];

type SourceCard = Record<string, unknown>;

const invalidCustomCards = (): never => {
  throw new OmensRecipeCustomCardsError();
};

const hasUtf8Bom = (bytes: Uint8Array): boolean =>
  UTF8_BOM.every((byte, index) => bytes[index] === byte);

const decodeEnvelope = (bytes: Uint8Array): string => {
  if (!hasUtf8Bom(bytes)) {
    return invalidCustomCards();
  }

  try {
    const source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes.subarray(UTF8_BOM.length));
    if (source.endsWith("\r\n") || /\r(?!\n)|(?<!\r)\n/.test(source)) {
      return invalidCustomCards();
    }
    return source;
  } catch {
    return invalidCustomCards();
  }
};

const isNormalizedText = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value === value.trim() && value === value.normalize("NFC") && !/\p{Cc}/u.test(value);

const isHttpsUrl = (value: unknown): value is string => {
  if (!isNormalizedText(value)) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.length > 0;
  } catch {
    return false;
  }
};

const hasExactlyKeys = (value: Record<string, unknown>, expected: Set<string>): boolean =>
  Object.keys(value).length === expected.size && Object.keys(value).every((key) => expected.has(key));

const stringEnd = (source: string, index: number): number => {
  index += 1;
  while (index < source.length) {
    if (source[index] === "\\") {
      index += 2;
    } else if (source[index] === '"') {
      return index + 1;
    } else {
      index += 1;
    }
  }
  return index;
};

const skipWhitespace = (source: string, index: number): number => {
  while (/\s/.test(source[index] ?? "")) index += 1;
  return index;
};

const hasDuplicateObjectKeys = (source: string): boolean => {
  let duplicate = false;

  const scanValue = (initialIndex: number): number => {
    let index = skipWhitespace(source, initialIndex);
    if (source[index] === "{") {
      index = skipWhitespace(source, index + 1);
      const keys = new Set<string>();
      while (source[index] !== "}" && index < source.length) {
        if (source[index] !== '"') return source.length;
        const end = stringEnd(source, index);
        let key: string;
        try { key = JSON.parse(source.slice(index, end)) as string; } catch { return source.length; }
        if (keys.has(key)) duplicate = true;
        keys.add(key);
        index = skipWhitespace(source, end);
        if (source[index] !== ":") return source.length;
        index = scanValue(index + 1);
        index = skipWhitespace(source, index);
        if (source[index] === ",") index = skipWhitespace(source, index + 1);
        else if (source[index] !== "}") return source.length;
      }
      return index + 1;
    }
    if (source[index] === "[") {
      index = skipWhitespace(source, index + 1);
      while (source[index] !== "]" && index < source.length) {
        index = scanValue(index);
        index = skipWhitespace(source, index);
        if (source[index] === ",") index = skipWhitespace(source, index + 1);
        else if (source[index] !== "]") return source.length;
      }
      return index + 1;
    }
    if (source[index] === '"') return stringEnd(source, index);
    while (index < source.length && !/[\s,\]}]/.test(source[index])) index += 1;
    return index;
  };

  scanValue(0);
  return duplicate;
};

const customCardsJsonFromTrustedBytes = (bytes: Uint8Array): string => {
  parseOmensSettingsFromTrustedBytes(bytes);
  const lines = decodeEnvelope(bytes).split("\r\n");
  const headers = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => SECTION_HEADER.test(line));
  const customCardsHeaders = headers.filter(({ line }) => line === CUSTOM_CARDS_HEADER);

  if (customCardsHeaders.length !== 1) return invalidCustomCards();
  const customCardsIndex = customCardsHeaders[0].index;
  const nextHeader = headers.find(({ index }) => index > customCardsIndex);
  if (nextHeader === undefined) return invalidCustomCards();

  return lines.slice(customCardsIndex + 1, nextHeader.index).join("\r\n");
};

const toReference = (value: unknown): OmensRecipeCardReference => {
  if (value === null || Array.isArray(value) || typeof value !== "object") return invalidCustomCards();
  const card = value as SourceCard;
  if (!hasExactlyKeys(card, EXPECTED_CARD_KEYS) ||
    !isNormalizedText(card.name) ||
    !isNormalizedText(card.collector_number) ||
    !isNormalizedText(card.mana_cost) ||
    !isNormalizedText(card.type) ||
    !isNormalizedText(card.rarity) || !ALLOWED_RARITIES.has(card.rarity) ||
    card.image_uris === null || Array.isArray(card.image_uris) || typeof card.image_uris !== "object") {
    return invalidCustomCards();
  }

  const imageUris = card.image_uris as Record<string, unknown>;
  if (!hasExactlyKeys(imageUris, EXPECTED_IMAGE_URI_KEYS) || !isHttpsUrl(imageUris.en)) return invalidCustomCards();

  return Object.freeze({
    name: card.name,
    collectorNumber: card.collector_number,
    rarity: card.rarity as OmensRecipeCardReference["rarity"]
  });
};

type RecipeRarityAggregate = Readonly<Record<OmensRecipeRarity, number>>;

const completeAggregate = (
  references: ReadonlyArray<OmensRecipeCardReference>,
  expected: RecipeRarityAggregate
): ReadonlyArray<OmensRecipeCardReference> => {
  if (!parsedReferenceCapabilities.has(references)) return invalidCustomCards();
  const expectedLength = expected.common + expected.rare + expected.mythic;
  if (references.length !== expectedLength) return invalidCustomCards();
  const counts: Record<OmensRecipeRarity, number> = { common: 0, rare: 0, mythic: 0 };
  for (const reference of references) counts[reference.rarity] += 1;
  if (counts.common !== expected.common || counts.rare !== expected.rare || counts.mythic !== expected.mythic) return invalidCustomCards();
  completedReferenceCapabilities.add(references);
  return references;
};

/** Internal seam validating pinned-recipe aggregates at the verified boundary; not publicly exported. */
export const validateOmensRecipeCustomCardsAggregate = (
  references: ReadonlyArray<OmensRecipeCardReference>
): ReadonlyArray<OmensRecipeCardReference> => completeAggregate(references, OMENS_RECIPE_CUSTOM_CARD_TOTALS);

/** Package-internal fictional seam that can complete only an exact parser-created array. */
export const completeOmensRecipeCustomCardsAggregateForTest = (
  references: ReadonlyArray<OmensRecipeCardReference>,
  expected: RecipeRarityAggregate
): ReadonlyArray<OmensRecipeCardReference> => completeAggregate(references, expected);

/** Reads only the exact completed parser result for the following build-time identity slice. */
export const readCompletedOmensRecipeCustomCardsForIdentityReconciliation = (
  references: ReadonlyArray<OmensRecipeCardReference>
): ReadonlyArray<OmensRecipeCardReference> => completedReferenceCapabilities.has(references) ? references : invalidCustomCards();

/** Test-only seam for synthetic malformed-input contracts; not publicly exported. */
export const parseOmensCustomCardsFromTrustedBytes = (bytes: Uint8Array): ReadonlyArray<OmensRecipeCardReference> => {
  try {
    const json = customCardsJsonFromTrustedBytes(bytes);
    if (hasDuplicateObjectKeys(json)) return invalidCustomCards();
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed) || parsed.length === 0) return invalidCustomCards();

    const references = parsed.map(toReference);
    const names = new Set<string>();
    const collectorNumbers = new Set<string>();
    for (const reference of references) {
      if (names.has(reference.name) || collectorNumbers.has(reference.collectorNumber)) return invalidCustomCards();
      names.add(reference.name);
      collectorNumbers.add(reference.collectorNumber);
    }
    const capability = Object.freeze(references);
    parsedReferenceCapabilities.add(capability);
    return capability;
  } catch (error) {
    if (error instanceof OmensRecipeCustomCardsError) throw error;
    return invalidCustomCards();
  }
};
