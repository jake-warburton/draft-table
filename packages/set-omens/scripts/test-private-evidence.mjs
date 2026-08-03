import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

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

const testDirectory = new URL("../test/", import.meta.url);
const testFiles = readdirSync(testDirectory)
  .filter((file) => file.endsWith(".test.mjs"))
  .filter((file) => /skip\s*:\s*!privateEvidencePath/.test(readFileSync(new URL(file, testDirectory), "utf8")))
  .map((file) => join(testDirectory.pathname, file));

const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", ...testFiles], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"]
});
const output = `${result.stdout}\n${result.stderr}`;
const skipped = [...output.matchAll(/# skipped (\d+)/g)].reduce((total, match) => total + Number(match[1]), 0);

if (result.status !== 0 || skipped > 0) {
  console.error(skipped > 0
    ? "private evidence acceptance did not run all evidence contracts."
    : "private evidence acceptance failed.");
  process.exit(1);
}

console.log("private evidence acceptance passed");
