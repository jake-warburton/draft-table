import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CardVaultOmensProductChecksumError,
  verifyCardVaultOmensProductBytes
} from "../src/index.ts";
import {
  readVerifiedCardVaultOmensProductResponseBytesForParser,
  verifyCardVaultResponseBytesAgainstPinnedArtifact
} from "../src/card-vault-product-checksum.ts";

const artifact = "CARD_VAULT_OMENS_PRODUCT_CARDS_RESPONSE";
const exactBytes = new Uint8Array([11, 22, 33, 44]);
const pinned = Object.freeze({
  artifact,
  byteLength: exactBytes.byteLength,
  sha256: createHash("sha256").update(exactBytes).digest("hex")
});

const verifySynthetic = (bytes) => verifyCardVaultResponseBytesAgainstPinnedArtifact(bytes, pinned);

const expectSafeError = (verify, bytes) => {
  assert.throws(() => verify(bytes), (error) => {
    assert.ok(error instanceof CardVaultOmensProductChecksumError);
    assert.equal(error.code, "CARD_VAULT_OMENS_PRODUCT_RESPONSE_CHECKSUM_MISMATCH");
    assert.equal(error.message, "Pinned official Card Vault response checksum mismatch.");
    assert.equal(error.stack, "CardVaultOmensProductChecksumError: Pinned official Card Vault response checksum mismatch.");
    assert.deepEqual(JSON.parse(JSON.stringify(error)), {
      name: "CardVaultOmensProductChecksumError",
      code: "CARD_VAULT_OMENS_PRODUCT_RESPONSE_CHECKSUM_MISMATCH"
    });
    assert.doesNotMatch(JSON.stringify(error), /99|98|97|https?:|\\|\//i);
    return true;
  });
};

test("synthetic Card Vault checksum contracts accept exact bytes and retain an independent copy", () => {
  const supplied = new Uint8Array(exactBytes);
  const verification = verifySynthetic(supplied);
  assert.ok(Object.isFrozen(verification));
  assert.deepEqual(Object.keys(verification), []);

  supplied[0] ^= 1;
  const retained = readVerifiedCardVaultOmensProductResponseBytesForParser(verification);
  assert.deepEqual(retained, exactBytes);
  retained[0] ^= 1;
  assert.deepEqual(readVerifiedCardVaultOmensProductResponseBytesForParser(verification), exactBytes);
});

test("synthetic Card Vault checksum contracts reject mutation, truncation, and extension safely", () => {
  const mutation = new Uint8Array(exactBytes);
  mutation[1] ^= 1;
  expectSafeError(verifySynthetic, mutation);
  expectSafeError(verifySynthetic, exactBytes.subarray(0, exactBytes.byteLength - 1));
  expectSafeError(verifySynthetic, new Uint8Array([...exactBytes, 0]));
});

test("Card Vault capabilities reject wrong artifacts and unforgeable swaps", () => {
  const verification = verifySynthetic(exactBytes);
  assert.throws(
    () => readVerifiedCardVaultOmensProductResponseBytesForParser(Object.freeze({})),
    TypeError
  );
  assert.throws(
    () => readVerifiedCardVaultOmensProductResponseBytesForParser(Object.freeze({ artifact })),
    TypeError
  );
  assert.deepEqual(readVerifiedCardVaultOmensProductResponseBytesForParser(verification), exactBytes);
});

test("the Card Vault verifier remains checksum-only and checks length before hashing", () => {
  expectSafeError(verifyCardVaultOmensProductBytes, new Uint8Array([99, 98, 97]));
  const source = readFileSync(new URL("../src/card-vault-product-checksum.ts", import.meta.url), "utf8");
  assert.match(source, /copiedBytes\.byteLength !== pinned\.byteLength \|\| sha256Hex\(copiedBytes\) !== pinned\.sha256/);
  assert.doesNotMatch(source, /TextDecoder|Buffer\.from|\.toString\s*\(|JSON\.parse|parse[A-Z_a-z]*\s*\(/);
});
