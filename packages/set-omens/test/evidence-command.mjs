import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

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

const result = spawnSync(process.execPath, [
  "--experimental-strip-types",
  "--test",
  "test/checksum-gate.test.mjs",
  "test/settings-parser.test.mjs"
], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

if (result.status !== 0) {
  console.error("private evidence acceptance failed.");
  process.exit(1);
}

console.log("private evidence acceptance passed");
