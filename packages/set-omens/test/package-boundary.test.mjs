import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const canonicalSourceModules = Object.freeze([
  "card-vault-face-projection.ts", "card-vault-official-membership.ts", "card-vault-print-id-forms.ts", "card-vault-product-checksum.ts", "card-vault-product-descriptor.ts", "checksum.ts", "collation-weight-tables.ts", "custom-cards.ts", "descriptor.ts", "draft-eligibility-classification.ts", "index.ts", "layouts.ts", "official-face-printing-multiplicity-reconciliation.ts", "official-suffix-foiling-classification.ts", "official-upstream-id-reconciliation.ts", "official-upstream-printing-copy.ts", "omn-source-projection.ts", "pools.ts", "public-source-checksum.ts", "public-source-descriptor.ts", "public-source-document.ts", "public-source-schema-validation.ts", "recipe-layout-pool-resolution.ts", "recipe-official-identity-reconciliation.ts", "recipe-pool-identity-resolution.ts", "recipe-rarity-correspondence.ts", "recipe-rarity-domain.ts", "schema-validation.ts", "settings.ts", "sha256.ts"
]);

const copyCanonicalPackage = (directory, sourceDirectory = packageDirectory, copyModule = copyFileSync) => {
  copyModule(join(sourceDirectory, "package.json"), join(directory, "package.json"));
  mkdirSync(join(directory, "src"));
  for (const file of canonicalSourceModules) copyModule(join(sourceDirectory, "src", file), join(directory, "src", file));
};

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

const runIsolatedPackageConsumer = (source) => {
  const directory = mkdtempSync(join(tmpdir(), "draft-table-omens-isolated-package-"));
  try {
    copyCanonicalPackage(directory);
    writeFileSync(join(directory, "consumer.mjs"), source);
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }

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

test("canonical package isolation cannot race deletion of a noncanonical mutation module", () => {
  assert.deepEqual(readdirSync(join(packageDirectory, "src")).filter((file) => file.endsWith(".ts")).sort(), [...canonicalSourceModules].sort(), "canonical source allowlist is complete");
  const workspace = mkdtempSync(join(tmpdir(), "draft-table-package-copy-race-contract-"));
  const sourceDirectory = join(workspace, "source");
  const destinationDirectory = join(workspace, "destination");
  const transientPath = join(sourceDirectory, "src", "source-adjacent-mutation-probe.ts");
  try {
    mkdirSync(join(sourceDirectory, "src"), { recursive: true });
    mkdirSync(destinationDirectory);
    writeFileSync(join(sourceDirectory, "package.json"), "{}");
    for (const file of canonicalSourceModules) writeFileSync(join(sourceDirectory, "src", file), file);
    writeFileSync(transientPath, "transient");
    let deleted = false;
    copyCanonicalPackage(destinationDirectory, sourceDirectory, (source, destination) => {
      if (!deleted) {
        deleted = true;
        rmSync(transientPath);
      }
      copyFileSync(source, destination);
    });
    assert.equal(deleted, true, "transient deletion executed during canonical copy");
    assert.equal(existsSync(transientPath), false, "transient source was deleted");
    assert.deepEqual(readdirSync(join(destinationDirectory, "src")).sort(), [...canonicalSourceModules].sort(), "only canonical modules were copied");
  } finally {
    rmSync(workspace, { force: true, recursive: true });
  }
});

test("tracked semantic mutation probers allocate outside the repository and never derive source-adjacent output paths", () => {
  const testDirectory = join(packageDirectory, "test");
  const expectedProbers = Object.freeze([
    "card-vault-face-projection.test.mjs",
    "card-vault-official-membership.test.mjs",
    "collation-weight-tables.test.mjs",
    "card-vault-print-id-forms.test.mjs",
    "draft-eligibility-classification.test.mjs",
    "official-face-printing-multiplicity-reconciliation.test.mjs",
    "official-suffix-foiling-classification.test.mjs",
    "official-upstream-id-reconciliation.test.mjs",
    "omn-source-projection.test.mjs",
    "recipe-layout-pool-resolution.test.mjs",
    "recipe-official-identity-reconciliation.test.mjs",
    "recipe-pool-identity-resolution.test.mjs",
    "recipe-rarity-correspondence.test.mjs",
    "recipe-rarity-domain.test.mjs",
    "public-source-schema-validation.test.mjs"
  ]);
  const testSources = new Map(readdirSync(testDirectory).filter((file) => file.endsWith(".test.mjs")).map((file) => [file, readFileSync(join(testDirectory, file), "utf8")]));
  const actualProbers = [...testSources].filter(([, source]) => /(?:const|let) (?:mutated|mutation) = original/u.test(source)).map(([file]) => file).sort();
  assert.deepEqual(actualProbers, [...expectedProbers].sort(), "complete tracked semantic-prober inventory");
  for (const file of expectedProbers) {
    const source = testSources.get(file);
    assert.match(source, /mkdtempSync\(join\(tmpdir\(\),/u, `${file}: OS-temp allocation`);
    assert.doesNotMatch(source, /(?:`\$\{dirname\(fileURLToPath\(sourcePath\)\)\}|join\(dirname\(fileURLToPath\(sourcePath\)\))[^\n;]*(?:mutation|\.ts)/u, `${file}: no source-adjacent mutation path`);
    assert.doesNotMatch(source, /rmSync\((?:path|mutatedPath|duplicateBasePath), \{ force: true \}\)/u, `${file}: no transient production-module cleanup`);
  }
});

test("external consumers can import the supported Omens package root without build-time dependencies", () => {
  const source = 'import { parseVerifiedOmensCustomCards, parseVerifiedOmensLayouts, parseVerifiedOmensPools, parseVerifiedOmensSettings, validateVerifiedFabCardSchemaDocument, validateVerifiedFabEnglishCardDocument, verifyCardVaultOmensProductBytes, verifyFabCardSchemaBytes, verifyFabEnglishCardBytes, verifyOmensRecipeBytes } from "@draft-table/set-omens";\nconsole.log(typeof parseVerifiedOmensCustomCards, typeof parseVerifiedOmensLayouts, typeof parseVerifiedOmensPools, typeof parseVerifiedOmensSettings, typeof validateVerifiedFabCardSchemaDocument, typeof validateVerifiedFabEnglishCardDocument, typeof verifyCardVaultOmensProductBytes, typeof verifyFabCardSchemaBytes, typeof verifyFabEnglishCardBytes, typeof verifyOmensRecipeBytes);';
  const result = runIsolatedPackageConsumer(source);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "function function function function function function function function function function");
});

test("external build-time consumers can import only the schema-validation subpath when dependencies are installed", () => {
  const result = runConsumer('import { DraftEligibilityClassificationError, FabCardSourceSchemaValidationError, OmensCollationWeightTablesError, OmensRecipeLayoutPoolResolutionError, OmensRecipeOfficialIdentityReconciliationError, OmensRecipePoolIdentityResolutionError, OmensRecipeRarityCorrespondenceError, OmnSourceProjectionError, classifyOmensOfficialDraftEligibility, compileOmensCollationWeightTables, projectSchemaValidatedFabEnglishCardDataForOmn, reconcileOmensRecipeCustomCardsWithOfficialUpstreamIdentities, reconcileOmensRecipeRaritiesWithOfficialUpstreamPrintings, resolveOmensRecipeLayoutsToOfficialIdentityPools, resolveOmensRecipePoolsToDraftableOfficialIdentities, validateFabEnglishCardDataAgainstSchema } from "@draft-table/set-omens/schema-validation";\nconsole.log(typeof DraftEligibilityClassificationError, typeof FabCardSourceSchemaValidationError, typeof OmensCollationWeightTablesError, typeof OmensRecipeLayoutPoolResolutionError, typeof OmensRecipeOfficialIdentityReconciliationError, typeof OmensRecipePoolIdentityResolutionError, typeof OmensRecipeRarityCorrespondenceError, typeof OmnSourceProjectionError, typeof classifyOmensOfficialDraftEligibility, typeof compileOmensCollationWeightTables, typeof projectSchemaValidatedFabEnglishCardDataForOmn, typeof reconcileOmensRecipeCustomCardsWithOfficialUpstreamIdentities, typeof reconcileOmensRecipeRaritiesWithOfficialUpstreamPrintings, typeof resolveOmensRecipeLayoutsToOfficialIdentityPools, typeof resolveOmensRecipePoolsToDraftableOfficialIdentities, typeof validateFabEnglishCardDataAgainstSchema);');

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "function function function function function function function function function function function function function function function function");
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
  expectPackageBoundary('import "@draft-table/set-omens/src/card-vault-product-checksum.ts";');
  expectPackageBoundary('import { readVerifiedCardVaultOmensProductResponseBytesForParser } from "@draft-table/set-omens/src/card-vault-product-checksum.ts";');
  expectPackageBoundary('import "@draft-table/set-omens/src/card-vault-product-descriptor.ts";');
  expectPackageBoundary('import "@draft-table/set-omens/src/public-source-checksum.ts";');
  expectPackageBoundary('import { readVerifiedFabEnglishCardBytesForParser } from "@draft-table/set-omens/src/public-source-checksum.ts";');
  expectPackageBoundary('import { readVerifiedFabCardSchemaBytesForParser } from "@draft-table/set-omens/src/public-source-checksum.ts";');
  expectPackageBoundary('import "@draft-table/set-omens/src/public-source-descriptor.ts";');
  expectPackageBoundary('import "@draft-table/set-omens/src/public-source-document.ts";');
  expectPackageBoundary('import { readValidatedFabEnglishCardBytesForParser } from "@draft-table/set-omens/src/public-source-document.ts";');
  expectPackageBoundary('import "@draft-table/set-omens/src/public-source-schema-validation.ts";');
  expectPackageBoundary('import "@draft-table/set-omens/src/recipe-layout-pool-resolution.ts";');
  expectPackageBoundary('import "@draft-table/set-omens/src/recipe-official-identity-reconciliation.ts";');
  expectPackageBoundary('import "@draft-table/set-omens/src/recipe-pool-identity-resolution.ts";');
  expectPackageBoundary('import "@draft-table/set-omens/schema-validation/public-source-schema-validation.ts";');
  expectPackageBoundary('import { readSchemaValidatedFabEnglishCardDataForParser } from "@draft-table/set-omens/src/public-source-schema-validation.ts";');
  expectPackageBoundary('import { parseOmensPoolsFromTrustedBytes } from "@draft-table/set-omens/src/pools.ts";');
});
