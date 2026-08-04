import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  FabCardSourceSchemaValidationError,
  validateFabEnglishCardDataAgainstSchema
} from "../src/schema-validation.ts";
import {
  validateFabCardSchemaDocumentFromTrustedBytes,
  validateFabEnglishCardDocumentFromTrustedBytes
} from "../src/public-source-document.ts";
import {
  readSchemaValidatedFabEnglishCardDataForParser,
  validateFabCardDataDocumentsForSchema
} from "../src/public-source-schema-validation.ts";

const bytes = (value) => new TextEncoder().encode(JSON.stringify(value));
const schema = (value) => validateFabCardSchemaDocumentFromTrustedBytes(bytes(value));
const cards = (value) => validateFabEnglishCardDocumentFromTrustedBytes(bytes(value));
const draft4 = (properties = {}) => ({
  $schema: "http://json-schema.org/draft-04/schema#",
  type: "array",
  items: { type: "object", properties, required: Object.keys(properties), additionalProperties: false }
});

const expectSafeSchemaError = (action) => {
  assert.throws(action, (error) => {
    assert.ok(error instanceof FabCardSourceSchemaValidationError);
    assert.equal(error.code, "FAB_CARD_SOURCE_SCHEMA_VALIDATION_FAILED");
    assert.equal(error.message, "Pinned public card source schema validation failed.");
    assert.equal(error.stack, "FabCardSourceSchemaValidationError: Pinned public card source schema validation failed.");
    assert.deepEqual(JSON.parse(JSON.stringify(error)), {
      name: "FabCardSourceSchemaValidationError",
      code: "FAB_CARD_SOURCE_SCHEMA_VALIDATION_FAILED"
    });
    assert.doesNotMatch(`${error.message}${error.stack}${JSON.stringify(error)}`, /fictional|field|property|path|keyword|https?:|\\|\//i);
    return true;
  });
};

test("the internal Draft-04 seam validates complete fictional card arrays and retains independent copies", () => {
  const data = validateFabCardDataDocumentsForSchema(cards([
    { name: "first", tags: ["A"], nested: { enabled: true } },
    { name: "second", tags: ["B"], nested: { enabled: false } }
  ]), schema(draft4({
    name: { type: "string", minLength: 1 },
    tags: { type: "array", minItems: 1, items: { type: "string", enum: ["A", "B"] } },
    nested: { type: "object", properties: { enabled: { type: "boolean" } }, required: ["enabled"], additionalProperties: false }
  })));

  assert.ok(Object.isFrozen(data));
  const copy = readSchemaValidatedFabEnglishCardDataForParser(data);
  assert.deepEqual(copy, [
    { name: "first", tags: ["A"], nested: { enabled: true } },
    { name: "second", tags: ["B"], nested: { enabled: false } }
  ]);
  copy[0].tags[0] = "mutated";
  assert.equal(readSchemaValidatedFabEnglishCardDataForParser(data)[0].tags[0], "A");
});

test("the internal Draft-04 seam requires the exact dialect URI", () => {
  const cardData = [{ value: "allowed" }];
  for (const dialect of [undefined, "http://json-schema.org/draft-03/schema#", "https://json-schema.org/draft/2020-12/schema", 4,
    "http://json-schema.org/DRAFT-04/schema#", "http://json-schema.org/draft-04/schema"])
    expectSafeSchemaError(() => validateFabCardDataDocumentsForSchema(cards(cardData), schema({ $schema: dialect, type: "array", items: { type: "object" } })));
});

test("local Draft-04 fragment refs work, while every nested non-local or non-string ref is blocked", () => {
  const local = {
    $schema: "http://json-schema.org/draft-04/schema#", type: "array", items: { $ref: "#/definitions/card" },
    definitions: { card: { type: "object", properties: { value: { type: "string" } }, required: ["value"], additionalProperties: false } }
  };
  const capability = validateFabCardDataDocumentsForSchema(cards([{ value: "allowed" }]), schema(local));
  assert.deepEqual(readSchemaValidatedFabEnglishCardDataForParser(capability), [{ value: "allowed" }]);

  const refValues = ["https://example.invalid/schema", "http://example.invalid/schema", "schemas/card.json", "//example.invalid/schema", 7];
  for (const ref of refValues) {
    const nested = {
      $schema: "http://json-schema.org/draft-04/schema#", type: "array", items: { type: "object", properties: { nested: { type: "array", items: { $ref: "#/definitions/card" } } } },
      definitions: { card: { type: "object", properties: { value: { type: "string" }, deeper: { type: "object", properties: { ref: { $ref: ref } } } } } }
    };
    expectSafeSchemaError(() => validateFabCardDataDocumentsForSchema(cards([{ nested: [] }]), schema(nested)));
  }
});

test("the internal Draft-04 seam safely rejects complete-array and schema violations", () => {
  const valid = draft4({ value: { type: "string", enum: ["allowed"] } });
  for (const [cardData, schemaData] of [
    [[{}], valid],
    [[{ value: 1 }], valid],
    [[{ value: "forbidden" }], valid],
    [[{ value: "allowed", extra: true }], valid],
    [[{ value: "allowed" }, { value: 1 }], valid],
    [[{ value: [] }], valid],
    [[{ entries: {} }], draft4({ entries: { type: "array", items: { type: "string" } } })],
    [[{ nested: [] }], draft4({ nested: { type: "object", properties: {}, additionalProperties: false } })],
    [[{ value: "allowed" }], { $schema: "https://json-schema.org/draft/2020-12/schema", type: "array" }],
    [[{ value: "allowed" }], { $schema: "http://json-schema.org/draft-04/schema#", $ref: "https://example.invalid/schema" }],
    [[{ value: "allowed" }], { $schema: "http://json-schema.org/draft-04/schema#", type: "not-a-real-type" }]
  ]) expectSafeSchemaError(() => validateFabCardDataDocumentsForSchema(cards(cardData), schema(schemaData)));

  const nested = draft4({ entries: { type: "array", items: { type: "object", properties: { count: { type: "integer" } }, required: ["count"], additionalProperties: false } } });
  expectSafeSchemaError(() => validateFabCardDataDocumentsForSchema(cards([{ entries: [{ count: "wrong" }] }]), schema(nested)));
});

test("the public schema-validation entry point rejects unverified, forged, and swapped capabilities before compilation", () => {
  const card = cards([{ value: "fictional" }]);
  const cardSchema = schema(draft4({ value: { type: "string" } }));
  expectSafeSchemaError(() => validateFabEnglishCardDataAgainstSchema(card, cardSchema));
  expectSafeSchemaError(() => validateFabEnglishCardDataAgainstSchema(cardSchema, card));
  expectSafeSchemaError(() => validateFabEnglishCardDataAgainstSchema(Object.freeze({}), Object.freeze({})));

  const source = readFileSync(new URL("../src/schema-validation.ts", import.meta.url), "utf8");
  const composed = source.slice(source.indexOf("export const validateFabEnglishCardDataAgainstSchema"));
  const cardGate = composed.indexOf("assertVerifiedValidatedFabEnglishCardDocument(card)");
  const schemaGate = composed.indexOf("assertVerifiedValidatedFabCardSchemaDocument(schema)");
  const validate = composed.indexOf("validateFabCardDataDocumentsForSchema");
  assert.ok(cardGate >= 0 && schemaGate >= 0 && validate > cardGate && validate > schemaGate);
  const documentImplementation = readFileSync(new URL("../src/public-source-document.ts", import.meta.url), "utf8");
  const assertions = documentImplementation.slice(documentImplementation.indexOf("export const assertVerifiedValidatedFabEnglishCardDocument"));
  assert.doesNotMatch(assertions, /new Uint8Array/);
  const implementation = readFileSync(new URL("../src/public-source-schema-validation.ts", import.meta.url), "utf8");
  assert.match(implementation, /\$schema[^\n]*!== DRAFT_04/);
  assert.match(implementation, /key === "\$ref" && \(typeof child !== "string" \|\| !child\.startsWith\("#"\)\)/);
  assert.match(implementation, /\|\| hasRemoteReference\(schema\)/);
  assert.match(implementation, /allErrors: false/);
  assert.doesNotMatch(implementation, /compileAsync|loadSchema/);
});

test("the schema-validation internal reader rejects forged and swapped capabilities", () => {
  const valid = validateFabCardDataDocumentsForSchema(cards([{ value: "fictional" }]), schema(draft4({ value: { type: "string" } })));
  assert.deepEqual(readSchemaValidatedFabEnglishCardDataForParser(valid), [{ value: "fictional" }]);
  assert.throws(() => readSchemaValidatedFabEnglishCardDataForParser(Object.freeze({})), TypeError);
});
