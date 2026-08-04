import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  discoverEvidenceTests,
  discoverPublicSourceEvidenceTests
} from "./evidence-discovery.mjs";

const syntheticFiles = [
  "evidence-command-contract.test.mjs",
  "package-boundary.test.mjs",
  "public-source-checksum-gate.public-source-evidence.test.mjs",
  "topic-about-public-source.test.mjs",
  "synthetic-contract.test.mjs"
];
const packageDirectory = fileURLToPath(new URL("..", import.meta.url));
const privateRunner = fileURLToPath(new URL("./evidence-command.mjs", import.meta.url));
const publicRunner = fileURLToPath(new URL("./public-source-evidence-command.mjs", import.meta.url));

const runSyntheticCommand = (runner, environment) => {
  const fixtureDirectory = mkdtempSync(join(packageDirectory, ".evidence-discovery-"));
  const testDirectory = join(fixtureDirectory, "test");
  const probeDirectory = join(fixtureDirectory, "probes");
  const evidencePath = join(fixtureDirectory, "evidence");
  mkdirSync(testDirectory);
  mkdirSync(probeDirectory);
  writeFileSync(evidencePath, "synthetic evidence");

  for (const file of syntheticFiles) {
    const gate = file.endsWith(".public-source-evidence.test.mjs")
      ? `test("discovery probe", { skip: !process.env.FAB_CARD_SOURCE_EVIDENCE_PATH ? "missing evidence" : false }, () => writeFileSync(join(process.env.EVIDENCE_DISCOVERY_PROBE_DIRECTORY, ${JSON.stringify(file)}), ""));`
      : `test("discovery probe", () => writeFileSync(join(process.env.EVIDENCE_DISCOVERY_PROBE_DIRECTORY, ${JSON.stringify(file)}), ""));`;
    writeFileSync(join(testDirectory, file), `
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
${gate}
`);
  }

  try {
    const result = spawnSync(process.execPath, [runner], {
      cwd: fixtureDirectory,
      encoding: "utf8",
      env: {
        ...process.env,
        EVIDENCE_DISCOVERY_PROBE_DIRECTORY: probeDirectory,
        OMENS_RECIPE_EVIDENCE_PATH: evidencePath,
        FAB_CARD_SOURCE_EVIDENCE_PATH: evidencePath,
        FAB_CARD_SCHEMA_EVIDENCE_PATH: evidencePath,
        ...environment
      }
    });
    return { result, selectedFiles: readdirSync(probeDirectory).sort() };
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
};

test("private evidence discovery excludes only explicitly gated tests", () => {
  assert.deepEqual(discoverEvidenceTests(syntheticFiles), [
    "evidence-command-contract.test.mjs",
    "package-boundary.test.mjs",
    "topic-about-public-source.test.mjs",
    "synthetic-contract.test.mjs"
  ]);
});

test("public evidence discovery selects only explicitly gated tests", () => {
  assert.deepEqual(discoverPublicSourceEvidenceTests(syntheticFiles), [
    "public-source-checksum-gate.public-source-evidence.test.mjs"
  ]);
});

test("private evidence command runs topic-named ordinary contracts and excludes gated contracts", () => {
  const { result, selectedFiles } = runSyntheticCommand(privateRunner);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "private evidence acceptance passed\n");
  assert.deepEqual(selectedFiles, [
    "evidence-command-contract.test.mjs",
    "package-boundary.test.mjs",
    "synthetic-contract.test.mjs",
    "topic-about-public-source.test.mjs"
  ]);
});

test("public evidence command runs only explicitly gated contracts", () => {
  const { result, selectedFiles } = runSyntheticCommand(publicRunner);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "public card source acceptance passed\n");
  assert.deepEqual(selectedFiles, [
    "public-source-checksum-gate.public-source-evidence.test.mjs"
  ]);
});
