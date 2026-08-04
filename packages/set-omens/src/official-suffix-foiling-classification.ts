import {
  readOfficialUpstreamIdReconciliationForSuffixFoiling,
  type OfficialUpstreamIdReconciliation,
  type OfficialUpstreamPrinting
} from "./official-upstream-id-reconciliation.ts";
import { copyOfficialUpstreamPrinting } from "./official-upstream-printing-copy.ts";

/** Stable, source-secret failure for build-time suffix/foiling correspondence classification. */
export class OfficialSuffixFoilingClassificationError extends Error {
  readonly code = "OFFICIAL_SUFFIX_FOILING_CLASSIFICATION_FAILED";

  constructor() {
    super("Official suffix foiling classification failed.");
    this.name = "OfficialSuffixFoilingClassificationError";
    this.stack = `${this.name}: ${this.message}`;
  }
}

export type OfficialSuffixFoilingClassification = ReadonlyArray<Readonly<{
  officialPrintId: string;
  baseCollectorId: string;
  sourceSetMarker: "OMN" | "IAR";
  suffixMarker: "RF" | "CF" | "MV" | null;
  classification: "unspecified" | "observed-upstream-foiling-correspondence";
  requiredUpstreamFoiling: "R" | "C" | null;
  candidatePrintings: ReadonlyArray<OfficialUpstreamPrinting>;
  selectedCorrespondencePrintings: ReadonlyArray<OfficialUpstreamPrinting>;
}>>;

type ExpectedAggregate = Readonly<{
  unspecifiedEntries: number; unspecifiedCandidates: number;
  rfEntries: number; rfCandidates: number; rfSelected: number;
  cfEntries: number; cfCandidates: number; cfSelected: number;
  mvEntries: number; mvCandidates: number; mvSelected: number; mvOneRowEntries: number; mvTwoRowEntries: number;
  suffixEntries: number; suffixCandidates: number; selected: number;
}>;

const publicAggregate: ExpectedAggregate = Object.freeze({
  unspecifiedEntries: 242, unspecifiedCandidates: 467,
  rfEntries: 6, rfCandidates: 12, rfSelected: 6,
  cfEntries: 3, cfCandidates: 3, cfSelected: 3,
  mvEntries: 9, mvCandidates: 11, mvSelected: 11, mvOneRowEntries: 7, mvTwoRowEntries: 2,
  suffixEntries: 18, suffixCandidates: 26, selected: 20
});
const fail = (): never => { throw new OfficialSuffixFoilingClassificationError(); };
const frozen = <Value>(value: Value): Readonly<Value> => Object.freeze(value);

const classify = (records: OfficialUpstreamIdReconciliation, expected: ExpectedAggregate): OfficialSuffixFoilingClassification => {
  const selectedIds = new Set<string>();
  let unspecifiedEntries = 0, unspecifiedCandidates = 0, rfEntries = 0, rfCandidates = 0, rfSelected = 0;
  let cfEntries = 0, cfCandidates = 0, cfSelected = 0, mvEntries = 0, mvCandidates = 0, mvSelected = 0, mvOneRowEntries = 0, mvTwoRowEntries = 0;
  const result = records.map((record) => {
    const rows = record.printings;
    let classification: "unspecified" | "observed-upstream-foiling-correspondence";
    let requiredUpstreamFoiling: "R" | "C" | null;
    let selected: readonly OfficialUpstreamPrinting[];
    if (record.suffixMarker === null) {
      classification = "unspecified"; requiredUpstreamFoiling = null; selected = [];
      unspecifiedEntries++; unspecifiedCandidates += rows.length;
    } else if (record.suffixMarker === "RF") {
      selected = rows.filter((row) => row.foiling === "R");
      if (rows.some((row) => row.foiling !== "C" && row.foiling !== "R")) fail();
      if (rows.length !== 2 || selected.length !== 1 || rows.filter((row) => row.foiling === "C").length !== 1) fail();
      classification = "observed-upstream-foiling-correspondence"; requiredUpstreamFoiling = "R";
      rfEntries++; rfCandidates += rows.length; rfSelected += selected.length;
    } else if (record.suffixMarker === "CF") {
      selected = rows.filter((row) => row.foiling === "C");
      if (rows.some((row) => row.foiling !== "C" && row.foiling !== "R")) fail();
      if (rows.length !== 1 || selected.length !== 1) fail();
      classification = "observed-upstream-foiling-correspondence"; requiredUpstreamFoiling = "C";
      cfEntries++; cfCandidates += rows.length; cfSelected += selected.length;
    } else if (record.suffixMarker === "MV") {
      selected = rows;
      if (rows.some((row) => row.foiling !== "C")) fail();
      if (rows.length !== 1 && rows.length !== 2) fail();
      classification = "observed-upstream-foiling-correspondence"; requiredUpstreamFoiling = "C";
      mvEntries++; mvCandidates += rows.length; mvSelected += selected.length;
      if (rows.length === 1) mvOneRowEntries++; else mvTwoRowEntries++;
    } else return fail();
    for (const row of selected) { if (selectedIds.has(row.unique_id)) fail(); selectedIds.add(row.unique_id); }
    return frozen({ officialPrintId: record.officialPrintId, baseCollectorId: record.baseCollectorId, sourceSetMarker: record.sourceSetMarker,
      suffixMarker: record.suffixMarker, classification, requiredUpstreamFoiling,
      candidatePrintings: frozen(rows.map(copyOfficialUpstreamPrinting)), selectedCorrespondencePrintings: frozen(selected.map(copyOfficialUpstreamPrinting)) });
  });
  const suffixEntries = rfEntries + cfEntries + mvEntries;
  const suffixCandidates = rfCandidates + cfCandidates + mvCandidates;
  if (unspecifiedEntries !== expected.unspecifiedEntries || unspecifiedCandidates !== expected.unspecifiedCandidates ||
    rfEntries !== expected.rfEntries || rfCandidates !== expected.rfCandidates || rfSelected !== expected.rfSelected ||
    cfEntries !== expected.cfEntries || cfCandidates !== expected.cfCandidates || cfSelected !== expected.cfSelected ||
    mvEntries !== expected.mvEntries || mvCandidates !== expected.mvCandidates || mvSelected !== expected.mvSelected ||
    mvOneRowEntries !== expected.mvOneRowEntries || mvTwoRowEntries !== expected.mvTwoRowEntries ||
    suffixEntries !== expected.suffixEntries || suffixCandidates !== expected.suffixCandidates || selectedIds.size !== expected.selected) fail();
  return frozen(result);
};

/** Package-internal fictional seam: its records must still be reconciliation capabilities. */
export const classifyOfficialSuffixFoilingForTest = (records: OfficialUpstreamIdReconciliation, expected: ExpectedAggregate): OfficialSuffixFoilingClassification => {
  try { return classify(readOfficialUpstreamIdReconciliationForSuffixFoiling(records), expected); }
  catch (error) { if (error instanceof OfficialSuffixFoilingClassificationError) throw error; return fail(); }
};

/** Classifies only an opaque completed official/upstream reconciliation capability. */
export const classifyOfficialCardVaultSuffixFoiling = (records: OfficialUpstreamIdReconciliation): OfficialSuffixFoilingClassification =>
  classifyOfficialSuffixFoilingForTest(records, publicAggregate);
