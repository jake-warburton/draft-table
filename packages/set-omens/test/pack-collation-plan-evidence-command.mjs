import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { discoverPackCollationPlanEvidenceTests } from "./evidence-discovery.mjs";
import { exactTestNamePattern } from "./recipe-layout-pool-resolution-test-name.mjs";

const variables = ["OMENS_RECIPE_EVIDENCE_PATH", "FAB_CARD_SOURCE_EVIDENCE_PATH", "FAB_CARD_SCHEMA_EVIDENCE_PATH", "FAB_CARD_VAULT_EVIDENCE_PATH"];
const contractName = "four checksum-verified caller-held sources initialize every selected Omens collation layout with a fresh exact all-pool plan";
const marker = "PACK_COLLATION_PLAN_INITIALIZATION_CONTRACT_EXECUTED";
const fail = () => { console.error("Pack collation plan initialization acceptance failed."); process.exit(1); };
if (process.argv.length !== 2 || !variables.every((variable) => Boolean(process.env[variable]))) fail();
const evidence = new Map();
try { for (const variable of variables) { readFileSync(process.env[variable]); evidence.set(variable, process.env[variable]); } } catch { fail(); }
const files = discoverPackCollationPlanEvidenceTests(readdirSync("test")).map((file) => `test/${file}`);
if (files.length !== 1) fail();
const sanitized = () => { const environment = { ...process.env }; for (const variable of variables) delete environment[variable]; delete environment.NODE_TEST_CONTEXT; return environment; };
const probe = spawnSync(process.execPath, ["--experimental-strip-types", "--test", ...files], { encoding: "utf8", env: sanitized(), stdio: ["ignore", "pipe", "pipe"] });
if (probe.error || probe.status !== 0 || probe.stderr !== "" || !/^# skipped 1$/mu.test(probe.stdout) || probe.stdout.includes(marker)) fail();
const childEnvironment = sanitized(); for (const variable of variables) childEnvironment[variable] = evidence.get(variable);
const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--test-name-pattern", exactTestNamePattern(contractName), ...files], { encoding: "utf8", env: childEnvironment, stdio: ["ignore", "pipe", "pipe"] }), lines = result.stdout.split(/\r?\n/u);
const exactMarker = lines.filter((line) => line === `# ${marker}`).length === 1, exactContract = lines.filter((line) => /^ok \d+ - /u.test(line) && line.replace(/^ok \d+ - /u, "") === contractName).length === 1, summaries = /^# tests 1$/mu.test(result.stdout) && /^# pass 1$/mu.test(result.stdout) && /^# fail 0$/mu.test(result.stdout) && /^# skipped 0$/mu.test(result.stdout);
if (result.error || result.status !== 0 || result.stderr !== "" || !exactMarker || !exactContract || !summaries) fail();
console.log("pack collation plan initialization acceptance passed");
