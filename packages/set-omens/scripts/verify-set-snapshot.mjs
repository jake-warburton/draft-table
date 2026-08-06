import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Proves the committed snapshot is exactly what the four checksum-pinned evidence sources produce.
 *
 * CI cannot run this because it never holds the captain's recipe, so the committed file is
 * otherwise only structurally checked. This command closes that gap for anyone who does hold all
 * four sources: it regenerates into a temporary file and compares byte for byte.
 */

const variables = [
  "OMENS_RECIPE_EVIDENCE_PATH",
  "FAB_CARD_SOURCE_EVIDENCE_PATH",
  "FAB_CARD_SCHEMA_EVIDENCE_PATH",
  "FAB_CARD_VAULT_EVIDENCE_PATH"
];

const fail = (reason) => {
  console.error(`Set snapshot verification failed: ${reason}`);
  process.exit(1);
};

if (process.argv.length !== 2) fail("this command takes no arguments");
const missing = variables.filter((variable) => !process.env[variable]);
if (missing.length > 0) fail(`missing evidence path variables: ${missing.join(", ")}`);

const committedPath = fileURLToPath(new URL("../src/set-snapshot.generated.ts", import.meta.url));
const generator = fileURLToPath(new URL("./build-set-snapshot.mjs", import.meta.url));
const workspace = mkdtempSync(join(tmpdir(), "omens-set-snapshot-"));

try {
  const regenerated = join(workspace, "set-snapshot.generated.ts");
  const result = spawnSync(process.execPath, ["--experimental-strip-types", generator, regenerated], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.error || result.status !== 0) fail(`regeneration did not succeed: ${result.stderr.trim() || result.error}`);

  const committed = readFileSync(committedPath);
  const produced = readFileSync(regenerated);
  if (!committed.equals(produced)) {
    fail(`the committed snapshot differs from the evidence (committed ${committed.length} bytes, regenerated ${produced.length} bytes)`);
  }
} finally {
  rmSync(workspace, { recursive: true, force: true });
}

console.log("set snapshot acceptance passed");
