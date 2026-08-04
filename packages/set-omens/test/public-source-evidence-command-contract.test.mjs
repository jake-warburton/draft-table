import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageDirectory = fileURLToPath(new URL("..", import.meta.url));
const runner = fileURLToPath(new URL("./public-source-evidence-command.mjs", import.meta.url));
const variables = [
  "FAB_CARD_SOURCE_EVIDENCE_PATH",
  "FAB_CARD_SCHEMA_EVIDENCE_PATH",
  "FAB_CARD_VAULT_EVIDENCE_PATH"
];

const run = (missing) => {
  const directory = mkdtempSync(join(packageDirectory, ".public-evidence-command-"));
  const testDirectory = join(directory, "test");
  mkdirSync(testDirectory);
  const environment = { ...process.env };
  for (const variable of variables) {
    const path = join(directory, variable);
    writeFileSync(path, "synthetic evidence");
    environment[variable] = path;
  }
  delete environment[missing];
  writeFileSync(join(testDirectory, "probe.public-source-evidence.test.mjs"), `
import test from "node:test";
test("probe", { skip: !(${variables.map((variable) => `process.env.${variable}`).join(" && ")}) ? "missing evidence" : false }, () => {});
`);
  try {
    return spawnSync(process.execPath, [runner], { cwd: directory, encoding: "utf8", env: environment });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

test("public evidence command requires all three caller-held evidence paths", () => {
  for (const missing of variables) {
    const result = run(missing);
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "FAB_CARD_SOURCE_EVIDENCE_PATH, FAB_CARD_SCHEMA_EVIDENCE_PATH, and FAB_CARD_VAULT_EVIDENCE_PATH are required for public source acceptance.\n");
  }
});

test("public evidence command preserves its exact successful output", () => {
  const result = run(undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "public card source acceptance passed\n");
  assert.equal(result.stderr, "");
});
