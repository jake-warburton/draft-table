import { parseOmensLayoutsFromTrustedBytes } from "./layouts.ts";

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

const invalidPools = (): never => {
  throw new OmensRecipePoolsError();
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
