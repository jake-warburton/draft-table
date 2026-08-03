import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  OMENS_RECIPE,
  OmensRecipeChecksumError,
  verifyOmensRecipeBytes
} from "../src/index.ts";
import { verifyOmensBytesAgainstDigest } from "../src/checksum.ts";

const digestOf = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("the checksum boundary verifies and rejects synthetic bytes", () => {
  const bytes = new Uint8Array([0, 1, 2, 3]);
  const verified = verifyOmensBytesAgainstDigest(bytes, digestOf(bytes));

  assert.deepEqual(verified, { bytes });
  assert.ok(Object.isFrozen(verified));
  assert.notEqual(verified.bytes, bytes);
  assert.throws(
    () => verifyOmensBytesAgainstDigest(bytes, digestOf(new Uint8Array([0, 1, 2, 4]))),
    OmensRecipeChecksumError
  );
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
  const source = ["index.ts", "checksum.ts"]
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
