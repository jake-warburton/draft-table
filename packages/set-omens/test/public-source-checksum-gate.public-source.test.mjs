import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  FAB_CARD_SOURCE,
  FabCardSourceChecksumError,
  verifyFabCardSchemaBytes,
  verifyFabEnglishCardBytes
} from "../src/index.ts";
import { readVerifiedFabCardSourceBytesForParser } from "../src/public-source-checksum.ts";

const cardPath = process.env.FAB_CARD_SOURCE_EVIDENCE_PATH;
const schemaPath = process.env.FAB_CARD_SCHEMA_EVIDENCE_PATH;
const evidenceAvailable = Boolean(cardPath && schemaPath);

const expectSafeError = (verify, bytes, artifact) => {
  assert.throws(() => verify(bytes), (error) => {
    assert.ok(error instanceof FabCardSourceChecksumError);
    assert.equal(error.code, "FAB_CARD_SOURCE_CHECKSUM_MISMATCH");
    assert.equal(error.artifact, artifact);
    assert.equal(error.message, "Pinned public card source checksum mismatch.");
    assert.equal(error.stack, "FabCardSourceChecksumError: Pinned public card source checksum mismatch.");
    assert.deepEqual(JSON.parse(JSON.stringify(error)), { name: "FabCardSourceChecksumError", code: "FAB_CARD_SOURCE_CHECKSUM_MISMATCH", artifact });
    assert.doesNotMatch(JSON.stringify(error), /99|98|97|https?:|\\|\//i);
    return true;
  });
};

test("the immutable public-source descriptor pins only the tagged build-time inputs", () => {
  assert.deepEqual(FAB_CARD_SOURCE, {
    repository: "the-fab-cube/flesh-and-blood-cards",
    tag: "v8.2.0",
    commit: "d0665abbbce2ef6876bc14e34883d4e3cf3fb904",
    cardPath: "json/english/card.json",
    cardRawUrl: "https://raw.githubusercontent.com/the-fab-cube/flesh-and-blood-cards/d0665abbbce2ef6876bc14e34883d4e3cf3fb904/json/english/card.json",
    cardByteLength: 22756270,
    cardSha256: "243162c827dc9becc3dad46894b15e6ed4dfb7ceb63eee10efb3568f6730219e",
    schemaPath: "json-schema/card-schema.json",
    schemaRawUrl: "https://raw.githubusercontent.com/the-fab-cube/flesh-and-blood-cards/d0665abbbce2ef6876bc14e34883d4e3cf3fb904/json-schema/card-schema.json",
    schemaByteLength: 20417,
    schemaSha256: "4fd114d85ab416854e84d298f468d1bc390075997d9d8886378b699586b886c1",
    provenance: "public-upstream-build-time-only-no-runtime-fetch"
  });
  assert.ok(Object.isFrozen(FAB_CARD_SOURCE));
  assert.throws(() => { FAB_CARD_SOURCE.tag = "develop"; }, TypeError);
});

test("card and schema verification fail separately and safely before any decode", () => {
  expectSafeError(verifyFabEnglishCardBytes, new Uint8Array([99, 98, 97]), "FAB_CARD_JSON");
  expectSafeError(verifyFabCardSchemaBytes, new Uint8Array([99, 98, 97]), "FAB_CARD_SCHEMA_JSON");
  const source = readFileSync(new URL("../src/public-source-checksum.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /TextDecoder|Buffer\.from|\.toString\s*\(|JSON\.parse|parse[A-Z_a-z]*\s*\(/);
});

test("exact evidence creates separated opaque immutable capabilities that copy retained bytes", {
  skip: !evidenceAvailable ? "public source acceptance did not run; set FAB_CARD_SOURCE_EVIDENCE_PATH and FAB_CARD_SCHEMA_EVIDENCE_PATH or use npm run test:public-source-evidence" : false
}, () => {
  const card = readFileSync(cardPath);
  const schema = readFileSync(schemaPath);
  const verifiedCard = verifyFabEnglishCardBytes(card);
  const verifiedSchema = verifyFabCardSchemaBytes(schema);

  assert.deepEqual(Object.keys(verifiedCard), ["descriptor", "verification"]);
  assert.deepEqual(Object.keys(verifiedSchema), ["descriptor", "verification"]);
  assert.ok(Object.isFrozen(verifiedCard));
  assert.ok(Object.isFrozen(verifiedSchema));
  assert.notStrictEqual(verifiedCard.verification, verifiedSchema.verification);
  assert.throws(() => { verifiedCard.descriptor = FAB_CARD_SOURCE; }, TypeError);

  const retainedCard = readVerifiedFabCardSourceBytesForParser(verifiedCard.verification);
  const retainedSchema = readVerifiedFabCardSourceBytesForParser(verifiedSchema.verification);
  assert.equal(Buffer.compare(retainedCard, card), 0);
  assert.equal(Buffer.compare(retainedSchema, schema), 0);

  card[0] ^= 1;
  schema[0] ^= 1;
  assert.equal(Buffer.compare(readVerifiedFabCardSourceBytesForParser(verifiedCard.verification), readFileSync(cardPath)), 0);
  assert.equal(Buffer.compare(readVerifiedFabCardSourceBytesForParser(verifiedSchema.verification), readFileSync(schemaPath)), 0);

  retainedCard[0] ^= 1;
  retainedSchema[0] ^= 1;
  assert.equal(Buffer.compare(readVerifiedFabCardSourceBytesForParser(verifiedCard.verification), readFileSync(cardPath)), 0);
  assert.equal(Buffer.compare(readVerifiedFabCardSourceBytesForParser(verifiedSchema.verification), readFileSync(schemaPath)), 0);

  assert.throws(() => verifyFabEnglishCardBytes(card), FabCardSourceChecksumError);
  assert.throws(() => verifyFabCardSchemaBytes(schema), FabCardSourceChecksumError);
  assert.throws(() => verifyFabEnglishCardBytes(readFileSync(schemaPath)), (error) => error.artifact === "FAB_CARD_JSON");
  assert.throws(() => verifyFabCardSchemaBytes(readFileSync(cardPath)), (error) => error.artifact === "FAB_CARD_SCHEMA_JSON");

  for (const [verify, original] of [[verifyFabEnglishCardBytes, readFileSync(cardPath)], [verifyFabCardSchemaBytes, readFileSync(schemaPath)]]) {
    assert.throws(() => verify(original.subarray(0, original.length - 1)), FabCardSourceChecksumError);
    assert.throws(() => verify(Buffer.concat([original, Buffer.from([0])])), FabCardSourceChecksumError);
  }
});
