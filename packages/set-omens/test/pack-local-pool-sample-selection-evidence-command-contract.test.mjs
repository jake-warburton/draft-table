import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { exactTestNamePattern } from "./recipe-layout-pool-resolution-test-name.mjs";

const runner = fileURLToPath(new URL("./pack-local-pool-sample-selection-evidence-command.mjs", import.meta.url));
const variables = ["OMENS_RECIPE_EVIDENCE_PATH", "FAB_CARD_SOURCE_EVIDENCE_PATH", "FAB_CARD_SCHEMA_EVIDENCE_PATH", "FAB_CARD_VAULT_EVIDENCE_PATH"];
const contractName = "four checksum-verified caller-held sources compose one uint32 sample with every current pack-local identity-pool state";
const marker = "PACK_LOCAL_POOL_SAMPLE_SELECTION_CONTRACT_EXECUTED";
const bytes = variables.map((_, index) => `synthetic pack local pool sample selection command bytes ${index}`);
const passing = `
import assert from "node:assert/strict"; import { createHash } from "node:crypto"; import { readFileSync } from "node:fs"; import test from "node:test";
const variables=${JSON.stringify(variables)}, expected=${JSON.stringify(bytes)}, available=variables.every((variable)=>Boolean(process.env[variable]));
test(${JSON.stringify(contractName)}, { skip: !available ? "missing" : false }, () => { assert.equal(process.env.NODE_TEST_CONTEXT.startsWith("child-v"), true); for (const [index, variable] of variables.entries()) assert.equal(createHash("sha256").update(readFileSync(process.env[variable])).digest("hex"), createHash("sha256").update(expected[index]).digest("hex")); console.log(${JSON.stringify(marker)}); });
`;
const run = (contract = passing, options = {}) => {
  const directory = mkdtempSync(join(tmpdir(), "draft-table-pack-local-pool-sample-selection-command-")), testDirectory = join(directory, "test"); mkdirSync(testDirectory);
  writeFileSync(join(testDirectory, "probe.pack-local-pool-sample-selection-evidence.test.mjs"), contract);
  const environment = { ...process.env, NODE_TEST_CONTEXT: "synthetic-parent-context" };
  for (const [index, variable] of variables.entries()) { const path = join(directory, variable); writeFileSync(path, bytes[index]); environment[variable] = path; }
  if (options.missing) delete environment[options.missing]; if (options.unreadable) environment[options.unreadable] = join(directory, "missing");
  if (options.swap) [environment[variables[0]], environment[variables[1]]] = [environment[variables[1]], environment[variables[0]]];
  try { return spawnSync(process.execPath, [runner, ...(options.args ?? [])], { cwd: directory, encoding: "utf8", env: environment }); }
  finally { rmSync(directory, { recursive: true, force: true }); }
};
const rejected = (result) => { assert.notEqual(result.status, 0); assert.equal(result.stdout, ""); assert.equal(result.stderr, "Pack local pool sample selection acceptance failed.\n"); };

test("pack-local sample selection command rejects every missing unreadable or checksum-wrong evidence variable", () => {
  for (const variable of variables) { rejected(run(passing, { missing: variable })); rejected(run(passing, { unreadable: variable })); }
  rejected(run(passing, { swap: true }));
});
test("pack-local sample selection command rejects usage errors nonexecution arbitrary failure and duplicate execution", () => {
  rejected(run(passing, { args: ["unexpected"] })); rejected(run(`import test from "node:test"; test(${JSON.stringify(contractName)}, { skip: true }, () => {});`));
  rejected(run(passing.replace(contractName, `prefix ${contractName}`))); rejected(run(passing.replace(marker, "WRONG_PACK_LOCAL_POOL_SAMPLE_SELECTION_MARKER")));
  rejected(run(passing.replace(`console.log(${JSON.stringify(marker)});`, `console.log(${JSON.stringify(marker)}); process.exitCode = 29;`)));
  rejected(run(`${passing}\ntest("unrelated failure", () => { throw new Error("unrelated"); });`)); rejected(run(`${passing}\ntest(${JSON.stringify(contractName)}, () => console.log(${JSON.stringify(marker)}));`));
  rejected(run(passing.replace(`console.log(${JSON.stringify(marker)});`, `console.log(${JSON.stringify(marker)}); console.log(${JSON.stringify(marker)});`)));
});
test("pack-local sample selection exact targeting escapes regex metacharacters", () => {
  const directory = mkdtempSync(join(tmpdir(), "draft-table-pack-local-pool-sample-selection-pattern-")), fictionalName = "fictional [pack] (ticket)+ contract?", path = join(directory, "pattern.test.mjs");
  writeFileSync(path, `import test from "node:test"; test(${JSON.stringify(fictionalName)}, () => console.log("FICTIONAL_CONTRACT_EXECUTED")); test(${JSON.stringify(`prefix ${fictionalName}`)}, () => {});`);
  try { const environment = { ...process.env }; delete environment.NODE_TEST_CONTEXT; const result = spawnSync(process.execPath, ["--test", "--test-name-pattern", exactTestNamePattern(fictionalName), path], { encoding: "utf8", env: environment }); assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /^# FICTIONAL_CONTRACT_EXECUTED$/mu); assert.match(result.stdout, /^# tests 1$/mu); assert.match(result.stdout, /^# pass 1$/mu); assert.match(result.stdout, /^# skipped 0$/mu); assert.doesNotMatch(result.stdout, /^ok \d+ - prefix /mu); }
  finally { rmSync(directory, { recursive: true, force: true }); }
});
test("pack-local sample selection command sanitizes inherited context and prints only its exact success marker", () => {
  const result = run(); assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout, "pack local pool sample selection acceptance passed\n"); assert.equal(result.stderr, "");
});
