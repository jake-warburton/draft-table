import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { OmensRecipeCustomCardsError, parseOmensCustomCardsFromTrustedBytes } from "../src/custom-cards.ts";
import { translateOmensRecipeRarityAtFabSeam } from "../src/recipe-rarity-domain.ts";

const bytes = (rarity) => Buffer.from(`\ufeff[Settings]\r\n{"showSlots":true,"withReplacement":false,"cardBack":"https://cards.invalid/back.png"}\r\n[CustomCards]\r\n[{"name":"Fictional Majestic","collector_number":"TST001","mana_cost":"2","rarity":"${rarity}","type":"action","image_uris":{"en":"https://cards.invalid/a.png"}}]\r\n[Layouts]\r\nopaque`, "utf8");

test("ingest preserves only exact recipe source labels and rejects domain or unknown vocabulary generically", () => {
  assert.equal(parseOmensCustomCardsFromTrustedBytes(bytes("mythic"))[0].rarity, "mythic");
  for (const rejected of ["majestic", "unknown", "Mythic", "ｍythic", " mythic"]) {
    assert.throws(() => parseOmensCustomCardsFromTrustedBytes(bytes(rejected)), OmensRecipeCustomCardsError);
  }
});

test("the named recipe seam returns FaB-native classifications with broad-vocabulary C R M codes", () => {
  assert.deepEqual(translateOmensRecipeRarityAtFabSeam("common"), { fabRarity: "common", correspondingUpstreamCode: "C" });
  assert.deepEqual(translateOmensRecipeRarityAtFabSeam("rare"), { fabRarity: "rare", correspondingUpstreamCode: "R" });
  assert.deepEqual(translateOmensRecipeRarityAtFabSeam("mythic"), { fabRarity: "majestic", correspondingUpstreamCode: "M" });
});

const moduleEnvironmentKey = "DRAFT_TABLE_TEST_RECIPE_RARITY_DOMAIN_MODULE";
const contractName = "source mythic maps once to FaB majestic and broad-vocabulary M";
const marker = "RECIPE_RARITY_MYTHIC_TO_MAJESTIC_CONTRACT_EXECUTED";
test(contractName, async () => {
  console.log(marker);
  const moduleUrl = process.env[moduleEnvironmentKey] ?? new URL("../src/recipe-rarity-domain.ts", import.meta.url).href;
  const loaded = await import(moduleUrl);
  assert.deepEqual(loaded.translateOmensRecipeRarityAtFabSeam("mythic"), { fabRarity: "majestic", correspondingUpstreamCode: "M" }, "MYTHIC_SOURCE_MUST_MAP_TO_FAB_MAJESTIC_AND_M");
});

test("mythic to majestic semantic mutation fails its exact named seam contract", () => {
  const sourcePath = new URL("../src/recipe-rarity-domain.ts", import.meta.url);
  const original = Buffer.from(process.getBuiltinModule("node:fs").readFileSync(sourcePath)).toString();
  const mutated = original.replace('fabRarity: "majestic", correspondingUpstreamCode: "M"', 'fabRarity: "rare", correspondingUpstreamCode: "M"');
  assert.notEqual(mutated, original);
  let directory;
  try {
    directory = mkdtempSync(join(tmpdir(), "draft-table-recipe-rarity-domain-mutation-"));
    const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url));
    for (const file of readdirSync(sourceDirectory).filter((file) => file.endsWith(".ts"))) copyFileSync(join(sourceDirectory, file), join(directory, file));
    symlinkSync(join(sourceDirectory, "../../../node_modules"), join(directory, "node_modules"), "dir");
    const path = join(directory, "recipe-rarity-domain.ts"); writeFileSync(path, mutated);
    const environment = { ...process.env, [moduleEnvironmentKey]: pathToFileURL(path).href }; delete environment.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--test-name-pattern", `^${contractName}$`, fileURLToPath(import.meta.url)], { encoding: "utf8", env: environment });
    const lines = result.stdout.split(/\r?\n/);
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(lines.filter((line) => line === `# ${marker}`).length, 1);
    assert.equal(lines.filter((line) => /^not ok \d+ - /.test(line) && line.endsWith(contractName)).length, 1);
    assert.equal(lines.filter((line) => line.includes("MYTHIC_SOURCE_MUST_MAP_TO_FAB_MAJESTIC_AND_M")).length, 1);
  } finally { if (directory) rmSync(directory, { recursive: true, force: true }); }
});
