import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const runner = fileURLToPath(new URL("./card-presentation-evidence-command.mjs", import.meta.url));
const variables = ["FAB_CARD_SOURCE_EVIDENCE_PATH", "FAB_CARD_SCHEMA_EVIDENCE_PATH", "FAB_CARD_VAULT_EVIDENCE_PATH"];
const contract = "checksum-verified public card and Card Vault evidence establish an exact Omens display projection";
const marker = "CARD_PRESENTATION_CONTRACT_EXECUTED";
const run = (source, options = {}) => {
  const directory = mkdtempSync(join(tmpdir(), "draft-table-card-presentation-command-")); const testDirectory = join(directory, "test"); mkdirSync(testDirectory);
  writeFileSync(join(testDirectory, "probe.card-presentation-evidence.test.mjs"), source);
  const env = { ...process.env, NODE_TEST_CONTEXT: "parent" };
  for (const variable of variables) { const path = join(directory, variable); writeFileSync(path, variable); env[variable] = path; }
  if (options.missing) delete env[options.missing];
  try { return spawnSync(process.execPath, [runner, ...(options.args ?? [])], { cwd: directory, encoding: "utf8", env }); } finally { rmSync(directory, { recursive: true, force: true }); }
};
const passing = `import test from "node:test"; test(${JSON.stringify(contract)}, {skip: !process.env.FAB_CARD_SOURCE_EVIDENCE_PATH}, () => console.log(${JSON.stringify(marker)}));`;
const rejected = (result) => { assert.notEqual(result.status, 0); assert.equal(result.stdout, ""); assert.equal(result.stderr, "Card presentation acceptance failed.\n"); };
test("card presentation evidence command requires exact caller-held evidence and exact executed contract", () => {
  for (const variable of variables) rejected(run(passing, { missing: variable }));
  rejected(run(passing, { args: ["unexpected"] }));
  rejected(run(passing.replace(marker, "WRONG"))); rejected(run(`import test from "node:test"; test(${JSON.stringify(contract)}, {skip:true},()=>{});`));
  const result = run(passing); assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout, "card presentation acceptance passed\n");
});
