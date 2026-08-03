import { parseOmensCustomCardsFromTrustedBytes } from "./custom-cards.ts";

const UTF8_BOM = new Uint8Array([0xef, 0xbb, 0xbf]);
const SECTION_HEADER = /^\[[A-Za-z][A-Za-z0-9]*\]$/;
const CUSTOM_CARDS_HEADER = "[CustomCards]";
const LAYOUTS_HEADER = "[Layouts]";
const VISIBLE_CARD_TOTAL = 14;

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
  value.length > 0 && value === value.trim() && value === value.normalize("NFC") && !/[\u0000-\u001f\u007f]/.test(value);

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
