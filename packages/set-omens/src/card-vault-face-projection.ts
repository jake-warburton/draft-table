import {
  canonicalCardVaultMembershipFromResponse,
  parseCardVaultResponseBytes,
  readOfficialCardVaultMembershipPrintIdsForReconciliation,
  type OfficialCardVaultMembership
} from "./card-vault-official-membership.ts";

export class CardVaultFaceProjectionError extends Error {
  readonly code = "CARD_VAULT_FACE_PROJECTION_INVALID";

  constructor() {
    super("Official Card Vault face projection is invalid.");
    this.name = "CardVaultFaceProjectionError";
    this.stack = `${this.name}: ${this.message}`;
  }
}

export type OfficialCardVaultFaceProjection = readonly Readonly<{
  print_id: string;
  faces: readonly Readonly<{
    layout_position: number;
    image: Readonly<{
      small: string;
      normal: string;
      large: string;
    }>;
  }>[];
}>[];

type FaceProjectionAggregate = Readonly<{
  entries: number;
  faces: number;
  oneFaceEntries: number;
  twoFaceEntries: number;
  position10Faces: number;
  position20Faces: number;
  smallUrls: number;
  normalUrls: number;
  largeUrls: number;
  allUrls: number;
  unsuffixedEntries: number;
  unsuffixedFaces: number;
  unsuffixedOneFaceEntries: number;
  unsuffixedTwoFaceEntries: number;
  rfEntries: number;
  rfFaces: number;
  rfOneFaceEntries: number;
  rfTwoFaceEntries: number;
  cfEntries: number;
  cfFaces: number;
  cfOneFaceEntries: number;
  cfTwoFaceEntries: number;
  mvEntries: number;
  mvFaces: number;
  mvOneFaceEntries: number;
  mvTwoFaceEntries: number;
}>;

const OFFICIAL_AGGREGATE: FaceProjectionAggregate = Object.freeze({
  entries: 260,
  faces: 262,
  oneFaceEntries: 258,
  twoFaceEntries: 2,
  position10Faces: 260,
  position20Faces: 2,
  smallUrls: 262,
  normalUrls: 262,
  largeUrls: 262,
  allUrls: 786,
  unsuffixedEntries: 242,
  unsuffixedFaces: 242,
  unsuffixedOneFaceEntries: 242,
  unsuffixedTwoFaceEntries: 0,
  rfEntries: 6,
  rfFaces: 6,
  rfOneFaceEntries: 6,
  rfTwoFaceEntries: 0,
  cfEntries: 3,
  cfFaces: 3,
  cfOneFaceEntries: 3,
  cfTwoFaceEntries: 0,
  mvEntries: 9,
  mvFaces: 11,
  mvOneFaceEntries: 7,
  mvTwoFaceEntries: 2
});

const IMAGE_HOST = "legendstory-production-s3-public.s3.amazonaws.com";

const fail = (): never => { throw new CardVaultFaceProjectionError(); };

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const hasExplicitPort = (text: string): boolean => /^https:[\\/]*[^/?#\\]+:\d+(?:[/?#\\]|$)/iu.test(text);

const readUrl = (value: unknown): string => {
  if (typeof value !== "string") fail();
  const text = value as string;
  if (text.length === 0 || text !== text.trim() || text !== text.normalize("NFC") || /[\u0000-\u001f\u007f-\u009f]/u.test(text)) fail();
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" || url.hostname !== IMAGE_HOST || (url.port !== "" || hasExplicitPort(text)) || url.username !== "" || url.password !== "") fail();
  } catch {
    fail();
  }
  return text;
};

const suffix = (printId: string): "unsuffixed" | "rf" | "cf" | "mv" => {
  if (printId.endsWith("-RF")) return "rf";
  if (printId.endsWith("-CF")) return "cf";
  if (printId.endsWith("-MV")) return "mv";
  return "unsuffixed";
};

const project = (
  membership: OfficialCardVaultMembership,
  bytes: Uint8Array,
  expected: FaceProjectionAggregate
): OfficialCardVaultFaceProjection => {
  const response = parseCardVaultResponseBytes(bytes);
  const responseIds = canonicalCardVaultMembershipFromResponse(response);
  const canonicalIds = readOfficialCardVaultMembershipPrintIdsForReconciliation(membership);
  if (responseIds.length !== canonicalIds.length || responseIds.some((id, index) => id !== canonicalIds[index])) fail();
  if (!isObject(response)) fail();
  const responseCards = (response as Record<string, unknown>).cards;
  if (!Array.isArray(responseCards)) fail();

  const cards = new Map<string, Record<string, unknown>>();
  for (const card of responseCards as unknown[]) {
    if (!isObject(card)) fail();
    const retainedCard = card as Record<string, unknown>;
    if (typeof retainedCard.print_id !== "string") fail();
    const printId = retainedCard.print_id as string;
    if (cards.has(printId)) fail();
    cards.set(printId, retainedCard);
  }

  const urls = new Set<string>();
  const renditionUrls = { small: new Set<string>(), normal: new Set<string>(), large: new Set<string>() };
  const totals = { faces: 0, oneFaceEntries: 0, twoFaceEntries: 0, position10Faces: 0, position20Faces: 0, unsuffixedEntries: 0, unsuffixedFaces: 0, unsuffixedOneFaceEntries: 0, unsuffixedTwoFaceEntries: 0, rfEntries: 0, rfFaces: 0, rfOneFaceEntries: 0, rfTwoFaceEntries: 0, cfEntries: 0, cfFaces: 0, cfOneFaceEntries: 0, cfTwoFaceEntries: 0, mvEntries: 0, mvFaces: 0, mvOneFaceEntries: 0, mvTwoFaceEntries: 0 };

  const entries = canonicalIds.map((printId) => {
    const card = cards.get(printId);
    if (card === undefined) fail();
    const retainedCard = card as Record<string, unknown>;
    const rawFaces = retainedCard.faces;
    if (!Array.isArray(rawFaces) || rawFaces.length < 1 || rawFaces.length > 2) fail();
    const retainedFaces = rawFaces as unknown[];
    const faces = retainedFaces.map((face, index) => {
      if (!(index in retainedFaces) || !isObject(face)) fail();
      const retainedFace = face as Record<string, unknown>;
      if (!Number.isInteger(retainedFace.layout_position) || retainedFace.layout_position !== (index === 0 ? 10 : 20)) fail();
      const rawImage = retainedFace.image;
      if (!isObject(rawImage)) fail();
      const retainedImage = rawImage as Record<string, unknown>;
      const image = Object.freeze({
        small: readUrl(retainedImage.small),
        normal: readUrl(retainedImage.normal),
        large: readUrl(retainedImage.large)
      });
      for (const rendition of [image.small, image.normal, image.large]) {
        if (urls.has(rendition)) fail();
        urls.add(rendition);
      }
      renditionUrls.small.add(image.small); renditionUrls.normal.add(image.normal); renditionUrls.large.add(image.large);
      if (retainedFace.layout_position === 10) totals.position10Faces++; else totals.position20Faces++;
      totals.faces++;
      return Object.freeze({ layout_position: retainedFace.layout_position as number, image });
    });
    if (faces.length === 1) totals.oneFaceEntries++; else totals.twoFaceEntries++;
    const group = suffix(printId);
    if (group === "unsuffixed") { totals.unsuffixedEntries++; totals.unsuffixedFaces += faces.length; if (faces.length === 1) totals.unsuffixedOneFaceEntries++; else totals.unsuffixedTwoFaceEntries++; }
    if (group === "rf") { totals.rfEntries++; totals.rfFaces += faces.length; if (faces.length === 1) totals.rfOneFaceEntries++; else totals.rfTwoFaceEntries++; }
    if (group === "cf") { totals.cfEntries++; totals.cfFaces += faces.length; if (faces.length === 1) totals.cfOneFaceEntries++; else totals.cfTwoFaceEntries++; }
    if (group === "mv") { totals.mvEntries++; totals.mvFaces += faces.length; if (faces.length === 1) totals.mvOneFaceEntries++; else totals.mvTwoFaceEntries++; }
    return Object.freeze({ print_id: printId, faces: Object.freeze(faces) });
  });

  if (entries.length !== expected.entries || totals.faces !== expected.faces || totals.oneFaceEntries !== expected.oneFaceEntries || totals.twoFaceEntries !== expected.twoFaceEntries || totals.position10Faces !== expected.position10Faces || totals.position20Faces !== expected.position20Faces || renditionUrls.small.size !== expected.smallUrls || renditionUrls.normal.size !== expected.normalUrls || renditionUrls.large.size !== expected.largeUrls || urls.size !== expected.allUrls || totals.unsuffixedEntries !== expected.unsuffixedEntries || totals.unsuffixedFaces !== expected.unsuffixedFaces || totals.unsuffixedOneFaceEntries !== expected.unsuffixedOneFaceEntries || totals.unsuffixedTwoFaceEntries !== expected.unsuffixedTwoFaceEntries || totals.rfEntries !== expected.rfEntries || totals.rfFaces !== expected.rfFaces || totals.rfOneFaceEntries !== expected.rfOneFaceEntries || totals.rfTwoFaceEntries !== expected.rfTwoFaceEntries || totals.cfEntries !== expected.cfEntries || totals.cfFaces !== expected.cfFaces || totals.cfOneFaceEntries !== expected.cfOneFaceEntries || totals.cfTwoFaceEntries !== expected.cfTwoFaceEntries || totals.mvEntries !== expected.mvEntries || totals.mvFaces !== expected.mvFaces || totals.mvOneFaceEntries !== expected.mvOneFaceEntries || totals.mvTwoFaceEntries !== expected.mvTwoFaceEntries) fail();
  return Object.freeze(entries);
};

/** Projects only exact face positions and image renditions for a validated official membership. */
const projectSafely = (
  membership: OfficialCardVaultMembership,
  bytes: Uint8Array,
  expected: FaceProjectionAggregate
): OfficialCardVaultFaceProjection => {
  try {
    return project(membership, bytes, expected);
  } catch (error) {
    if (error instanceof CardVaultFaceProjectionError) throw error;
    throw new CardVaultFaceProjectionError();
  }
};

export const projectCardVaultOfficialFaceMetadata = (
  membership: OfficialCardVaultMembership,
  bytes: Uint8Array
): OfficialCardVaultFaceProjection => projectSafely(membership, bytes, OFFICIAL_AGGREGATE);

/** Package-internal test seam for compact fictional capability-bound contracts. */
export const projectCardVaultOfficialFaceMetadataForTest = (
  membership: OfficialCardVaultMembership,
  bytes: Uint8Array,
  expected: FaceProjectionAggregate
): OfficialCardVaultFaceProjection => projectSafely(membership, bytes, expected);
