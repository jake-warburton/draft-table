import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  FabCardSourceJsonDocumentError,
  validateVerifiedFabCardSchemaDocument,
  validateVerifiedFabCardSourceDocuments,
  validateVerifiedFabEnglishCardDocument
} from "../src/index.ts";
import {
  readValidatedFabCardSchemaBytesForParser,
  readValidatedFabEnglishCardBytesForParser,
  validateFabCardSchemaDocumentFromTrustedBytes,
  validateFabEnglishCardDocumentFromTrustedBytes
} from "../src/public-source-document.ts";

const bytes = (text) => new TextEncoder().encode(text);
const expectDocumentError = (validate, source, artifact) => {
  assert.throws(() => validate(bytes(source)), (error) => {
    assert.ok(error instanceof FabCardSourceJsonDocumentError);
    assert.equal(error.code, "FAB_CARD_SOURCE_JSON_DOCUMENT_INVALID");
    assert.equal(error.artifact, artifact);
    assert.equal(error.message, "Pinned public card source JSON document is invalid.");
    assert.equal(error.stack, "FabCardSourceJsonDocumentError: Pinned public card source JSON document is invalid.");
    assert.deepEqual(JSON.parse(JSON.stringify(error)), { name: "FabCardSourceJsonDocumentError", code: "FAB_CARD_SOURCE_JSON_DOCUMENT_INVALID", artifact });
    assert.doesNotMatch(`${error.message}${error.stack}${JSON.stringify(error)}`, /private|secret|https?:|fictional|\\|utf-8/i);
    return true;
  });
};

const card = validateFabEnglishCardDocumentFromTrustedBytes;
const schema = validateFabCardSchemaDocumentFromTrustedBytes;

test("strict JSON document validation accepts compact fictional observed envelopes and retains private copies", () => {
  const cardBytes = bytes('[{"nested":{"name":"fictional"}}]');
  const schemaBytes = bytes('{"nested":{"items":[{"name":"fictional"}]}}');
  const cardDocument = card(cardBytes);
  const schemaDocument = schema(schemaBytes);
  assert.ok(Object.isFrozen(cardDocument));
  assert.ok(Object.isFrozen(schemaDocument));
  const retainedCard = readValidatedFabEnglishCardBytesForParser(cardDocument);
  const retainedSchema = readValidatedFabCardSchemaBytesForParser(schemaDocument);
  assert.deepEqual(retainedCard, cardBytes);
  assert.deepEqual(retainedSchema, schemaBytes);
  cardBytes[1] = 0x20;
  schemaBytes[1] = 0x20;
  retainedCard[1] = 0x20;
  retainedSchema[1] = 0x20;
  assert.equal(new TextDecoder().decode(readValidatedFabEnglishCardBytesForParser(cardDocument)), '[{"nested":{"name":"fictional"}}]');
  assert.equal(new TextDecoder().decode(readValidatedFabCardSchemaBytesForParser(schemaDocument)), '{"nested":{"items":[{"name":"fictional"}]}}');
});

test("strict JSON document validation rejects UTF-8 and observed envelope deviations", () => {
  for (const validate of [card, schema]) {
    expectDocumentError(validate, "\ufeff[]", validate === card ? "FAB_CARD_JSON" : "FAB_CARD_SCHEMA_JSON");
    expectDocumentError(validate, validate === card ? "[\r\n]" : "{\r\n}", validate === card ? "FAB_CARD_JSON" : "FAB_CARD_SCHEMA_JSON");
    expectDocumentError(validate, validate === card ? "[]\n" : "{}\n", validate === card ? "FAB_CARD_JSON" : "FAB_CARD_SCHEMA_JSON");
  }
  assert.throws(() => card(new Uint8Array([0x5b, 0xc3, 0x5d])), FabCardSourceJsonDocumentError);
  assert.throws(() => schema(new Uint8Array([0x7b, 0xc3, 0x7d])), FabCardSourceJsonDocumentError);
});

test("strict JSON document validation rejects malformed or trailing JSON and wrong roots without record inspection", () => {
  for (const [validate, artifact, malformed, trailing, roots] of [
    [card, "FAB_CARD_JSON", "[", "[]x", ["[]", "{}", "null"]],
    [schema, "FAB_CARD_SCHEMA_JSON", "{", "{}x", ["{}", "[]", "null"]]
  ]) {
    expectDocumentError(validate, malformed, artifact);
    expectDocumentError(validate, trailing, artifact);
    for (const root of roots.slice(1)) expectDocumentError(validate, root, artifact);
  }
  assert.doesNotThrow(() => card(bytes('[{"unimplementedCardField":false}]')));
  assert.doesNotThrow(() => schema(bytes('{"unimplementedSchemaKeyword":false}')));
  expectDocumentError(card, "[]", "FAB_CARD_JSON");
});

test("strict JSON document validation rejects duplicate keys at every object depth", () => {
  for (const [validate, artifact, root, nested, arrayObject] of [
    [card, "FAB_CARD_JSON", '[{"a":1,"a":2}]', '[{"a":{"b":1,"b":2}}]', '[{"a":[{"b":1,"b":2}]}]'],
    [schema, "FAB_CARD_SCHEMA_JSON", '{"a":1,"a":2}', '{"a":{"b":1,"b":2}}', '{"a":[{"b":1,"b":2}]}']
  ]) {
    for (const duplicate of [root, nested, arrayObject]) expectDocumentError(validate, duplicate, artifact);
  }
  expectDocumentError(card, '[{"a":1,"\\u0061":2}]', "FAB_CARD_JSON");
});

test("public document entry points reject forged and swapped source capabilities", () => {
  const forgedCard = Object.freeze({ descriptor: {}, verification: Object.freeze({}) });
  const forgedSchema = Object.freeze({ descriptor: {}, verification: Object.freeze({}) });
  assert.throws(() => validateVerifiedFabEnglishCardDocument(forgedCard), TypeError);
  assert.throws(() => validateVerifiedFabCardSchemaDocument(forgedSchema), TypeError);
  assert.throws(() => validateVerifiedFabCardSourceDocuments(forgedCard, forgedSchema), TypeError);
});

test("the composed acceptance path checks both artifact capabilities before any decode or JSON call", () => {
  const source = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
  const composed = source.slice(source.indexOf("export const validateVerifiedFabCardSourceDocuments"));
  const cardCheck = composed.indexOf('requireVerifiedPublicSource(card, "FAB_CARD_JSON")');
  const schemaCheck = composed.indexOf('requireVerifiedPublicSource(schema, "FAB_CARD_SCHEMA_JSON")');
  const decode = composed.indexOf("validateFabEnglishCardDocumentFromVerifiedBytes");
  const parse = readFileSync(new URL("../src/public-source-document.ts", import.meta.url), "utf8");
  assert.ok(cardCheck >= 0 && schemaCheck >= 0 && decode > cardCheck && decode > schemaCheck);
  assert.ok(parse.indexOf("new TextDecoder") > parse.indexOf("readVerifiedFabEnglishCardBytesForParser"));
  assert.ok(parse.indexOf("JSON.parse") > parse.indexOf("new JsonScanner(text).scan()"));
});
