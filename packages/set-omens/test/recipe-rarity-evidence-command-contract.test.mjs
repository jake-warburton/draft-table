import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const runner = fileURLToPath(new URL("./recipe-rarity-evidence-command.mjs", import.meta.url));
const variables = ["OMENS_RECIPE_EVIDENCE_PATH", "FAB_CARD_SOURCE_EVIDENCE_PATH", "FAB_CARD_SCHEMA_EVIDENCE_PATH", "FAB_CARD_VAULT_EVIDENCE_PATH"];
const contractName = "four checksum-verified caller-held sources establish the accepted recipe rarity correspondence";
const marker = "RECIPE_RARITY_CORRESPONDENCE_CONTRACT_EXECUTED";
const bytes = variables.map((_, index) => `synthetic rarity command bytes ${index}`);
const passing = `
import assert from "node:assert/strict"; import {createHash} from "node:crypto"; import {readFileSync} from "node:fs"; import test from "node:test";
const variables=${JSON.stringify(variables)}, expected=${JSON.stringify(bytes)}, available=variables.every(v=>Boolean(process.env[v]));
test(${JSON.stringify(contractName)}, {skip:!available?"missing":false}, ()=>{assert.equal(process.env.NODE_TEST_CONTEXT.startsWith("child-v"),true);for(const [i,v] of variables.entries())assert.equal(createHash("sha256").update(readFileSync(process.env[v])).digest("hex"),createHash("sha256").update(expected[i]).digest("hex"));console.log(${JSON.stringify(marker)});});
`;
const run = (contract = passing, options = {}) => {
  const directory = mkdtempSync(join(tmpdir(), "draft-table-recipe-rarity-command-")); const testDirectory = join(directory, "test"); mkdirSync(testDirectory);
  writeFileSync(join(testDirectory, "probe.recipe-rarity-evidence.test.mjs"), contract);
  const environment = { ...process.env, NODE_TEST_CONTEXT: "synthetic-parent-context" };
  for (const [index, variable] of variables.entries()) { const path = join(directory, variable); writeFileSync(path, bytes[index]); environment[variable] = path; }
  if (options.missing) delete environment[options.missing]; if (options.unreadable) environment[options.unreadable] = join(directory, "absent");
  if (options.swap) [environment[variables[0]], environment[variables[1]]] = [environment[variables[1]], environment[variables[0]]];
  try { return spawnSync(process.execPath, [runner, ...(options.args ?? [])], { cwd: directory, encoding: "utf8", env: environment }); }
  finally { rmSync(directory, { recursive: true, force: true }); }
};
const rejected = (result) => { assert.notEqual(result.status, 0); assert.equal(result.stdout, ""); assert.equal(result.stderr, "Recipe rarity correspondence acceptance failed.\n"); };

test("rarity command rejects every missing, unreadable, or checksum-wrong evidence variable", () => {
  for (const variable of variables) { rejected(run(passing, { missing: variable })); rejected(run(passing, { unreadable: variable })); }
  rejected(run(passing, { swap: true }));
});
test("rarity command rejects usage errors and arbitrary nonzero exits", () => { rejected(run(passing, { args: ["unexpected"] })); rejected(run(passing.replace(`console.log(${JSON.stringify(marker)});`, `console.log(${JSON.stringify(marker)});process.exitCode=23;`))); });
test("rarity command rejects skipped, nonexecuted, wrong-marker, unrelated-failure, and duplicate contracts", () => {
  rejected(run(`import test from "node:test";test(${JSON.stringify(contractName)},{skip:true},()=>{});`));
  rejected(run(`import test from "node:test";test("wrong contract",()=>console.log(${JSON.stringify(marker)}));`));
  rejected(run(passing.replace(marker, "WRONG_RARITY_MARKER")));
  rejected(run(`${passing}\ntest("unrelated failure",()=>{throw new Error("unrelated");});`));
  rejected(run(`${passing}\ntest(${JSON.stringify(contractName)},()=>console.log(${JSON.stringify(marker)}));`));
});
test("rarity command sanitizes inherited context and prints only its exact success marker", () => { const result = run(); assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout, "recipe rarity correspondence acceptance passed\n"); assert.equal(result.stderr, ""); });
