import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const mutationModuleKey = "DRAFT_TABLE_TEST_PACK_CONSTRUCTION_POOL_OVERLAP_MODULE";
const sourcePath = new URL("../src/pack-construction-pool-overlap-evidence.ts", import.meta.url);
const contractName = "pack construction pool evidence requires exactly 209 normal unique identities";
const contractMarker = "PACK_CONSTRUCTION_NORMAL_209_GUARD_CONTRACT_EXECUTED";
const exactPattern = (name) => `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
const factsWithNormalCount = (normalCount) => {
  const frozen = (value) => Object.freeze(value), identities = Array.from({ length: normalCount }, (_, index) => frozen({ baseCollectorId: `MUT${index}`, cardUniqueId: `mutation-card-${index}` }));
  const normal = Array.from({ length: 8 }, (_, poolIndex) => frozen({ recipePoolCategory: "normal", officialIdentities: frozen(identities.filter((_, index) => index % 8 === poolIndex)) }));
  const rainbowFoil = Array.from({ length: 3 }, (_, poolIndex) => frozen({ recipePoolCategory: "rainbow-foil", officialIdentities: frozen(identities.slice(0, 171).filter((_, index) => index % 3 === poolIndex)) }));
  return frozen([...normal, ...rainbowFoil]);
};

test(contractName, async () => {
  console.log(contractMarker);
  const moduleUrl = process.env[mutationModuleKey] ?? sourcePath.href;
  const guard = await import(moduleUrl);
  assert.throws(
    () => guard.validateOmensPackConstructionPoolOverlapFactsForTest(factsWithNormalCount(208)),
    { code: "OMENS_PACK_CONSTRUCTION_POOL_OVERLAP_EVIDENCE_FAILED" },
    "NORMAL_209_GUARD_MUST_REJECT"
  );
});

test("normal-209 semantic bypass fails the exact named production guard contract", () => {
  const anchor = "if (normalIdentities.size !== EXPECTED_NORMAL_UNIQUE_IDENTITIES) return fail();";
  const original = readFileSync(sourcePath, "utf8");
  const mutated = original.replace(anchor, "if (false) return fail();");
  assert.equal(original.split(anchor).length - 1, 1);
  assert.notEqual(mutated, original);

  let directory;
  try {
    directory = mkdtempSync(join(tmpdir(), "draft-table-pack-construction-pool-overlap-"));
    const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url));
    for (const file of readdirSync(sourceDirectory).filter((file) => file.endsWith(".ts"))) copyFileSync(join(sourceDirectory, file), join(directory, file));
    symlinkSync(join(sourceDirectory, "../../../node_modules"), join(directory, "node_modules"), "dir");
    writeFileSync(join(directory, "pack-construction-pool-overlap-evidence.ts"), mutated);
    writeFileSync(join(directory, "tsconfig.json"), '{"compilerOptions":{"target":"ES2022","module":"ES2022","moduleResolution":"bundler","strict":true,"noEmit":true,"allowImportingTsExtensions":true},"include":["*.ts"]}');
    const typecheck = spawnSync(join(directory, "node_modules", ".bin", "tsc"), ["-p", join(directory, "tsconfig.json")], { encoding: "utf8" });
    assert.equal(typecheck.status, 0, `${typecheck.stdout}\n${typecheck.stderr}`);

    const environment = { ...process.env, [mutationModuleKey]: pathToFileURL(join(directory, "pack-construction-pool-overlap-evidence.ts")).href };
    delete environment.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--test-name-pattern", exactPattern(contractName), fileURLToPath(import.meta.url)], { encoding: "utf8", env: environment });
    const lines = result.stdout.split(/\r?\n/u);
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(lines.filter((line) => line === `# ${contractMarker}`).length, 1, "one exact execution marker");
    assert.equal(lines.filter((line) => /^not ok \d+ - /u.test(line) && line.replace(/^not ok \d+ - /u, "") === contractName).length, 1, "one exact named failing contract");
    assert.equal(lines.filter((line) => line.includes("NORMAL_209_GUARD_MUST_REJECT")).length, 1, "one specific guard failure line");
  } finally {
    if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  }
});
