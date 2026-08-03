import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const evidencePath = process.env.OMENS_RECIPE_EVIDENCE_PATH;
const packageDirectory = fileURLToPath(new URL("..", import.meta.url));

const run = (env) => spawnSync("npm", [
  "--silent",
  "--workspace",
  "@draft-table/set-omens",
  "run",
  "test:evidence"
], {
  env,
  cwd: packageDirectory,
  encoding: "utf8"
});

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

test("operator evidence invocation reports only a successful private pass", {
  skip: !evidencePath ? "private acceptance contract did not run; set OMENS_RECIPE_EVIDENCE_PATH or use npm run test:evidence" : false
}, () => {
  const result = run({ ...process.env });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "private evidence acceptance passed\n");
  assert.equal(result.stderr, "");
  assert.doesNotMatch(result.stdout, /https?:|\[Settings\]|CustomCards|recipe|\\|\//i);
});
