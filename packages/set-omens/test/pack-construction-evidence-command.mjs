import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";

const variables = ["OMENS_RECIPE_EVIDENCE_PATH", "FAB_CARD_SOURCE_EVIDENCE_PATH", "FAB_CARD_SCHEMA_EVIDENCE_PATH", "FAB_CARD_VAULT_EVIDENCE_PATH"];
const contractName = "four checksum-verified caller-held sources guard pool overlap before constructing complete Omens packs";
const marker = "COMPLETE_OMENS_PACK_CONSTRUCTION_CONTRACT_EXECUTED";
const fail = () => { console.error("Complete Omens pack construction acceptance failed."); process.exit(1); };
const exactPattern = (name) => `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
if (process.argv.length !== 2 || !variables.every((variable) => Boolean(process.env[variable]))) fail();
const evidence = new Map();
try {
  for (const variable of variables) {
    readFileSync(process.env[variable]);
    evidence.set(variable, process.env[variable]);
  }
} catch { fail(); }
const files = readdirSync("test").filter((file) => file.endsWith(".pack-construction-evidence.test.mjs")).map((file) => `test/${file}`);
if (files.length !== 1) fail();
const sanitized = () => {
  const environment = { ...process.env };
  for (const variable of variables) delete environment[variable];
  delete environment.NODE_TEST_CONTEXT;
  return environment;
};
const probe = spawnSync(process.execPath, ["--experimental-strip-types", "--test", ...files], { encoding: "utf8", env: sanitized(), stdio: ["ignore", "pipe", "pipe"] });
if (probe.error || probe.status !== 0 || probe.stderr !== "" || !/^# skipped 1$/mu.test(probe.stdout) || probe.stdout.includes(marker)) fail();
const childEnvironment = sanitized();
for (const variable of variables) childEnvironment[variable] = evidence.get(variable);
const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--test-name-pattern", exactPattern(contractName), ...files], { encoding: "utf8", env: childEnvironment, stdio: ["ignore", "pipe", "pipe"] });
const lines = result.stdout.split(/\r?\n/u);
const exactMarker = lines.filter((line) => line === `# ${marker}`).length === 1;
const exactContract = lines.filter((line) => /^ok \d+ - /u.test(line) && line.replace(/^ok \d+ - /u, "") === contractName).length === 1;
const summaries = /^# tests 1$/mu.test(result.stdout) && /^# pass 1$/mu.test(result.stdout) && /^# fail 0$/mu.test(result.stdout) && /^# skipped 0$/mu.test(result.stdout);
if (result.error || result.status !== 0 || result.stderr !== "" || !exactMarker || !exactContract || !summaries) fail();
console.log("complete Omens pack construction acceptance passed");
