import { sha256Hex } from "./sha256.ts";

export class OmensRecipeChecksumError extends Error {
  readonly code = "OMENS_RECIPE_CHECKSUM_MISMATCH";

  constructor() {
    super("Omens recipe checksum mismatch.");
    this.name = "OmensRecipeChecksumError";
    this.stack = `${this.name}: ${this.message}`;
  }
}

declare const verifiedOmensBytesBrand: unique symbol;

export type VerifiedOmensBytes = Readonly<{
  [verifiedOmensBytesBrand]: true;
}>;

const bytesByVerification = new WeakMap<VerifiedOmensBytes, Uint8Array>();

export const verifyOmensBytesAgainstDigest = (
  bytes: Uint8Array,
  expectedSha256: string
): VerifiedOmensBytes => {
  const verifiedBytes = new Uint8Array(bytes);

  if (sha256Hex(verifiedBytes) !== expectedSha256) {
    throw new OmensRecipeChecksumError();
  }

  const verification = Object.freeze({}) as VerifiedOmensBytes;
  bytesByVerification.set(verification, verifiedBytes);
  return verification;
};

export const readVerifiedOmensBytesForParser = (
  verification: VerifiedOmensBytes
): Uint8Array => {
  const bytes = bytesByVerification.get(verification);

  if (bytes === undefined) {
    throw new TypeError("Invalid Omens recipe verification.");
  }

  return new Uint8Array(bytes);
};
