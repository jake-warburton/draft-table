import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { discoverPublicSourceEvidenceTests } from "./evidence-discovery.mjs";

const PUBLIC_EVIDENCE_VARIABLES = [
  "FAB_CARD_SOURCE_EVIDENCE_PATH",
  "FAB_CARD_SCHEMA_EVIDENCE_PATH",
  "FAB_CARD_VAULT_EVIDENCE_PATH"
];
const TEST_TIMEOUT_MS = 10_000;

export const classifyPublicSourceEvidenceTests = (testDirectory) => {
  const files = discoverPublicSourceEvidenceTests(readdirSync(testDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name));
  if (files.length === 0) return { ok: false, diagnostic: "no gated files discovered" };

  const environment = { ...process.env };
  for (const variable of PUBLIC_EVIDENCE_VARIABLES) delete environment[variable];
  delete environment.OMENS_RECIPE_EVIDENCE_PATH;
  delete environment.NODE_TEST_CONTEXT;

  for (const file of files) {
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", join(testDirectory, file)], {
      encoding: "utf8", env: environment, stdio: ["ignore", "pipe", "pipe"], timeout: TEST_TIMEOUT_MS
    });
    if (result.error || result.status === null) return { ok: false, diagnostic: `gated file failed to execute: ${file}` };
    if (result.status !== 0) return { ok: false, diagnostic: `gated file exited unsuccessfully: ${file}` };
    const match = result.stdout.match(/^# skipped (\d+)$/m);
    if (!match) return { ok: false, diagnostic: `gated file has no parseable TAP summary: ${file}` };
    if (Number(match[1]) < 1) return { ok: false, diagnostic: `gated file reported zero skipped tests: ${file}` };
  }
  return { ok: true };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const outcome = classifyPublicSourceEvidenceTests(join(process.cwd(), "test"));
  if (!outcome.ok) {
    console.error(`Public evidence gate classification failed: ${outcome.diagnostic}.`);
    process.exit(1);
  }
  console.log("public evidence gate classification passed");
}
