import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { discoverPublicSourceEvidenceTests } from "./evidence-discovery.mjs";

const cardPath = process.env.FAB_CARD_SOURCE_EVIDENCE_PATH;
const schemaPath = process.env.FAB_CARD_SCHEMA_EVIDENCE_PATH;
const cardVaultPath = process.env.FAB_CARD_VAULT_EVIDENCE_PATH;

if (!cardPath || !schemaPath || !cardVaultPath) {
  console.error("FAB_CARD_SOURCE_EVIDENCE_PATH, FAB_CARD_SCHEMA_EVIDENCE_PATH, and FAB_CARD_VAULT_EVIDENCE_PATH are required for public source acceptance.");
  process.exit(1);
}

try {
  readFileSync(cardPath);
  readFileSync(schemaPath);
  readFileSync(cardVaultPath);
} catch {
  console.error("Public source evidence paths must identify readable files.");
  process.exit(1);
}

const testFiles = discoverPublicSourceEvidenceTests(readdirSync("test"))
  .map((file) => `test/${file}`);

if (testFiles.length === 0) {
  console.error("Public source acceptance did not discover any contracts.");
  process.exit(1);
}

const childEnvironment = { ...process.env };
delete childEnvironment.NODE_TEST_CONTEXT;

const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", ...testFiles], {
  encoding: "utf8",
  env: childEnvironment,
  stdio: ["ignore", "pipe", "pipe"]
});
const skippedLine = result.stdout.match(/^# skipped (\d+)$/m);
const skipped = skippedLine === null ? null : Number(skippedLine[1]);

if (result.status !== 0 || skipped === null || skipped !== 0) {
  console.error("Public source acceptance did not run all contracts.");
  process.exit(1);
}

console.log("public card source acceptance passed");
