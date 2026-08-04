import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const runner = fileURLToPath(new URL("./recipe-identity-evidence-command.mjs", import.meta.url));
const variables = [
  "OMENS_RECIPE_EVIDENCE_PATH",
  "FAB_CARD_SOURCE_EVIDENCE_PATH",
  "FAB_CARD_SCHEMA_EVIDENCE_PATH",
  "FAB_CARD_VAULT_EVIDENCE_PATH"
];
const contractName = "four checksum-verified caller-held sources establish the accepted recipe identity partition";
const marker = "RECIPE_IDENTITY_RECONCILIATION_CONTRACT_EXECUTED";
const passing = `
import test from "node:test";
const available=${JSON.stringify(variables)}.every((variable)=>Boolean(process.env[variable]));
test(${JSON.stringify(contractName)}, { skip: !available ? "missing" : false }, () => console.log(${JSON.stringify(marker)}));
`;

const run = (contract = passing, options = {}) => {
  const directory = mkdtempSync(join(tmpdir(), "draft-table-recipe-identity-command-"));
  const testDirectory = join(directory, "test"); mkdirSync(testDirectory);
  writeFileSync(join(testDirectory, "probe.recipe-identity-evidence.test.mjs"), contract);
  const environment = { ...process.env, NODE_TEST_CONTEXT: "synthetic-parent-context" };
  for (const [index, variable] of variables.entries()) {
    const path = join(directory, variable); writeFileSync(path, `synthetic command-contract bytes ${index}`); environment[variable] = path;
  }
  if (options.missing) delete environment[options.missing];
  if (options.wrong) environment[options.wrong] = join(directory, "unreadable");
  if (options.swap) [environment[variables[0]], environment[variables[1]]] = [environment[variables[1]], environment[variables[0]]];
  try {
    return spawnSync(process.execPath, [runner, ...(options.args ?? [])], { cwd: directory, encoding: "utf8", env: environment });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};
const rejected = (result) => {
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "Recipe identity reconciliation acceptance failed.\n");
};

test("four-source command rejects every absent or unreadable evidence variable safely", () => {
  for (const variable of variables) {
    rejected(run(passing, { missing: variable }));
    rejected(run(passing, { wrong: variable }));
  }
});

test("four-source command rejects readable evidence variables whose synthetic checksums are swapped", () => {
  const checksumContract = `
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
const variables=${JSON.stringify(variables)};
const available=variables.every((variable)=>Boolean(process.env[variable]));
const expected=${JSON.stringify(variables.map((_, index) => `synthetic command-contract bytes ${index}`))};
test(${JSON.stringify(contractName)}, { skip: !available ? "missing" : false }, () => {
  for (const [index, variable] of variables.entries()) assert.equal(createHash("sha256").update(readFileSync(process.env[variable])).digest("hex"), createHash("sha256").update(expected[index]).digest("hex"));
  console.log(${JSON.stringify(marker)});
});`;
  rejected(run(checksumContract, { swap: true }));
});

test("four-source command rejects usage errors and arbitrary nonzero contract exits", () => {
  rejected(run(passing, { args: ["unexpected"] }));
  rejected(run(`
import test from "node:test";
const available=${JSON.stringify(variables)}.every((variable)=>Boolean(process.env[variable]));
test(${JSON.stringify(contractName)}, { skip: !available ? "missing" : false }, () => { console.log(${JSON.stringify(marker)}); process.exitCode=17; });
`));
});

test("four-source command rejects skipped, nonexecuted, wrong-marker, and unrelated failing contracts", () => {
  rejected(run(`import test from "node:test"; test(${JSON.stringify(contractName)}, { skip: true }, () => {});`));
  rejected(run(`import test from "node:test"; test("wrong contract", () => console.log(${JSON.stringify(marker)}));`));
  rejected(run(passing.replace(marker, "WRONG_RECONCILIATION_MARKER")));
  rejected(run(`${passing}\ntest("unrelated failure", () => { throw new Error("unrelated"); });`));
});

test("four-source command sanitizes probing context and prints only its exact success marker", () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "recipe identity reconciliation acceptance passed\n");
  assert.equal(result.stderr, "");
});
