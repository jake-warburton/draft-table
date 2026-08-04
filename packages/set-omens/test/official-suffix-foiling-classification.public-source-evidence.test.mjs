import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  validateCardVaultOmensOfficialMembership,
  validateVerifiedFabCardSourceDocuments,
  verifyFabCardSchemaBytes,
  verifyFabEnglishCardBytes
} from "../src/index.ts";
import {
  classifyOfficialCardVaultSuffixFoiling,
  reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData,
  validateFabEnglishCardDataAgainstSchema
} from "../src/schema-validation.ts";

const cardPath = process.env.FAB_CARD_SOURCE_EVIDENCE_PATH;
const schemaPath = process.env.FAB_CARD_SCHEMA_EVIDENCE_PATH;
const cardVaultPath = process.env.FAB_CARD_VAULT_EVIDENCE_PATH;
const available = Boolean(cardPath && schemaPath && cardVaultPath);

test("the three checksum-verified public sources establish only pinned suffix-to-upstream-foiling aggregates", {
  skip: !available ? "public source acceptance did not run; set all three evidence paths or use npm run test:public-source-evidence" : false
}, () => {
  const documents = validateVerifiedFabCardSourceDocuments(
    verifyFabEnglishCardBytes(readFileSync(cardPath)), verifyFabCardSchemaBytes(readFileSync(schemaPath))
  );
  const reconciliation = reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData(
    validateCardVaultOmensOfficialMembership(readFileSync(cardVaultPath)),
    validateFabEnglishCardDataAgainstSchema(documents.card, documents.schema)
  );
  const classifications = classifyOfficialCardVaultSuffixFoiling(reconciliation);
  const byMarker = (marker) => classifications.filter((entry) => entry.suffixMarker === marker);
  const candidates = (entries) => entries.flatMap((entry) => entry.candidatePrintings);
  const selected = (entries) => entries.flatMap((entry) => entry.selectedCorrespondencePrintings);
  const unspecified = byMarker(null), rf = byMarker("RF"), cf = byMarker("CF"), mv = byMarker("MV");
  assert.equal(unspecified.length, 242); assert.equal(candidates(unspecified).length, 467); assert.equal(selected(unspecified).length, 0);
  assert.equal(rf.length, 6); assert.equal(candidates(rf).length, 12); assert.equal(selected(rf).length, 6);
  assert.ok(rf.every((entry) => entry.candidatePrintings.filter((row) => row.foiling === "C").length === 1 && entry.selectedCorrespondencePrintings.length === 1 && entry.selectedCorrespondencePrintings[0].foiling === "R"));
  assert.equal(cf.length, 3); assert.equal(candidates(cf).length, 3); assert.equal(selected(cf).length, 3); assert.ok(selected(cf).every((row) => row.foiling === "C"));
  assert.equal(mv.length, 9); assert.equal(candidates(mv).length, 11); assert.equal(selected(mv).length, 11); assert.ok(candidates(mv).every((row) => row.foiling === "C"));
  assert.equal(mv.filter((entry) => entry.candidatePrintings.length === 1).length, 7); assert.equal(mv.filter((entry) => entry.candidatePrintings.length === 2).length, 2);
  const suffix = classifications.filter((entry) => entry.suffixMarker !== null); const selectedRows = selected(suffix);
  assert.equal(suffix.length, 18); assert.equal(candidates(suffix).length, 26); assert.equal(selectedRows.length, 20);
  assert.equal(new Set(selectedRows.map((row) => row.unique_id)).size, 20);
});
