import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const runConsumer = (source) => {
  const directory = mkdtempSync(join(tmpdir(), "draft-table-omens-consumer-"));
  const packageLink = join(directory, "node_modules", "@draft-table", "set-omens");
  mkdirSync(dirname(packageLink), { recursive: true });
  symlinkSync(packageDirectory, packageLink, "dir");
  writeFileSync(join(directory, "consumer.mjs"), source);

  try {
    return spawnSync(process.execPath, ["--experimental-strip-types", "consumer.mjs"], {
      cwd: directory,
      encoding: "utf8"
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

const expectPackageBoundary = (source) => {
  const result = runConsumer(source);

  assert.notEqual(result.status, 0, result.stdout);
  assert.match(result.stderr, /ERR_PACKAGE_PATH_NOT_EXPORTED/);
};

test("external consumers can import the supported Omens package root", () => {
  const result = runConsumer('import { parseVerifiedOmensCustomCards, parseVerifiedOmensLayouts, parseVerifiedOmensPools, parseVerifiedOmensSettings, verifyOmensRecipeBytes } from "@draft-table/set-omens";\nconsole.log(typeof parseVerifiedOmensCustomCards, typeof parseVerifiedOmensLayouts, typeof parseVerifiedOmensPools, typeof parseVerifiedOmensSettings, typeof verifyOmensRecipeBytes);');

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "function function function function function");
});

test("external consumers cannot import Omens internal source modules or the raw parser", () => {
  expectPackageBoundary('import "@draft-table/set-omens/src/settings.ts";');
  expectPackageBoundary('import "@draft-table/set-omens/src/layouts.ts";');
  expectPackageBoundary('import { parseOmensLayoutsFromTrustedBytes } from "@draft-table/set-omens/src/layouts.ts";');
  expectPackageBoundary('import "@draft-table/set-omens/src/custom-cards.ts";');
  expectPackageBoundary('import { parseOmensCustomCardsFromTrustedBytes } from "@draft-table/set-omens/src/custom-cards.ts";');
  expectPackageBoundary('import { parseOmensSettingsFromTrustedBytes } from "@draft-table/set-omens/src/settings.ts";');
  expectPackageBoundary('import "@draft-table/set-omens/src/checksum.ts";');
  expectPackageBoundary('import "@draft-table/set-omens/src/pools.ts";');
  expectPackageBoundary('import { parseOmensPoolsFromTrustedBytes } from "@draft-table/set-omens/src/pools.ts";');
});
