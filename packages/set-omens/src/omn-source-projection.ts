export class OmnSourceProjectionError extends Error {
  readonly code = "OMN_SOURCE_PROJECTION_FAILED";

  constructor() {
    super("OMN source projection failed.");
    this.name = "OmnSourceProjectionError";
    this.stack = `${this.name}: ${this.message}`;
  }
}

export type OmnSourcePrinting = Readonly<{
  unique_id: string;
  set_printing_unique_id: string;
  id: string;
  set_id: "OMN";
  edition: string;
  foiling: string;
  rarity: string;
  expansion_slot: boolean;
  image_url: string;
}>;

export type OmnSourceCard = Readonly<{
  unique_id: string;
  name: string;
  printings: ReadonlyArray<OmnSourcePrinting>;
}>;

export type OmnSourceProjection = ReadonlyArray<OmnSourceCard>;

type ExpectedAggregate = Readonly<{
  cardRecords: number;
  printingRows: number;
  collectorIds: number;
}>;

const publicAggregate: ExpectedAggregate = Object.freeze({ cardRecords: 251, printingRows: 482, collectorIds: 251 });

const fail = (): never => { throw new OmnSourceProjectionError(); };
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : fail();
const normalizedText = (value: unknown): string =>
  typeof value === "string" && value.length > 0 && value === value.trim() && value === value.normalize("NFC") && !/\p{Cc}/u.test(value)
    ? value
    : fail();
const httpsUrl = (value: unknown): string => {
  const url = normalizedText(value);
  try {
    if (new URL(url).protocol !== "https:" || new URL(url).hostname.length === 0) fail();
    return url;
  } catch { return fail(); }
};
const frozen = <Value>(value: Value): Readonly<Value> => Object.freeze(value);

const project = (data: unknown): OmnSourceProjection => {
  if (!Array.isArray(data)) return fail();
  const sourceCards: unknown[] = data;
  const cardIds = new Set<string>();
  const printingIds = new Set<string>();
  let omnSetPrintingUniqueId: string | undefined;
  const cards: OmnSourceCard[] = [];

  for (const sourceCard of sourceCards) {
    const card = record(sourceCard);
    const sourcePrintings = card.printings;
    if (!Array.isArray(sourcePrintings)) return fail();
    const printingValues: unknown[] = sourcePrintings;
    const printings: OmnSourcePrinting[] = [];
    for (const sourcePrinting of printingValues) {
      const printing = record(sourcePrinting);
      if (printing.set_id !== "OMN") continue;
      const unique_id = normalizedText(printing.unique_id);
      const set_printing_unique_id = normalizedText(printing.set_printing_unique_id);
      if (omnSetPrintingUniqueId === undefined) omnSetPrintingUniqueId = set_printing_unique_id;
      else if (set_printing_unique_id !== omnSetPrintingUniqueId) fail();
      const id = normalizedText(printing.id);
      const edition = normalizedText(printing.edition);
      const foiling = normalizedText(printing.foiling);
      const rarity = normalizedText(printing.rarity);
      if (typeof printing.expansion_slot !== "boolean") return fail();
      const expansion_slot: boolean = printing.expansion_slot;
      if (printingIds.has(unique_id)) fail();
      printingIds.add(unique_id);
      printings.push(frozen({
        unique_id, set_printing_unique_id, id, set_id: "OMN", edition, foiling, rarity,
        expansion_slot, image_url: httpsUrl(printing.image_url)
      }));
    }
    if (printings.length === 0) continue;
    const unique_id = normalizedText(card.unique_id);
    if (cardIds.has(unique_id)) fail();
    cardIds.add(unique_id);
    cards.push(frozen({ unique_id, name: normalizedText(card.name), printings: frozen(printings) }));
  }
  if (cards.length === 0) fail();
  return frozen(cards);
};

const validateAggregate = (records: OmnSourceProjection, expected: ExpectedAggregate): OmnSourceProjection => {
  const printingRows = records.flatMap((card) => card.printings);
  const collectorIds = new Set(printingRows.map((printing) => printing.id));
  if (records.length !== expected.cardRecords || printingRows.length !== expected.printingRows || collectorIds.size !== expected.collectorIds) fail();
  return records;
};

/** Package-internal fictional seam; production composition enters through schema-validation. */
export const projectOmnSourceRecordsForTest = (data: unknown): OmnSourceProjection => {
  try { return project(data); } catch (error) { if (error instanceof OmnSourceProjectionError) throw error; return fail(); }
};

/** Package-internal aggregate seam, intentionally separate from small fictional source fixtures. */
export const validateOmnSourceProjectionAggregateForTest = (
  records: OmnSourceProjection,
  expected: ExpectedAggregate
): OmnSourceProjection => {
  try { return validateAggregate(records, expected); } catch (error) { if (error instanceof OmnSourceProjectionError) throw error; return fail(); }
};

export const projectOmnSourceRecords = (data: unknown): OmnSourceProjection =>
  validateAggregate(projectOmnSourceRecordsForTest(data), publicAggregate);
