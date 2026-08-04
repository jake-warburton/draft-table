import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { discoverRecipeRarityEvidenceTests } from "./evidence-discovery.mjs";

const variables = ["OMENS_RECIPE_EVIDENCE_PATH", "FAB_CARD_SOURCE_EVIDENCE_PATH", "FAB_CARD_SCHEMA_EVIDENCE_PATH", "FAB_CARD_VAULT_EVIDENCE_PATH"];
const contractName = "four checksum-verified caller-held sources establish the accepted recipe rarity correspondence";
const marker = "RECIPE_RARITY_CORRESPONDENCE_CONTRACT_EXECUTED";
const fail = () => { console.error("Recipe rarity correspondence acceptance failed."); process.exit(1); };
if (process.argv.length !== 2 || !variables.every((variable) => Boolean(process.env[variable]))) fail();
const evidence = new Map();
try { for (const variable of variables) { readFileSync(process.env[variable]); evidence.set(variable, process.env[variable]); } } catch { fail(); }
const files = discoverRecipeRarityEvidenceTests(readdirSync("test")).map((file) => `test/${file}`);
if (files.length !== 1) fail();

const sanitized = () => { const environment = { ...process.env }; for (const variable of variables) delete environment[variable]; delete environment.NODE_TEST_CONTEXT; return environment; };
const probe = spawnSync(process.execPath, ["--experimental-strip-types", "--test", ...files], { encoding: "utf8", env: sanitized(), stdio: ["ignore", "pipe", "pipe"] });
if (probe.error || probe.status !== 0 || !/^# skipped 1$/m.test(probe.stdout) || probe.stdout.includes(marker)) fail();
const childEnvironment = sanitized(); for (const variable of variables) childEnvironment[variable] = evidence.get(variable);
const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", ...files], { encoding: "utf8", env: childEnvironment, stdio: ["ignore", "pipe", "pipe"] });
const lines = result.stdout.split(/\r?\n/);
const exactMarker = lines.filter((line) => line === `# ${marker}`).length === 1;
const exactContract = lines.filter((line) => /^ok \d+ - /.test(line) && line.endsWith(contractName)).length === 1;
const summaries = /^# tests 1$/m.test(result.stdout) && /^# pass 1$/m.test(result.stdout) && /^# fail 0$/m.test(result.stdout) && /^# skipped 0$/m.test(result.stdout);
if (result.error || result.status !== 0 || !exactMarker || !exactContract || !summaries) fail();
console.log("recipe rarity correspondence acceptance passed");
