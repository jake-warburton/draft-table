import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { discoverPackLocalPoolSampleSelectionEvidenceTests } from "./evidence-discovery.mjs";
import { exactTestNamePattern } from "./recipe-layout-pool-resolution-test-name.mjs";

const variables = ["OMENS_RECIPE_EVIDENCE_PATH", "FAB_CARD_SOURCE_EVIDENCE_PATH", "FAB_CARD_SCHEMA_EVIDENCE_PATH", "FAB_CARD_VAULT_EVIDENCE_PATH"];
const contractName = "four checksum-verified caller-held sources compose one uint32 sample with every current pack-local identity-pool state";
const marker = "PACK_LOCAL_POOL_SAMPLE_SELECTION_CONTRACT_EXECUTED";
const fail = () => { console.error("Pack local pool sample selection acceptance failed."); process.exit(1); };
if (process.argv.length !== 2 || !variables.every((variable) => Boolean(process.env[variable]))) fail();
const evidence = new Map();
try { for (const variable of variables) { readFileSync(process.env[variable]); evidence.set(variable, process.env[variable]); } } catch { fail(); }
const files = discoverPackLocalPoolSampleSelectionEvidenceTests(readdirSync("test")).map((file) => `test/${file}`);
if (files.length !== 1) fail();
const sanitized = () => { const environment = { ...process.env }; for (const variable of variables) delete environment[variable]; delete environment.NODE_TEST_CONTEXT; return environment; };
const testArguments = ["--experimental-strip-types", "--test", "--test-name-pattern", exactTestNamePattern(contractName), ...files];
const probe = spawnSync(process.execPath, ["--experimental-strip-types", "--test", ...files], { encoding: "utf8", env: sanitized(), stdio: ["ignore", "pipe", "pipe"] });
if (probe.error || probe.status !== 0 || probe.stderr !== "" || !/^# skipped 1$/mu.test(probe.stdout) || probe.stdout.includes(marker)) fail();
const childEnvironment = sanitized(); for (const variable of variables) childEnvironment[variable] = evidence.get(variable);
const result = spawnSync(process.execPath, testArguments, { encoding: "utf8", env: childEnvironment, stdio: ["ignore", "pipe", "pipe"] });
const lines = result.stdout.split(/\r?\n/u);
const exactMarker = lines.filter((line) => line === `# ${marker}`).length === 1;
const exactContract = lines.filter((line) => /^ok \d+ - /u.test(line) && line.replace(/^ok \d+ - /u, "") === contractName).length === 1;
const summaries = /^# tests 1$/mu.test(result.stdout) && /^# pass 1$/mu.test(result.stdout) && /^# fail 0$/mu.test(result.stdout) && /^# skipped 0$/mu.test(result.stdout);
if (result.error || result.status !== 0 || result.stderr !== "" || !exactMarker || !exactContract || !summaries) fail();
console.log("pack local pool sample selection acceptance passed");
