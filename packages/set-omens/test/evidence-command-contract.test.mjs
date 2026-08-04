import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageDirectory = fileURLToPath(new URL("..", import.meta.url));
const runner = fileURLToPath(new URL("./evidence-command.mjs", import.meta.url));
const passingContract = 'import test from "node:test"; test("probe", () => {});';

const run = (env, contract = passingContract, withEvidence = false) => {
  const fixtureDirectory = mkdtempSync(join(packageDirectory, ".evidence-command-"));
  const testDirectory = join(fixtureDirectory, "test");
  const evidencePath = join(fixtureDirectory, "evidence");
  mkdirSync(testDirectory);
  writeFileSync(join(testDirectory, "probe.test.mjs"), contract);
  writeFileSync(join(testDirectory, "gate.public-source-evidence.test.mjs"),
    'import test from "node:test"; test("gate probe", { skip: !process.env.FAB_CARD_SOURCE_EVIDENCE_PATH ? "missing evidence" : false }, () => {});');
  writeFileSync(evidencePath, "synthetic evidence");

  try {
    return spawnSync(process.execPath, [runner], {
      env: withEvidence
        ? { ...env, OMENS_RECIPE_EVIDENCE_PATH: evidencePath }
        : env,
      cwd: fixtureDirectory,
      encoding: "utf8"
    });
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
};

test("evidence command rejects an unset or empty variable without private details", () => {
  for (const value of [undefined, ""]) {
    const env = { ...process.env, OMENS_RECIPE_EVIDENCE_PATH: value };
    if (value === undefined) delete env.OMENS_RECIPE_EVIDENCE_PATH;

    const result = run(env);
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /OMENS_RECIPE_EVIDENCE_PATH is required/);
  }
});

test("evidence runner rejects a discovered skipped contract", () => {
  const result = run(
    { ...process.env },
    'import test from "node:test"; test("probe", { skip: "probe" }, () => {});',
    true
  );
  assert.notEqual(result.status, 0);
});

test("operator evidence invocation succeeds with an inherited node:test context", () => {
  const result = run({ ...process.env, NODE_TEST_CONTEXT: "child-v8" }, passingContract, true);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "private evidence acceptance passed\n");
  assert.equal(result.stderr, "");
  assert.doesNotMatch(result.stdout, /https?:|\[Settings\]|CustomCards|recipe|\\|\//i);
});
