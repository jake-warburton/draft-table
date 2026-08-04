import {
  readOfficialCardVaultPrintIdFormsForReconciliation,
  type CardVaultPrintIdForm
} from "./card-vault-print-id-forms.ts";
import type { OfficialCardVaultMembership } from "./card-vault-official-membership.ts";
import {
  readSchemaValidatedFabEnglishCardDataForParser,
  type SchemaValidatedFabEnglishCardData
} from "./public-source-schema-validation.ts";
import { copyOfficialUpstreamPrinting } from "./official-upstream-printing-copy.ts";

/** Stable, source-secret failure for build-time official/upstream identity reconciliation. */
export class OfficialUpstreamIdReconciliationError extends Error {
  readonly code = "OFFICIAL_UPSTREAM_ID_RECONCILIATION_FAILED";

  constructor() {
    super("Official upstream identity reconciliation failed.");
    this.name = "OfficialUpstreamIdReconciliationError";
    this.stack = `${this.name}: ${this.message}`;
  }
}

export type OfficialUpstreamPrinting = Readonly<{
  unique_id: string;
  set_printing_unique_id: string;
  id: string;
  set_id: "OMN" | "IAR";
  edition: string;
  foiling: string;
  rarity: string;
  expansion_slot: boolean;
  image_url: string;
  /** Exact upstream source metadata; semantics intentionally uninterpreted. */
  art_variations: ReadonlyArray<string>;
}>;

/** Build-time-only result: no source capability or membership capability escapes this boundary. */
export type OfficialUpstreamIdReconciliation = ReadonlyArray<Readonly<{
  officialPrintId: string;
  baseCollectorId: string;
  sourceSetMarker: "OMN" | "IAR";
  suffixMarker: "RF" | "CF" | "MV" | null;
  unique_id: string;
  name: string;
  printings: ReadonlyArray<OfficialUpstreamPrinting>;
}>>;

type ExpectedAggregate = Readonly<{ entries: number; omnEntries: number; iarEntries: number; omnPrintings: number; iarPrintings: number }>;
type ArtVariationAggregate = Readonly<{ empty: number; ea: number; fa: number; aaFa: number; unsuffixedEmpty: number; unsuffixedEa: number; unsuffixedFa: number; unsuffixedAaFa: number; rfEmpty: number; rfEa: number; cfEmpty: number; mvFa: number }>;
type SourceCard = Readonly<{ unique_id: string; name: string; printings: readonly OfficialUpstreamPrinting[] }>;

const publicAggregate: ExpectedAggregate = Object.freeze({ entries: 260, omnEntries: 251, iarEntries: 9, omnPrintings: 482, iarPrintings: 11 });
const publicArtVariationAggregate: ArtVariationAggregate = Object.freeze({ empty: 442, ea: 22, fa: 25, aaFa: 4, unsuffixedEmpty: 429, unsuffixedEa: 20, unsuffixedFa: 14, unsuffixedAaFa: 4, rfEmpty: 10, rfEa: 2, cfEmpty: 3, mvFa: 11 });
const reconciliationCapabilities = new WeakSet<object>();
const fail = (): never => { throw new OfficialUpstreamIdReconciliationError(); };
const frozen = <Value>(value: Value): Readonly<Value> => Object.freeze(value);
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : fail();
const text = (value: unknown): string => typeof value === "string" && value.length > 0 && value === value.trim() && value === value.normalize("NFC") && !/\p{Cc}/u.test(value) ? value : fail();
const url = (value: unknown): string => { const result = text(value); try { if (new URL(result).protocol !== "https:" || new URL(result).hostname.length === 0) fail(); return result; } catch { return fail(); } };
const artVariations = (value: unknown): ReadonlyArray<string> => {
  if (!Array.isArray(value)) return fail();
  const seen = new Set<string>();
  const result: string[] = [];
  for (let index = 0; index < value.length; index++) {
    if (!(index in value)) return fail();
    const entry = text(value[index]);
    if (seen.has(entry)) return fail();
    seen.add(entry); result.push(entry);
  }
  return frozen(result);
};

const projectSource = (data: unknown, expectedSetByBase: ReadonlyMap<string, "OMN" | "IAR">): readonly SourceCard[] => {
  if (!Array.isArray(data)) return fail();
  const cardIds = new Set<string>();
  const printingIds = new Set<string>();
  const cards: SourceCard[] = [];
  for (const sourceCard of data) {
    const card = record(sourceCard);
    if (!Array.isArray(card.printings)) return fail();
    const printings: OfficialUpstreamPrinting[] = [];
    for (const sourcePrinting of card.printings) {
      const printing = record(sourcePrinting);
      const expectedSet = typeof printing.id === "string" ? expectedSetByBase.get(printing.id) : undefined;
      if (expectedSet === undefined) continue;
      if (printing.set_id !== expectedSet) fail();
      const id = text(printing.id);
      const unique_id = text(printing.unique_id);
      if (printingIds.has(unique_id)) fail();
      printingIds.add(unique_id);
      if (typeof printing.expansion_slot !== "boolean") return fail();
      printings.push(frozen({ unique_id, set_printing_unique_id: text(printing.set_printing_unique_id), id, set_id: expectedSet,
        edition: text(printing.edition), foiling: text(printing.foiling), rarity: text(printing.rarity), expansion_slot: printing.expansion_slot, image_url: url(printing.image_url), art_variations: artVariations(printing.art_variations) }));
    }
    if (printings.length === 0) continue;
    const unique_id = text(card.unique_id);
    if (cardIds.has(unique_id)) fail();
    cardIds.add(unique_id);
    cards.push(frozen({ unique_id, name: text(card.name), printings: frozen(printings) }));
  }
  return frozen(cards);
};

const validateArtVariationAggregate = (records: OfficialUpstreamIdReconciliation, expected: ArtVariationAggregate): void => {
  let empty = 0, ea = 0, fa = 0, aaFa = 0, unsuffixedEmpty = 0, unsuffixedEa = 0, unsuffixedFa = 0, unsuffixedAaFa = 0, rfEmpty = 0, rfEa = 0, cfEmpty = 0, mvFa = 0;
  for (const record of records) for (const printing of record.printings) {
    const sequence = printing.art_variations.join("\u0000");
    if (sequence === "") empty++; else if (sequence === "EA") ea++; else if (sequence === "FA") fa++; else if (sequence === "AA\u0000FA") aaFa++; else fail();
    if (record.suffixMarker === null) { if (sequence === "") unsuffixedEmpty++; else if (sequence === "EA") unsuffixedEa++; else if (sequence === "FA") unsuffixedFa++; else if (sequence === "AA\u0000FA") unsuffixedAaFa++; else fail(); }
    else if (record.suffixMarker === "RF") { if (sequence === "") rfEmpty++; else if (sequence === "EA") rfEa++; else fail(); }
    else if (record.suffixMarker === "CF") { if (sequence === "") cfEmpty++; else fail(); }
    else if (record.suffixMarker === "MV") { if (sequence === "FA") mvFa++; else fail(); }
    else fail();
  }
  if (empty !== expected.empty || ea !== expected.ea || fa !== expected.fa || aaFa !== expected.aaFa ||
    unsuffixedEmpty !== expected.unsuffixedEmpty || unsuffixedEa !== expected.unsuffixedEa || unsuffixedFa !== expected.unsuffixedFa || unsuffixedAaFa !== expected.unsuffixedAaFa ||
    rfEmpty !== expected.rfEmpty || rfEa !== expected.rfEa || cfEmpty !== expected.cfEmpty || mvFa !== expected.mvFa) fail();
};

const reconcile = (forms: readonly CardVaultPrintIdForm[], source: unknown, expected: ExpectedAggregate): OfficialUpstreamIdReconciliation => {
  const expectedSetByBase = new Map<string, "OMN" | "IAR">();
  for (const form of forms) { if (expectedSetByBase.has(form.baseCollectorId)) fail(); expectedSetByBase.set(form.baseCollectorId, form.sourceSet); }
  const cards = projectSource(source, expectedSetByBase);
  const owners = new Map<string, SourceCard>();
  for (const card of cards) for (const printing of card.printings) {
    if (owners.has(printing.id) && owners.get(printing.id) !== card) fail();
    owners.set(printing.id, card);
  }
  const cardIds = new Set<string>(), collectorIds = new Set<string>(), printingIds = new Set<string>(), setPrintingBySet = new Map<"OMN" | "IAR", string>();
  const result = forms.map((form) => {
    const card = owners.get(form.baseCollectorId); if (card === undefined) return fail();
    if (cardIds.has(card.unique_id) || collectorIds.has(form.baseCollectorId)) return fail();
    cardIds.add(card.unique_id); collectorIds.add(form.baseCollectorId);
    const printings = card.printings.filter((printing) => printing.id === form.baseCollectorId && printing.set_id === form.sourceSet);
    if (printings.length === 0) return fail();
    for (const printing of printings) {
      if (printingIds.has(printing.unique_id)) return fail(); printingIds.add(printing.unique_id);
      const setPrinting = setPrintingBySet.get(printing.set_id);
      if (setPrinting === undefined) setPrintingBySet.set(printing.set_id, printing.set_printing_unique_id);
      else if (setPrinting !== printing.set_printing_unique_id) return fail();
    }
    return frozen({ officialPrintId: form.officialPrintId, baseCollectorId: form.baseCollectorId, sourceSetMarker: form.sourceSet,
      suffixMarker: form.suffixMarker, unique_id: card.unique_id, name: card.name, printings: frozen(printings.map(copyOfficialUpstreamPrinting)) });
  });
  const omn = result.filter((entry) => entry.sourceSetMarker === "OMN"); const iar = result.filter((entry) => entry.sourceSetMarker === "IAR");
  const omnRows = omn.flatMap((entry) => entry.printings); const iarRows = iar.flatMap((entry) => entry.printings);
  if (result.length !== expected.entries || omn.length !== expected.omnEntries || iar.length !== expected.iarEntries ||
    omnRows.length !== expected.omnPrintings || iarRows.length !== expected.iarPrintings || cardIds.size !== expected.entries || collectorIds.size !== expected.entries ||
    printingIds.size !== omnRows.length + iarRows.length || setPrintingBySet.size !== 2 || setPrintingBySet.get("OMN") === setPrintingBySet.get("IAR")) fail();
  const capability = frozen(result);
  reconciliationCapabilities.add(capability);
  return capability;
};

/** Reads only the opaque completed reconciliation capability for a following build-time slice. */
export const readOfficialUpstreamIdReconciliationForSuffixFoiling = (
  records: OfficialUpstreamIdReconciliation
): OfficialUpstreamIdReconciliation => reconciliationCapabilities.has(records) ? records : fail();

/** Package-internal fictional seam for focused reconciliation contracts. */
export const reconcileOfficialUpstreamIdRecordsForTest = (forms: readonly CardVaultPrintIdForm[], source: unknown, expected: ExpectedAggregate): OfficialUpstreamIdReconciliation => {
  try { return reconcile(forms, source, expected); } catch (error) { if (error instanceof OfficialUpstreamIdReconciliationError) throw error; return fail(); }
};

/** Package-internal fictional seam for aggregate contracts over retained uninterpreted source metadata. */
export const validateOfficialUpstreamArtVariationAggregateForTest = (records: OfficialUpstreamIdReconciliation, expected: ArtVariationAggregate): void => {
  try { if (!reconciliationCapabilities.has(records)) fail(); validateArtVariationAggregate(records, expected); } catch (error) { if (error instanceof OfficialUpstreamIdReconciliationError) throw error; return fail(); }
};

/** Accepts only both opaque validated capabilities; this is build-time tooling, never a root/runtime API. */
export const reconcileOfficialCardVaultMembershipWithSchemaValidatedFabSource = (
  membership: OfficialCardVaultMembership,
  data: SchemaValidatedFabEnglishCardData
): OfficialUpstreamIdReconciliation => {
  try {
    const records = reconcile(readOfficialCardVaultPrintIdFormsForReconciliation(membership), readSchemaValidatedFabEnglishCardDataForParser(data), publicAggregate);
    validateArtVariationAggregate(records, publicArtVariationAggregate);
    return records;
  } catch (error) { if (error instanceof OfficialUpstreamIdReconciliationError) throw error; return fail(); }
};
