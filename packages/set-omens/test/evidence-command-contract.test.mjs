import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const command = new URL("./evidence-command.mjs", import.meta.url).pathname;
const evidencePath = process.env.OMENS_RECIPE_EVIDENCE_PATH;
const packageDirectory = fileURLToPath(new URL("..", import.meta.url));

const run = (env) => spawnSync(process.execPath, [command], {
  env,
  cwd: packageDirectory,
  encoding: "utf8"
});

test("evidence command rejects an unset variable without private details", () => {
  const result = run({ ...process.env, OMENS_RECIPE_EVIDENCE_PATH: "" });
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /OMENS_RECIPE_EVIDENCE_PATH is required/);
});

test("operator evidence invocation reports only a successful private pass", {
  skip: evidencePath === undefined ? "private acceptance contract did not run; set OMENS_RECIPE_EVIDENCE_PATH or use npm run test:evidence" : false
}, () => {
  const result = run({ ...process.env });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "private evidence acceptance passed\n");
  assert.equal(result.stderr, "");
  assert.doesNotMatch(result.stdout, /https?:|\[Settings\]|CustomCards|recipe|\\|\//i);
});
