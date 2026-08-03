import { sha256Hex } from "./sha256.ts";

export class OmensRecipeChecksumError extends Error {
  readonly code = "OMENS_RECIPE_CHECKSUM_MISMATCH";

  constructor() {
    super("Omens recipe checksum mismatch.");
    this.name = "OmensRecipeChecksumError";
    this.stack = `${this.name}: ${this.message}`;
  }
}

export type VerifiedOmensBytes = Readonly<{
  bytes: Uint8Array;
}>;

export const verifyOmensBytesAgainstDigest = (
  bytes: Uint8Array,
  expectedSha256: string
): VerifiedOmensBytes => {
  if (sha256Hex(bytes) !== expectedSha256) {
    throw new OmensRecipeChecksumError();
  }

  return Object.freeze({ bytes: bytes.slice() });
};
