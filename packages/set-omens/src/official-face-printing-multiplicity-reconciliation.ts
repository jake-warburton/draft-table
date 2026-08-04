import {
  readOfficialCardVaultFaceProjectionForMultiplicityReconciliation,
  type OfficialCardVaultFaceProjection
} from "./card-vault-face-projection.ts";
import {
  readOfficialUpstreamIdReconciliationForSuffixFoiling,
  type OfficialUpstreamIdReconciliation
} from "./official-upstream-id-reconciliation.ts";

/** Stable, source-secret failure for MV-only official-face/upstream-row multiplicity reconciliation. */
export class OfficialFacePrintingMultiplicityReconciliationError extends Error {
  readonly code = "OFFICIAL_FACE_PRINTING_MULTIPLICITY_RECONCILIATION_FAILED";

  constructor() {
    super("Official face and printing multiplicity reconciliation failed.");
    this.name = "OfficialFacePrintingMultiplicityReconciliationError";
    this.stack = `${this.name}: ${this.message}`;
  }
}

/** MV-only build-time fact; it intentionally carries no face, printing, or source metadata. */
export type OfficialFacePrintingMultiplicityReconciliation = ReadonlyArray<Readonly<{
  officialPrintId: string;
  officialFaceCount: 1 | 2;
  upstreamPrintingRowCount: 1 | 2;
  officialIsMulti: boolean;
  upstreamIsMulti: boolean;
}>>;

type ExpectedAggregate = Readonly<{
  mvEntries: number;
  officialFaces: number;
  upstreamPrintingRows: number;
  oneToOneEntries: number;
  twoToTwoEntries: number;
  mismatches: number;
}>;

const publicAggregate: ExpectedAggregate = Object.freeze({
  mvEntries: 9, officialFaces: 11, upstreamPrintingRows: 11,
  oneToOneEntries: 7, twoToTwoEntries: 2, mismatches: 0
});
const multiplicityCapabilities = new WeakSet<object>();
const fail = (): never => { throw new OfficialFacePrintingMultiplicityReconciliationError(); };
const frozen = <Value>(value: Value): Readonly<Value> => Object.freeze(value);

const indexByOfficialPrintId = <Entry extends Readonly<{ officialPrintId: string }>>(
  entries: readonly Entry[]
): Map<string, Entry> => {
  const indexed = new Map<string, Entry>();
  for (const entry of entries) {
    if (typeof entry.officialPrintId !== "string" || indexed.has(entry.officialPrintId)) fail();
    indexed.set(entry.officialPrintId, entry);
  }
  return indexed;
};

const reconcile = (
  faces: OfficialCardVaultFaceProjection,
  upstream: OfficialUpstreamIdReconciliation,
  expected: ExpectedAggregate
): OfficialFacePrintingMultiplicityReconciliation => {
  const faceEntries = faces.map((entry) => frozen({ officialPrintId: entry.print_id, faces: entry.faces }));
  const facesById = indexByOfficialPrintId(faceEntries);
  const upstreamById = indexByOfficialPrintId(upstream);
  if (facesById.size !== faces.length || upstreamById.size !== upstream.length || facesById.size !== upstreamById.size) fail();
  for (const id of facesById.keys()) if (!upstreamById.has(id)) fail();

  let officialFaces = 0, upstreamPrintingRows = 0, oneToOneEntries = 0, twoToTwoEntries = 0, mismatches = 0;
  const officialMulti = new Set<string>();
  const upstreamMulti = new Set<string>();
  const result = faceEntries.flatMap((faceEntry) => {
    const upstreamEntry = upstreamById.get(faceEntry.officialPrintId);
    if (upstreamEntry === undefined) return fail();
    if (upstreamEntry.suffixMarker !== "MV") return [];
    const officialFaceCount = faceEntry.faces.length;
    const upstreamPrintingRowCount = upstreamEntry.printings.length;
    if ((officialFaceCount !== 1 && officialFaceCount !== 2) || (upstreamPrintingRowCount !== 1 && upstreamPrintingRowCount !== 2)) fail();
    const officialCount = officialFaceCount as 1 | 2;
    const upstreamCount = upstreamPrintingRowCount as 1 | 2;
    const officialIsMulti = officialCount === 2;
    const upstreamIsMulti = upstreamCount === 2;
    officialFaces += officialCount; upstreamPrintingRows += upstreamCount;
    if (officialIsMulti) officialMulti.add(faceEntry.officialPrintId);
    if (upstreamIsMulti) upstreamMulti.add(faceEntry.officialPrintId);
    if (officialCount !== upstreamCount) fail();
    if (officialCount === 1) oneToOneEntries++; else twoToTwoEntries++;
    return [frozen({ officialPrintId: faceEntry.officialPrintId, officialFaceCount: officialCount, upstreamPrintingRowCount: upstreamCount, officialIsMulti, upstreamIsMulti })];
  });
  if (result.length !== expected.mvEntries || officialFaces !== expected.officialFaces || upstreamPrintingRows !== expected.upstreamPrintingRows ||
    oneToOneEntries !== expected.oneToOneEntries || twoToTwoEntries !== expected.twoToTwoEntries || mismatches !== expected.mismatches ||
    officialMulti.size !== upstreamMulti.size || [...officialMulti].some((id) => !upstreamMulti.has(id))) fail();
  const capability = frozen(result);
  multiplicityCapabilities.add(capability);
  return capability;
};

/** Package-internal reader for later face semantics; bare arrays and forged facts fail closed. */
export const readOfficialFacePrintingMultiplicityReconciliationForFaceSemantics = (
  reconciliation: OfficialFacePrintingMultiplicityReconciliation
): OfficialFacePrintingMultiplicityReconciliation => multiplicityCapabilities.has(reconciliation) ? reconciliation : fail();

/** Package-internal fictional seam for compact dual-capability reconciliation contracts. */
export const reconcileOfficialFacePrintingMultiplicityForTest = (
  faces: OfficialCardVaultFaceProjection,
  upstream: OfficialUpstreamIdReconciliation,
  expected: ExpectedAggregate
): OfficialFacePrintingMultiplicityReconciliation => {
  try {
    return reconcile(
      readOfficialCardVaultFaceProjectionForMultiplicityReconciliation(faces),
      readOfficialUpstreamIdReconciliationForSuffixFoiling(upstream),
      expected
    );
  } catch (error) {
    if (error instanceof OfficialFacePrintingMultiplicityReconciliationError) throw error;
    return fail();
  }
};

/** Accepts only completed opaque face-projection and identity-reconciliation capabilities. */
export const reconcileOfficialCardVaultFacePrintingMultiplicity = (
  faces: OfficialCardVaultFaceProjection,
  upstream: OfficialUpstreamIdReconciliation
): OfficialFacePrintingMultiplicityReconciliation =>
  reconcileOfficialFacePrintingMultiplicityForTest(faces, upstream, publicAggregate);
