import {
  readOfficialCardVaultFaceProjectionForMultiplicityReconciliation,
  type OfficialCardVaultFaceProjection
} from "./card-vault-face-projection.ts";
import {
  readOfficialUpstreamIdReconciliationForSuffixFoiling,
  type OfficialUpstreamIdReconciliation,
  type OfficialUpstreamPrinting
} from "./official-upstream-id-reconciliation.ts";

const defineProperty = Object.defineProperty;
const freeze = Object.freeze;
const arrayIncludes = Function.prototype.call.bind(Array.prototype.includes) as (values: readonly unknown[], value: unknown) => boolean;
const arrayFind = Function.prototype.call.bind(Array.prototype.find) as <Value>(values: readonly Value[], predicate: (value: Value) => boolean) => Value | undefined;
const arrayFilter = Function.prototype.call.bind(Array.prototype.filter) as <Value>(values: readonly Value[], predicate: (value: Value) => boolean) => Value[];
const weakSetAdd = Function.prototype.call.bind(WeakSet.prototype.add) as (set: WeakSet<object>, value: object) => WeakSet<object>;
const weakSetHas = Function.prototype.call.bind(WeakSet.prototype.has) as (set: WeakSet<object>, value: object) => boolean;
const presentationCapabilities = new WeakSet<object>();

/** Stable source-secret failure for an exact build-time card display projection. */
export class OmensCardPresentationError extends Error {
  readonly code!: "OMENS_CARD_PRESENTATION_FAILED";

  constructor() {
    super("Omens card presentation failed.");
    defineProperty(this, "name", { value: "OmensCardPresentationError", enumerable: true, writable: false, configurable: false });
    defineProperty(this, "code", { value: "OMENS_CARD_PRESENTATION_FAILED", enumerable: true, writable: false, configurable: false });
    defineProperty(this, "stack", { value: `${this.name}: ${this.message}`, enumerable: false, writable: false, configurable: false });
  }
}
freeze(OmensCardPresentationError.prototype);
freeze(OmensCardPresentationError);

export type OmensCardPresentation = Readonly<{
  officialPrintId: string;
  baseCollectorId: string;
  upstreamCardId: string;
  upstreamPrintingId: string;
  faceLayoutPosition: number;
  displayName: string;
  /** Exact upstream pitch text; it is not a colour classification. */
  pitch: "" | "1" | "2" | "3";
  /** No authoritative pitch-colour field exists in the accepted inputs. */
  pitchColour: null;
  rarity: string;
  imageUrl: string;
  /** Exact upstream foiling text, retained without treatment interpretation. */
  treatment: string;
  /** No authoritative rear-marker fact exists in the accepted inputs. */
  rearMarker: null;
  source: Readonly<{
    identity: "official-card-vault-membership + pinned-upstream-card.json";
    displayName: "pinned-upstream-card.json";
    pitch: "pinned-upstream-card.json";
    pitchColour: "unavailable";
    rarity: "pinned-upstream-card.json";
    imageUrl: "official-card-vault-response:normal-rendition";
    treatment: "pinned-upstream-card.json:foiling";
    rearMarker: "unavailable";
  }>;
}>;

const fail = (): never => { throw new OmensCardPresentationError(); };
const source = freeze({
  identity: "official-card-vault-membership + pinned-upstream-card.json",
  displayName: "pinned-upstream-card.json",
  pitch: "pinned-upstream-card.json",
  pitchColour: "unavailable",
  rarity: "pinned-upstream-card.json",
  imageUrl: "official-card-vault-response:normal-rendition",
  treatment: "pinned-upstream-card.json:foiling",
  rearMarker: "unavailable"
} as const);

/**
 * Projects one caller-selected, capability-owned identity/printing/face triple. It never chooses a
 * printing, face, treatment, rear, product duplicate, or collation identity on the caller's behalf.
 */
export const projectOmensOfficialCardPresentation = (
  reconciliation: OfficialUpstreamIdReconciliation,
  faces: OfficialCardVaultFaceProjection,
  identity: OfficialUpstreamIdReconciliation[number],
  printing: OfficialUpstreamPrinting,
  faceLayoutPosition: number
): OmensCardPresentation => {
  try {
    const records = readOfficialUpstreamIdReconciliationForSuffixFoiling(reconciliation);
    const projectedFaces = readOfficialCardVaultFaceProjectionForMultiplicityReconciliation(faces);
    if (!arrayIncludes(records, identity) || !arrayIncludes(identity.printings, printing) || !Number.isInteger(faceLayoutPosition)) fail();
    const faceEntry = arrayFind(projectedFaces, (entry) => entry.print_id === identity.officialPrintId);
    if (faceEntry === undefined) return fail();
    const face = arrayFind(faceEntry.faces, (entry) => entry.layout_position === faceLayoutPosition);
    if (face === undefined || arrayFilter(faceEntry.faces, (entry) => entry.layout_position === faceLayoutPosition).length !== 1) return fail();
    const output = freeze({
      officialPrintId: identity.officialPrintId,
      baseCollectorId: identity.baseCollectorId,
      upstreamCardId: identity.unique_id,
      upstreamPrintingId: printing.unique_id,
      faceLayoutPosition,
      displayName: identity.name,
      pitch: identity.pitch,
      pitchColour: null,
      rarity: printing.rarity,
      imageUrl: face.image.normal,
      treatment: printing.foiling,
      rearMarker: null,
      source
    });
    weakSetAdd(presentationCapabilities, output);
    return output;
  } catch (error) {
    if (error instanceof OmensCardPresentationError) throw error;
    return fail();
  }
};

/** Reads only a registered immutable display projection for a following build-time slice. */
export const readOmensCardPresentationForBuild = (presentation: OmensCardPresentation): OmensCardPresentation =>
  weakSetHas(presentationCapabilities, presentation) ? presentation : fail();
