import assert from "node:assert/strict";
import test from "node:test";
import {
  discoverEvidenceTests,
  discoverPublicSourceEvidenceTests
} from "./evidence-discovery.mjs";

const syntheticFiles = [
  "package-boundary.test.mjs",
  "public-source-checksum-gate.public-source-evidence.test.mjs",
  "topic-about-public-source.test.mjs",
  "synthetic-contract.test.mjs"
];

test("private evidence discovery excludes only explicitly gated tests", () => {
  assert.deepEqual(discoverEvidenceTests(syntheticFiles), [
    "package-boundary.test.mjs",
    "topic-about-public-source.test.mjs",
    "synthetic-contract.test.mjs"
  ]);
});

test("public evidence discovery selects only explicitly gated tests", () => {
  assert.deepEqual(discoverPublicSourceEvidenceTests(syntheticFiles), [
    "public-source-checksum-gate.public-source-evidence.test.mjs"
  ]);
});
