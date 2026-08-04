import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  validateVerifiedFabCardSourceDocuments,
  verifyFabCardSchemaBytes,
  verifyFabEnglishCardBytes
} from "../src/index.ts";
import {
  FabCardSourceSchemaValidationError,
  projectSchemaValidatedFabEnglishCardDataForOmn,
  validateFabEnglishCardDataAgainstSchema
} from "../src/schema-validation.ts";
import {
  validateFabCardSchemaDocumentFromTrustedBytes,
  validateFabEnglishCardDocumentFromTrustedBytes
} from "../src/public-source-document.ts";
import { validateFabCardDataDocumentsForSchema } from "../src/public-source-schema-validation.ts";

const cardPath = process.env.FAB_CARD_SOURCE_EVIDENCE_PATH;
const schemaPath = process.env.FAB_CARD_SCHEMA_EVIDENCE_PATH;
const available = Boolean(cardPath && schemaPath);

test("the exact pinned public card source fully conforms to its pinned Draft-04 schema", {
  skip: !available ? "public source acceptance did not run; set FAB_CARD_SOURCE_EVIDENCE_PATH and FAB_CARD_SCHEMA_EVIDENCE_PATH or use npm run test:public-source-evidence" : false
}, () => {
  const cardBytes = readFileSync(cardPath);
  const schemaBytes = readFileSync(schemaPath);
  const pinnedSchema = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(schemaBytes));
  assert.equal(pinnedSchema.items.properties.pitch.type, "string");
  assert.ok(pinnedSchema.items.required.includes("pitch"));
  assert.equal(Object.hasOwn(pinnedSchema.items.properties.pitch, "enum"), false);
  const documents = validateVerifiedFabCardSourceDocuments(
    verifyFabEnglishCardBytes(cardBytes),
    verifyFabCardSchemaBytes(schemaBytes)
  );
  const data = validateFabEnglishCardDataAgainstSchema(documents.card, documents.schema);
  assert.ok(Object.isFrozen(data));
  const omn = projectSchemaValidatedFabEnglishCardDataForOmn(data);
  assert.equal(omn.length, 251);
  assert.equal(omn.flatMap((entry) => entry.printings).length, 482);
  assert.equal(new Set(omn.flatMap((entry) => entry.printings.map((printing) => printing.id))).size, 251);

  const mutated = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(cardBytes));
  const required = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(schemaBytes)).items.required[0];
  delete mutated[0][required];
  assert.throws(() => validateFabCardDataDocumentsForSchema(
    validateFabEnglishCardDocumentFromTrustedBytes(new TextEncoder().encode(JSON.stringify(mutated))),
    validateFabCardSchemaDocumentFromTrustedBytes(schemaBytes)
  ), FabCardSourceSchemaValidationError);
});
