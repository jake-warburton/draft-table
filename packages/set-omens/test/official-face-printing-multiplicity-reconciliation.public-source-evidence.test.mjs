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
  projectOfficialCardVaultFaceMetadata,
  reconcileOfficialCardVaultFacePrintingMultiplicity,
  reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData,
  validateFabEnglishCardDataAgainstSchema
} from "../src/schema-validation.ts";

const cardPath = process.env.FAB_CARD_SOURCE_EVIDENCE_PATH;
const schemaPath = process.env.FAB_CARD_SCHEMA_EVIDENCE_PATH;
const cardVaultPath = process.env.FAB_CARD_VAULT_EVIDENCE_PATH;
const available = Boolean(cardPath && schemaPath && cardVaultPath);

test("the three checksum-verified public sources establish only MV face-to-upstream-row multiplicity facts", {
  skip: !available ? "public source acceptance did not run; set all three evidence paths or use npm run test:public-source-evidence" : false
}, () => {
  const documents = validateVerifiedFabCardSourceDocuments(
    verifyFabEnglishCardBytes(readFileSync(cardPath)), verifyFabCardSchemaBytes(readFileSync(schemaPath))
  );
  const membership = validateCardVaultOmensOfficialMembership(readFileSync(cardVaultPath));
  const facts = reconcileOfficialCardVaultFacePrintingMultiplicity(
    projectOfficialCardVaultFaceMetadata(membership, readFileSync(cardVaultPath)),
    reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData(membership, validateFabEnglishCardDataAgainstSchema(documents.card, documents.schema))
  );
  assert.equal(facts.length, 9);
  assert.equal(facts.reduce((total, fact) => total + fact.officialFaceCount, 0), 11);
  assert.equal(facts.reduce((total, fact) => total + fact.upstreamPrintingRowCount, 0), 11);
  assert.equal(facts.filter((fact) => fact.officialFaceCount === 1 && fact.upstreamPrintingRowCount === 1).length, 7);
  assert.equal(facts.filter((fact) => fact.officialFaceCount === 2 && fact.upstreamPrintingRowCount === 2).length, 2);
  assert.equal(facts.filter((fact) => fact.officialFaceCount !== fact.upstreamPrintingRowCount).length, 0);
  assert.deepEqual(new Set(facts.filter((fact) => fact.officialIsMulti).map((fact) => fact.officialPrintId)), new Set(facts.filter((fact) => fact.upstreamIsMulti).map((fact) => fact.officialPrintId)));
});
