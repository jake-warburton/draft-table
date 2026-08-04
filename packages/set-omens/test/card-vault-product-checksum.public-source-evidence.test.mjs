import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CARD_VAULT_OMENS_PRODUCT_RESPONSE,
  CardVaultOmensProductChecksumError,
  verifyCardVaultOmensProductBytes,
  validateCardVaultOmensOfficialMembership,
  validateVerifiedFabCardSourceDocuments,
  verifyFabCardSchemaBytes,
  verifyFabEnglishCardBytes
} from "../src/index.ts";
import { readVerifiedCardVaultOmensProductResponseBytesForParser } from "../src/card-vault-product-checksum.ts";
import { readOfficialCardVaultMembershipPrintIdsForReconciliation } from "../src/card-vault-official-membership.ts";
import { readOfficialCardVaultPrintIdForms } from "../src/card-vault-print-id-forms.ts";
import {
  projectSchemaValidatedFabEnglishCardDataForOmn,
  reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData,
  validateFabEnglishCardDataAgainstSchema
} from "../src/schema-validation.ts";

const responsePath = process.env.FAB_CARD_VAULT_EVIDENCE_PATH;
const cardPath = process.env.FAB_CARD_SOURCE_EVIDENCE_PATH;
const schemaPath = process.env.FAB_CARD_SCHEMA_EVIDENCE_PATH;
const available = Boolean(responsePath && cardPath);

test("the observed official Card Vault response remains dated checksum evidence", {
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

test("the observed official response derives only the published canonical membership facts", {
  skip: !available ? "public source acceptance did not run; set FAB_CARD_VAULT_EVIDENCE_PATH and FAB_CARD_SOURCE_EVIDENCE_PATH or use npm run test:public-source-evidence" : false
}, () => {
  const response = readFileSync(responsePath);
  const membership = validateCardVaultOmensOfficialMembership(response);
  const ids = readOfficialCardVaultMembershipPrintIdsForReconciliation(membership);
  assert.equal(ids.length, 260);
  assert.equal(ids.filter((id) => id.startsWith("OMN")).length, 251);
  assert.equal(ids.filter((id) => id.startsWith("IAR")).length, 9);
  assert.equal(createHash("sha256").update(`${ids.join("\n")}\n`).digest("hex"), "9b16117e4f558c91421a50d814baa3a8a16043bff645cec24291a32df6e079de");

  const cosmetic = JSON.parse(response);
  cosmetic.cards.reverse();
  cosmetic.cosmetic_only = { reordered: true };
  assert.doesNotThrow(() => validateCardVaultOmensOfficialMembership(Buffer.from(JSON.stringify(cosmetic, null, 1))));
  cosmetic.cards[0].print_id = "OMN999";
  assert.throws(() => validateCardVaultOmensOfficialMembership(Buffer.from(JSON.stringify(cosmetic))));
});

test("the three checksum-verified public sources reconcile all official bases with published aggregates", {
  skip: !available || !schemaPath ? "public source acceptance did not run; set all three evidence paths or use npm run test:public-source-evidence" : false
}, () => {
  const membership = validateCardVaultOmensOfficialMembership(readFileSync(responsePath));
  const documents = validateVerifiedFabCardSourceDocuments(
    verifyFabEnglishCardBytes(readFileSync(cardPath)), verifyFabCardSchemaBytes(readFileSync(schemaPath))
  );
  const records = reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData(
    membership, validateFabEnglishCardDataAgainstSchema(documents.card, documents.schema)
  );
  const omn = records.filter((record) => record.sourceSetMarker === "OMN");
  const iar = records.filter((record) => record.sourceSetMarker === "IAR");
  const rows = records.flatMap((record) => record.printings);
  assert.equal(records.length, 260); assert.equal(new Set(records.map((record) => record.unique_id)).size, 260);
  assert.equal(new Set(records.map((record) => record.baseCollectorId)).size, 260);
  assert.equal(omn.length, 251); assert.equal(omn.flatMap((record) => record.printings).length, 482);
  assert.equal(new Set(omn.map((record) => record.baseCollectorId)).size, 251);
  assert.equal(new Set(omn.flatMap((record) => record.printings.map((printing) => printing.unique_id))).size, 482);
  assert.equal(iar.length, 9); assert.equal(iar.flatMap((record) => record.printings).length, 11);
  assert.equal(new Set(iar.map((record) => record.baseCollectorId)).size, 9);
  assert.equal(new Set(iar.flatMap((record) => record.printings.map((printing) => printing.unique_id))).size, 11);
  assert.equal(rows.length, 493); assert.equal(new Set(rows.map((printing) => printing.unique_id)).size, 493);
  assert.equal(new Set(omn.flatMap((record) => record.printings.map((printing) => printing.set_printing_unique_id))).size, 1);
  assert.equal(new Set(iar.flatMap((record) => record.printings.map((printing) => printing.set_printing_unique_id))).size, 1);
  assert.notEqual(omn[0].printings[0].set_printing_unique_id, iar[0].printings[0].set_printing_unique_id);
  const recipeCandidates = records.filter((record) => record.sourceSetMarker === "OMN" && record.suffixMarker === null);
  assert.equal(recipeCandidates.length, 242);
  assert.equal(records.filter((record) => record.suffixMarker !== null).length, 18);
  assert.equal(records.filter((record) => record.pitch === "").length, 39);
  assert.equal(records.filter((record) => record.pitch === "1").length, 78);
  assert.equal(records.filter((record) => record.pitch === "2").length, 74);
  assert.equal(records.filter((record) => record.pitch === "3").length, 69);
  assert.equal(new Set(records.map((record) => `${record.name}\u0000${record.pitch}`)).size, 260);
  const colour = Object.freeze({ "1": "red", "2": "yellow", "3": "blue" });
  const deriveRecipeName = (record) => record.pitch === "" ? record.name : `${record.name} (${colour[record.pitch]})`;
  assert.equal(new Set(recipeCandidates.map(deriveRecipeName)).size, 242);
  assert.equal(new Set(records.map(deriveRecipeName)).size, 260);
  assert.ok(records.every((record) => Object.isFrozen(record)));
  assert.ok(records.every((record) => record.pitch === "" || record.pitch === "1" || record.pitch === "2" || record.pitch === "3"));
});

test("the nine canonical IAR IDs are absent from the exact OMN source projection", {
  skip: !available || !schemaPath ? "public source acceptance did not run; set all three evidence paths or use npm run test:public-source-evidence" : false
}, () => {
  const membership = validateCardVaultOmensOfficialMembership(readFileSync(responsePath));
  const iar = readOfficialCardVaultMembershipPrintIdsForReconciliation(membership).filter((id) => id.startsWith("IAR"));
  const forms = readOfficialCardVaultPrintIdForms(membership);
  const documents = validateVerifiedFabCardSourceDocuments(
    verifyFabEnglishCardBytes(readFileSync(cardPath)),
    verifyFabCardSchemaBytes(readFileSync(schemaPath))
  );
  const validated = validateFabEnglishCardDataAgainstSchema(documents.card, documents.schema);
  const omnIds = new Set(projectSchemaValidatedFabEnglishCardDataForOmn(validated).flatMap((card) => card.printings.map((printing) => printing.id)));
  assert.equal(iar.length, 9);
  assert.ok(iar.every((id) => !omnIds.has(id)));
  assert.equal(forms.filter((form) => form.sourceSet === "OMN" && form.suffixMarker === null).length, 242);
  assert.equal(forms.filter((form) => form.suffixMarker === "RF").length, 6);
  assert.equal(forms.filter((form) => form.suffixMarker === "CF").length, 3);
  assert.equal(forms.filter((form) => form.suffixMarker === "MV").length, 9);
  assert.equal(forms.length, 260);
  assert.equal(new Set(forms.map((form) => form.baseCollectorId)).size, 260);
});
