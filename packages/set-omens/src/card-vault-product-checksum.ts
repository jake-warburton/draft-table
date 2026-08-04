import { CARD_VAULT_OMENS_PRODUCT_RESPONSE } from "./card-vault-product-descriptor.ts";
import { sha256Hex } from "./sha256.ts";

export type CardVaultOmensProductArtifact = "CARD_VAULT_OMENS_PRODUCT_CARDS_RESPONSE";

export class CardVaultOmensProductChecksumError extends Error {
  readonly code = "CARD_VAULT_OMENS_PRODUCT_RESPONSE_CHECKSUM_MISMATCH";

  constructor() {
    super("Pinned official Card Vault response checksum mismatch.");
    this.name = "CardVaultOmensProductChecksumError";
    this.stack = `${this.name}: ${this.message}`;
  }
}

declare const verifiedCardVaultOmensProductResponseBrand: unique symbol;

export type VerifiedCardVaultOmensProductResponse = Readonly<{
  [verifiedCardVaultOmensProductResponseBrand]: true;
}>;

type PinnedCardVaultArtifact = Readonly<{
  artifact: CardVaultOmensProductArtifact;
  byteLength: number;
  sha256: string;
}>;

type RetainedResponse = Readonly<{
  artifact: CardVaultOmensProductArtifact;
  bytes: Uint8Array;
}>;

const responsesByVerification = new WeakMap<VerifiedCardVaultOmensProductResponse, RetainedResponse>();

const PINNED_RESPONSE: PinnedCardVaultArtifact = Object.freeze({
  artifact: CARD_VAULT_OMENS_PRODUCT_RESPONSE.artifact,
  byteLength: CARD_VAULT_OMENS_PRODUCT_RESPONSE.byteLength,
  sha256: CARD_VAULT_OMENS_PRODUCT_RESPONSE.sha256
});

/** Package-internal test seam for synthetic checksum contracts. */
export const verifyCardVaultResponseBytesAgainstPinnedArtifact = (
  bytes: Uint8Array,
  pinned: PinnedCardVaultArtifact
): VerifiedCardVaultOmensProductResponse => {
  const copiedBytes = new Uint8Array(bytes);

  if (copiedBytes.byteLength !== pinned.byteLength || sha256Hex(copiedBytes) !== pinned.sha256) {
    throw new CardVaultOmensProductChecksumError();
  }

  const verification = Object.freeze({}) as VerifiedCardVaultOmensProductResponse;
  responsesByVerification.set(verification, Object.freeze({ artifact: pinned.artifact, bytes: copiedBytes }));
  return verification;
};

/** Verifies opaque, caller-provided observed-response bytes before any future decode or parse. */
export const verifyCardVaultOmensProductResponseBytes = (
  bytes: Uint8Array
): VerifiedCardVaultOmensProductResponse => verifyCardVaultResponseBytesAgainstPinnedArtifact(bytes, PINNED_RESPONSE);

/** Package-internal future parser seam; the root package export deliberately does not expose it. */
export const readVerifiedCardVaultOmensProductResponseBytesForParser = (
  verification: VerifiedCardVaultOmensProductResponse
): Uint8Array => {
  const retained = responsesByVerification.get(verification);

  if (retained === undefined || retained.artifact !== "CARD_VAULT_OMENS_PRODUCT_CARDS_RESPONSE") {
    throw new TypeError("Invalid official Card Vault response verification.");
  }

  return new Uint8Array(retained.bytes);
};
