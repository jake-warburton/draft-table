import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";

const variables = ["FAB_CARD_SOURCE_EVIDENCE_PATH", "FAB_CARD_SCHEMA_EVIDENCE_PATH", "FAB_CARD_VAULT_EVIDENCE_PATH"];
const contract = "checksum-verified public card and Card Vault evidence establish an exact Omens display projection";
const marker = "CARD_PRESENTATION_CONTRACT_EXECUTED";
const fail = () => { console.error("Card presentation acceptance failed."); process.exit(1); };
if (process.argv.length !== 2 || !variables.every((variable) => Boolean(process.env[variable]))) fail();
try { for (const variable of variables) readFileSync(process.env[variable]); } catch { fail(); }
const files = readdirSync("test").filter((file) => file.endsWith(".card-presentation-evidence.test.mjs"));
if (files.length !== 1) fail();
const sanitized = () => { const environment = { ...process.env }; for (const variable of variables) delete environment[variable]; delete environment.NODE_TEST_CONTEXT; return environment; };
const probe = spawnSync(process.execPath, ["--experimental-strip-types", "--test", `test/${files[0]}`], { encoding: "utf8", env: sanitized() });
if (probe.error || probe.status !== 0 || !/^# skipped 1$/m.test(probe.stdout) || probe.stdout.includes(marker)) fail();
const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", `test/${files[0]}`], { encoding: "utf8", env: { ...process.env, NODE_TEST_CONTEXT: undefined } });
const lines = result.stdout.split(/\r?\n/);
if (result.error || result.status !== 0 || lines.filter((line) => line === `# ${marker}`).length !== 1 || lines.filter((line) => /^ok \d+ - /.test(line) && line.endsWith(contract)).length !== 1 || !/^# pass 1$/m.test(result.stdout) || !/^# skipped 0$/m.test(result.stdout)) fail();
console.log("card presentation acceptance passed");
