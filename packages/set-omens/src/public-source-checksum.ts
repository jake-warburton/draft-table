import { FAB_CARD_SOURCE } from "./public-source-descriptor.ts";
import { sha256Hex } from "./sha256.ts";

export type FabCardSourceArtifact = "FAB_CARD_JSON" | "FAB_CARD_SCHEMA_JSON";

export class FabCardSourceChecksumError extends Error {
  readonly code = "FAB_CARD_SOURCE_CHECKSUM_MISMATCH";
  readonly artifact: FabCardSourceArtifact;

  constructor(artifact: FabCardSourceArtifact) {
    super("Pinned public card source checksum mismatch.");
    this.name = "FabCardSourceChecksumError";
    this.artifact = artifact;
    this.stack = `${this.name}: ${this.message}`;
  }
}

declare const verifiedFabCardSourceBytesBrand: unique symbol;

export type VerifiedFabCardSourceBytes = Readonly<{
  [verifiedFabCardSourceBytesBrand]: true;
}>;

const bytesByVerification = new WeakMap<VerifiedFabCardSourceBytes, Uint8Array>();

type PinnedArtifact = Readonly<{
  artifact: FabCardSourceArtifact;
  byteLength: number;
  sha256: string;
}>;

const checkedBytes = (bytes: Uint8Array, pinned: PinnedArtifact): Uint8Array => {
  const copiedBytes = new Uint8Array(bytes);

  if (copiedBytes.byteLength !== pinned.byteLength || sha256Hex(copiedBytes) !== pinned.sha256) {
    throw new FabCardSourceChecksumError(pinned.artifact);
  }

  return copiedBytes;
};

const verifyPinnedBytes = (bytes: Uint8Array, pinned: PinnedArtifact): VerifiedFabCardSourceBytes => {
  const verifiedBytes = checkedBytes(bytes, pinned);
  const verification = Object.freeze({}) as VerifiedFabCardSourceBytes;
  bytesByVerification.set(verification, verifiedBytes);
  return verification;
};

const CARD_JSON: PinnedArtifact = Object.freeze({
  artifact: "FAB_CARD_JSON",
  byteLength: FAB_CARD_SOURCE.cardByteLength,
  sha256: FAB_CARD_SOURCE.cardSha256
});

const CARD_SCHEMA_JSON: PinnedArtifact = Object.freeze({
  artifact: "FAB_CARD_SCHEMA_JSON",
  byteLength: FAB_CARD_SOURCE.schemaByteLength,
  sha256: FAB_CARD_SOURCE.schemaSha256
});

export const verifyPinnedFabEnglishCardBytes = (bytes: Uint8Array): VerifiedFabCardSourceBytes =>
  verifyPinnedBytes(bytes, CARD_JSON);

export const verifyPinnedFabCardSchemaBytes = (bytes: Uint8Array): VerifiedFabCardSourceBytes =>
  verifyPinnedBytes(bytes, CARD_SCHEMA_JSON);

/** Package-internal parser seam; the root package export deliberately does not expose it. */
export const readVerifiedFabCardSourceBytesForParser = (
  verification: VerifiedFabCardSourceBytes
): Uint8Array => {
  const bytes = bytesByVerification.get(verification);

  if (bytes === undefined) {
    throw new TypeError("Invalid public card source verification.");
  }

  return new Uint8Array(bytes);
};
