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
  reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData,
  validateFabEnglishCardDataAgainstSchema
} from "../src/schema-validation.ts";

const cardPath = process.env.FAB_CARD_SOURCE_EVIDENCE_PATH;
const schemaPath = process.env.FAB_CARD_SCHEMA_EVIDENCE_PATH;
const cardVaultPath = process.env.FAB_CARD_VAULT_EVIDENCE_PATH;
const available = Boolean(cardPath && schemaPath && cardVaultPath);

test("the three checksum-verified public sources establish only pinned uninterpreted art-variation sequence and suffix aggregates", {
  skip: !available ? "public source acceptance did not run; set all three evidence paths or use npm run test:public-source-evidence" : false
}, () => {
  const documents = validateVerifiedFabCardSourceDocuments(
    verifyFabEnglishCardBytes(readFileSync(cardPath)), verifyFabCardSchemaBytes(readFileSync(schemaPath))
  );
  const records = reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData(
    validateCardVaultOmensOfficialMembership(readFileSync(cardVaultPath)),
    validateFabEnglishCardDataAgainstSchema(documents.card, documents.schema)
  );
  const rows = records.flatMap((record) => record.printings.map((printing) => ({ suffix: record.suffixMarker, sequence: printing.art_variations })));
  const count = (suffix, sequence) => rows.filter((row) => row.suffix === suffix && JSON.stringify(row.sequence) === JSON.stringify(sequence)).length;
  assert.equal(rows.length, 493);
  assert.equal(count(undefined, []), 0);
  assert.equal(rows.filter((row) => JSON.stringify(row.sequence) === "[]").length, 442);
  assert.equal(rows.filter((row) => JSON.stringify(row.sequence) === '["EA"]').length, 22);
  assert.equal(rows.filter((row) => JSON.stringify(row.sequence) === '["FA"]').length, 25);
  assert.equal(rows.filter((row) => JSON.stringify(row.sequence) === '["AA","FA"]').length, 4);
  assert.equal(rows.filter((row) => !["[]", '["EA"]', '["FA"]', '["AA","FA"]'].includes(JSON.stringify(row.sequence))).length, 0);
  assert.equal(count(null, []), 429); assert.equal(count(null, ["EA"]), 20); assert.equal(count(null, ["FA"]), 14); assert.equal(count(null, ["AA", "FA"]), 4);
  assert.equal(count("RF", []), 10); assert.equal(count("RF", ["EA"]), 2);
  assert.equal(count("CF", []), 3); assert.equal(count("MV", ["FA"]), 11);
});
