import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { discoverRecipeIdentityEvidenceTests } from "./evidence-discovery.mjs";

const variables = [
  "OMENS_RECIPE_EVIDENCE_PATH",
  "FAB_CARD_SOURCE_EVIDENCE_PATH",
  "FAB_CARD_SCHEMA_EVIDENCE_PATH",
  "FAB_CARD_VAULT_EVIDENCE_PATH"
];
const contractName = "four checksum-verified caller-held sources establish the accepted recipe identity partition";
const marker = "RECIPE_IDENTITY_RECONCILIATION_CONTRACT_EXECUTED";
const fail = () => {
  console.error("Recipe identity reconciliation acceptance failed.");
  process.exit(1);
};

if (process.argv.length !== 2) fail();
if (!variables.every((variable) => Boolean(process.env[variable]))) fail();
try {
  for (const variable of variables) readFileSync(process.env[variable]);
} catch {
  fail();
}

const files = discoverRecipeIdentityEvidenceTests(readdirSync("test")).map((file) => `test/${file}`);
if (files.length !== 1) fail();

const probeEnvironment = { ...process.env };
for (const variable of variables) delete probeEnvironment[variable];
delete probeEnvironment.NODE_TEST_CONTEXT;
const probe = spawnSync(process.execPath, ["--experimental-strip-types", "--test", ...files], {
  encoding: "utf8",
  env: probeEnvironment,
  stdio: ["ignore", "pipe", "pipe"]
});
if (probe.error || probe.status !== 0 || !/^# skipped 1$/m.test(probe.stdout) || probe.stdout.includes(marker)) fail();

const childEnvironment = { ...process.env };
delete childEnvironment.NODE_TEST_CONTEXT;
const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", ...files], {
  encoding: "utf8",
  env: childEnvironment,
  stdio: ["ignore", "pipe", "pipe"]
});
const lines = result.stdout.split(/\r?\n/);
const exactMarker = lines.filter((line) => line === `# ${marker}`).length === 1;
const exactContract = lines.filter((line) => /^ok \d+ - /.test(line) && line.endsWith(contractName)).length === 1;
const summaries = /^# tests 1$/m.test(result.stdout) && /^# pass 1$/m.test(result.stdout) && /^# fail 0$/m.test(result.stdout) && /^# skipped 0$/m.test(result.stdout);
if (result.error || result.status !== 0 || !exactMarker || !exactContract || !summaries) fail();

console.log("recipe identity reconciliation acceptance passed");
