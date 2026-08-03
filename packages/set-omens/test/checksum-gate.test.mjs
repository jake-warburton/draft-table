import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  OMENS_RECIPE,
  OmensRecipeChecksumError,
  verifyOmensRecipeBytes
} from "../src/index.ts";
import {
  readVerifiedOmensBytesForParser,
  verifyOmensBytesAgainstDigest
} from "../src/checksum.ts";

const digestOf = (bytes) => createHash("sha256").update(bytes).digest("hex");
const privateEvidencePath = process.env.OMENS_RECIPE_EVIDENCE_PATH;

test("the checksum boundary verifies and rejects synthetic bytes", () => {
  const bytes = new Uint8Array([0, 1, 2, 3]);

  assert.equal(verifyOmensBytesAgainstDigest(bytes, digestOf(bytes)), undefined);
  assert.throws(
    () => verifyOmensBytesAgainstDigest(bytes, digestOf(new Uint8Array([0, 1, 2, 4]))),
    OmensRecipeChecksumError
  );
});

test("synthetic verification cannot make arbitrary bytes parser-trusted", () => {
  const source = Buffer.from([4, 5, 6]);
  const result = verifyOmensBytesAgainstDigest(source, digestOf(source));

  source[0] = 99;

  assert.equal(result, undefined);
  assert.throws(() => readVerifiedOmensBytesForParser(result), TypeError);
  assert.throws(() => readVerifiedOmensBytesForParser(Object.freeze({})), TypeError);
});

test("optional accepted evidence remains verified after its source Buffer changes", {
  skip: privateEvidencePath === undefined
}, () => {
  const sourceBytes = readFileSync(privateEvidencePath);
  const verified = verifyOmensRecipeBytes(sourceBytes);
  const trustedBeforeMutation = readVerifiedOmensBytesForParser(verified.verification);

  sourceBytes[0] ^= 1;

  const trustedAfterMutation = readVerifiedOmensBytesForParser(verified.verification);
  assert.equal(digestOf(trustedBeforeMutation), OMENS_RECIPE.sha256);
  assert.equal(digestOf(trustedAfterMutation), OMENS_RECIPE.sha256);
  assert.notStrictEqual(trustedBeforeMutation, trustedAfterMutation);
});

test("the pinned Omens descriptor is immutable and identifies only the approved recipe", () => {
  assert.deepEqual(OMENS_RECIPE, {
    id: "rantaways-omn-draft-3.8-fixed-layout-probabilities",
    filename: "OMN_Draft_3.8 - Fixed New Layout Probabilities.txt",
    sha256: "97a964c8c5b6a962404398ca2b57c9ceeeb2dfb714512e61ff22e07ea1ec2328",
    provenance: "community-not-official",
    visibleCardScope: 14
  });
  assert.ok(Object.isFrozen(OMENS_RECIPE));
  assert.throws(() => {
    OMENS_RECIPE.id = "changed";
  }, TypeError);
});

test("Omens verification does not decode or parse unverified bytes", () => {
  const bytes = new Uint8Array([10, 11, 12]);
  const source = ["checksum.ts"]
    .map((filename) => readFileSync(new URL(`../src/${filename}`, import.meta.url), "utf8"))
    .join("\n");

  assert.doesNotMatch(source, /TextDecoder|\.toString\s*\(|JSON\.parse|parse[A-Z_a-z]*\s*\(/);
  assert.throws(
    () => verifyOmensRecipeBytes(bytes),
    (error) => error instanceof OmensRecipeChecksumError
  );
});

test("Omens verification rejects a checksum mismatch with a stable safe error", () => {
  const sourceBytes = new Uint8Array([99, 98, 97]);

  assert.throws(
    () => verifyOmensRecipeBytes(sourceBytes),
    (error) => {
      assert.ok(error instanceof OmensRecipeChecksumError);
      assert.equal(error.code, "OMENS_RECIPE_CHECKSUM_MISMATCH");
      assert.equal(error.message, "Omens recipe checksum mismatch.");
      assert.equal(error.stack, "OmensRecipeChecksumError: Omens recipe checksum mismatch.");
      assert.doesNotMatch(JSON.stringify(error), /99|98|97|\/|\\/);
      return true;
    }
  );
});
