import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CARD_VAULT_OMENS_PRODUCT_RESPONSE,
  CardVaultOmensProductChecksumError,
  verifyCardVaultOmensProductBytes,
  verifyFabEnglishCardBytes
} from "../src/index.ts";
import { readVerifiedCardVaultOmensProductResponseBytesForParser } from "../src/card-vault-product-checksum.ts";

const responsePath = process.env.FAB_CARD_VAULT_EVIDENCE_PATH;
const cardPath = process.env.FAB_CARD_SOURCE_EVIDENCE_PATH;
const available = Boolean(responsePath && cardPath);

test("the observed official Card Vault response is checksum-gated without parsing", {
  skip: !available ? "public source acceptance did not run; set FAB_CARD_VAULT_EVIDENCE_PATH and FAB_CARD_SOURCE_EVIDENCE_PATH or use npm run test:public-source-evidence" : false
}, () => {
  assert.deepEqual(CARD_VAULT_OMENS_PRODUCT_RESPONSE, {
    artifact: "CARD_VAULT_OMENS_PRODUCT_CARDS_RESPONSE",
    evidenceId: "card-vault-omens-product-cards-observed-2026-08-04",
    observedOn: "2026-08-04",
    endpoint: "https://api.cardvault.fabtcg.com/carddb/api/v1/product-cards/omens-of-the-third-age/",
    mediaType: "application/json",
    byteLength: 168977,
    sha256: "59f26e3071ef50a0515c99ce568110934290aad698b3669b45e224e52fc1a83f",
    provenance: "official-card-vault-public-product-endpoint-observed-response",
    stability: "unversioned endpoint; no ETag, Last-Modified, or version stability promise observed"
  });
  assert.ok(Object.isFrozen(CARD_VAULT_OMENS_PRODUCT_RESPONSE));

  const response = readFileSync(responsePath);
  const verification = verifyCardVaultOmensProductBytes(response);
  assert.ok(Object.isFrozen(verification));
  assert.deepEqual(Object.keys(verification), []);
  assert.equal(Buffer.compare(readVerifiedCardVaultOmensProductResponseBytesForParser(verification), response), 0);

  response[0] ^= 1;
  assert.equal(Buffer.compare(readVerifiedCardVaultOmensProductResponseBytesForParser(verification), readFileSync(responsePath)), 0);
  assert.throws(() => verifyCardVaultOmensProductBytes(response), (error) => {
    assert.ok(error instanceof CardVaultOmensProductChecksumError);
    assert.equal(error.code, "CARD_VAULT_OMENS_PRODUCT_RESPONSE_CHECKSUM_MISMATCH");
    return true;
  });
  assert.throws(
    () => readVerifiedCardVaultOmensProductResponseBytesForParser(verifyFabEnglishCardBytes(readFileSync(cardPath))),
    TypeError
  );
});
