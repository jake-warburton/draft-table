import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";

const evidencePath = process.env.OMENS_RECIPE_EVIDENCE_PATH;

if (!evidencePath) {
  console.error("OMENS_RECIPE_EVIDENCE_PATH is required for private evidence acceptance.");
  process.exit(1);
}

try {
  readFileSync(evidencePath);
} catch {
  console.error("OMENS_RECIPE_EVIDENCE_PATH does not identify readable private evidence.");
  process.exit(1);
}

const testFiles = readdirSync("test")
  .filter((file) => file.endsWith(".test.mjs"))
  .filter((file) => !file.endsWith(".public-source.test.mjs"))
  // The contract spawns this runner; including it would recurse.
  .filter((file) => file !== "evidence-command-contract.test.mjs")
  .map((file) => `test/${file}`);

const childEnvironment = { ...process.env };
// An inherited node:test context prevents a nested test run from executing.
delete childEnvironment.NODE_TEST_CONTEXT;

const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", ...testFiles], {
  encoding: "utf8",
  env: childEnvironment,
  stdio: ["ignore", "pipe", "pipe"]
});
const skippedLine = result.stdout.match(/^# skipped (\d+)$/m);
const skipped = skippedLine === null ? null : Number(skippedLine[1]);

if (result.status !== 0 || skipped === null || skipped !== 0) {
  console.error("private evidence acceptance did not run all contracts.");
  process.exit(1);
}

console.log("private evidence acceptance passed");
