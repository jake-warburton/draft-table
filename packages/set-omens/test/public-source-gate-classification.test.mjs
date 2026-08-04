import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { classifyPublicSourceEvidenceTests } from "./public-source-gate-classification.mjs";

const ordinary = `import test from "node:test"; test("ordinary", () => {});`;
const gated = `import test from "node:test"; test("needs evidence", { skip: !process.env.FAB_CARD_SOURCE_EVIDENCE_PATH ? "missing evidence" : false }, () => {});`;

const withSandbox = (files, callback) => {
  const directory = mkdtempSync(join(process.cwd(), ".gate-classifier-"));
  mkdirSync(directory, { recursive: true });
  for (const [name, source] of Object.entries(files)) writeFileSync(join(directory, name), source);
  try { return callback(directory); } finally { rmSync(directory, { recursive: true, force: true }); }
};

test("gate classifier rejects a falsely suffixed ordinary test and accepts a genuinely gated test", () => {
  const falseGate = withSandbox({ "false.public-source-evidence.test.mjs": ordinary }, classifyPublicSourceEvidenceTests);
  assert.deepEqual(falseGate, { ok: false, diagnostic: "gated file reported zero skipped tests: false.public-source-evidence.test.mjs" });

  const genuineGate = withSandbox({ "genuine.public-source-evidence.test.mjs": gated }, classifyPublicSourceEvidenceTests);
  assert.deepEqual(genuineGate, { ok: true });
});
