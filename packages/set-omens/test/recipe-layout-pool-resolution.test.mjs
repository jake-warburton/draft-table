import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { exactTestNamePattern } from "./recipe-layout-pool-resolution-test-name.mjs";
import { completeOmensRecipeCustomCardsAggregateForTest, parseOmensCustomCardsFromTrustedBytes } from "../src/custom-cards.ts";
import { classifyOmensDraftEligibilityForTest } from "../src/draft-eligibility-classification.ts";
import { parseOmensLayoutsFromTrustedBytes } from "../src/layouts.ts";
import { reconcileOfficialUpstreamIdRecordsForTest } from "../src/official-upstream-id-reconciliation.ts";
import { completeOmensRecipePoolsForTest, parseOmensPoolsFromTrustedBytes } from "../src/pools.ts";
import { reconcileOmensRecipeOfficialIdentityRecordsForTest } from "../src/recipe-official-identity-reconciliation.ts";
import { resolveOmensRecipePoolsToDraftableOfficialIdentitiesForTest } from "../src/recipe-pool-identity-resolution.ts";
import { OmensRecipeLayoutPoolResolutionError, resolveOmensRecipeLayoutsToOfficialIdentityPoolsForTest, validateOmensRecipeStructuralOutcomeCountsForTest } from "../src/recipe-layout-pool-resolution.ts";

const settings = JSON.stringify({ showSlots: true, withReplacement: false, cardBack: "https://cards.invalid/back.png" });
const card = (name, collector_number, rarity = "common") => ({ name, collector_number, mana_cost: "2", rarity, type: "action", image_uris: { en: "https://cards.invalid/a.png" } });
const recipeBytes = (prefix = "First") => Buffer.from(`\ufeff[Settings]\r\n${settings}\r\n[CustomCards]\r\n${JSON.stringify([card(`${prefix} Owner`, "OMN100"), card(`${prefix} Equipment`, "OMN101"), card(`${prefix} Rare`, "OMN102", "rare")])}\r\n[Layouts]\r\n\t- ${prefix} Layout (17)\r\n\t\t10 Wizard\r\n\t\t1 Equipment\r\n\t\t2 Rare\r\n\t\t1 Rfcommon\r\n[Wizard]\r\n3 ${prefix} Owner\r\n[Equipment]\r\n5 ${prefix} Equipment\r\n[Rare]\r\n11 ${prefix} Rare\r\n[Rfcommon]\r\n7 ${prefix} Owner`, "utf8");
const forms = Object.freeze([
  Object.freeze({ officialPrintId: "OMN100", baseCollectorId: "OMN100", sourceSet: "OMN", suffixMarker: null }),
  Object.freeze({ officialPrintId: "OMN101", baseCollectorId: "OMN101", sourceSet: "OMN", suffixMarker: null }),
  Object.freeze({ officialPrintId: "OMN102", baseCollectorId: "OMN102", sourceSet: "OMN", suffixMarker: null }),
  Object.freeze({ officialPrintId: "IAR200-MV", baseCollectorId: "IAR200", sourceSet: "IAR", suffixMarker: "MV" })
]);
const capabilities = (prefix = "First", modules = { custom: { completeOmensRecipeCustomCardsAggregateForTest, parseOmensCustomCardsFromTrustedBytes }, eligibility: { classifyOmensDraftEligibilityForTest }, layouts: { parseOmensLayoutsFromTrustedBytes }, upstream: { reconcileOfficialUpstreamIdRecordsForTest }, pools: { completeOmensRecipePoolsForTest, parseOmensPoolsFromTrustedBytes }, identity: { reconcileOmensRecipeOfficialIdentityRecordsForTest }, poolResolution: { resolveOmensRecipePoolsToDraftableOfficialIdentitiesForTest } }) => {
  const bytes = recipeBytes(prefix);
  const cards = modules.custom.completeOmensRecipeCustomCardsAggregateForTest(modules.custom.parseOmensCustomCardsFromTrustedBytes(bytes), { common: 2, rare: 1, mythic: 0 });
  const layouts = modules.layouts.parseOmensLayoutsFromTrustedBytes(bytes);
  const pools = modules.pools.completeOmensRecipePoolsForTest(modules.pools.parseOmensPoolsFromTrustedBytes(bytes), layouts, cards);
  const names = new Map([["OMN100", `${prefix} Owner`], ["OMN101", `${prefix} Equipment`], ["OMN102", `${prefix} Rare`], ["IAR200", "Excluded"]]);
  const source = forms.map((form, index) => ({ unique_id: `${prefix}-card-${index}`, name: names.get(form.baseCollectorId), pitch: "", printings: [{ unique_id: `${prefix}-printing-${index}`, set_printing_unique_id: `${prefix}-set-${form.sourceSet}`, id: form.baseCollectorId, set_id: form.sourceSet, edition: "standard", foiling: "standard", rarity: "C", expansion_slot: false, image_url: "https://images.invalid/a.png", art_variations: [] }] }));
  const official = modules.upstream.reconcileOfficialUpstreamIdRecordsForTest(forms, source, { entries: 4, omnEntries: 3, iarEntries: 1, omnPrintings: 3, iarPrintings: 1 });
  const identities = modules.identity.reconcileOmensRecipeOfficialIdentityRecordsForTest(cards, official, { recipeEntries: 3, officialEntries: 4, candidateEntries: 3, mappedEntries: 3, unmappedEntries: 1, unmappedOmn: 0, unmappedIar: 1, unmappedUnsuffixed: 0, unmappedRf: 0, unmappedCf: 0, unmappedMv: 1 });
  const eligibility = modules.eligibility.classifyOmensDraftEligibilityForTest(identities, official, { officialEntries: 4, mappedEntries: 3, mappedIarEntries: 0, excludedEntries: 1, excludedIarEntries: 1, excludedNonIarEntries: 0, unclassifiedEntries: 0, unclassifiedOmnEntries: 0, unclassifiedIarEntries: 0, unclassifiedUnsuffixed: 0, unclassifiedRf: 0, unclassifiedCf: 0, unclassifiedMv: 0 });
  const resolvedPools = modules.poolResolution.resolveOmensRecipePoolsToDraftableOfficialIdentitiesForTest(pools, identities, eligibility);
  return { layouts, resolvedPools };
};
const resolve = (parts = capabilities()) => resolveOmensRecipeLayoutsToOfficialIdentityPoolsForTest(parts.layouts, parts.resolvedPools);
const safe = (action) => assert.throws(action, (error) => {
  assert.ok(error instanceof OmensRecipeLayoutPoolResolutionError);
  assert.equal(error.code, "OMENS_RECIPE_LAYOUT_POOL_RESOLUTION_FAILED");
  assert.equal(error.message, "Omens recipe layout pool resolution failed.");
  assert.equal(error.stack, "OmensRecipeLayoutPoolResolutionError: Omens recipe layout pool resolution failed.");
  assert.deepEqual(JSON.parse(JSON.stringify(error)), { name: "OmensRecipeLayoutPoolResolutionError", code: "OMENS_RECIPE_LAYOUT_POOL_RESOLUTION_FAILED" });
  assert.doesNotMatch(`${error.message}${error.stack}${JSON.stringify(error)}`, /First|OMN|IAR|Wizard|Generic|Rfcommon|[0-9]|https?:|\\|\//i);
  return true;
});

const expectedLabels = [...Array(10).fill("Wizard"), "Equipment", "Rare", "Rare", "Rfcommon"];
const expectedRoles = [...Array(11).fill("common-rarity"), "fixed-rare", "rare-or-majestic", "rainbow-foil"];

test("exact layout and slot order retain repeated source pool references as stable capability-owned pools", () => {
  const parts = capabilities();
  const result = resolve(parts);
  assert.equal(result.withReplacement, false);
  assert.equal(result.layouts.length, 1);
  assert.equal(result.layouts[0].id, "First Layout");
  assert.equal(result.layouts[0].weight, 17);
  assert.deepEqual(result.layouts[0].slots.map((slot) => slot.position), Array.from({ length: 14 }, (_, index) => index + 1));
  assert.deepEqual(result.layouts[0].slots.map((slot) => slot.sourcePoolLabel), expectedLabels);
  assert.deepEqual(result.layouts[0].slots.map((slot) => slot.recipeStructuralRole), expectedRoles);
  assert.equal(result.layouts[0].slots[10].sourcePoolLabel, "Equipment");
  assert.equal(result.layouts[0].slots[10].recipeStructuralRole, "common-rarity");
  assert.equal(result.layouts[0].slots[11].resolvedPool, result.layouts[0].slots[12].resolvedPool);
  assert.notEqual(result.layouts[0].slots[11].recipeStructuralRole, result.layouts[0].slots[12].recipeStructuralRole);
  const poolsByLabel = new Map(parts.resolvedPools.map((pool) => [pool.sourcePoolLabel, pool]));
  assert.equal(result.layouts[0].slots.every((slot) => slot.resolvedPool === poolsByLabel.get(slot.sourcePoolLabel)), true);
  assert.equal(result.layouts[0].slots[0].resolvedPool, result.layouts[0].slots[1].resolvedPool);
});

test("layout facts are deeply immutable, fresh and copy-independent while retaining stable pool identity", () => {
  const parts = capabilities(), first = resolve(parts), second = resolve(parts);
  assert.ok(Object.isFrozen(first)); assert.ok(Object.isFrozen(first.layouts)); assert.notEqual(first, second); assert.notEqual(first.layouts, second.layouts);
  assert.ok(Object.isFrozen(first.layouts[0])); assert.ok(Object.isFrozen(first.layouts[0].slots)); assert.notEqual(first.layouts[0], second.layouts[0]); assert.notEqual(first.layouts[0].slots, second.layouts[0].slots);
  for (let index = 0; index < 14; index++) { assert.ok(Object.isFrozen(first.layouts[0].slots[index])); assert.notEqual(first.layouts[0].slots[index], second.layouts[0].slots[index]); assert.equal(first.layouts[0].slots[index].resolvedPool, second.layouts[0].slots[index].resolvedPool); }
  assert.throws(() => first.layouts.push({}), TypeError); assert.throws(() => { first.layouts[0].slots[0].position = 9; }, TypeError);
  assert.doesNotMatch(JSON.stringify(first), /officialPrintId|suffix|foiling|printing|treatment|image|draw|selectedCard/i);
});

test("forged, copied, missing, duplicate and foreign capability ownership fails closed", () => {
  const parts = capabilities(), foreign = capabilities("Foreign");
  safe(() => resolveOmensRecipeLayoutsToOfficialIdentityPoolsForTest(structuredClone(parts.layouts), parts.resolvedPools));
  safe(() => resolveOmensRecipeLayoutsToOfficialIdentityPoolsForTest(parts.layouts, structuredClone(parts.resolvedPools)));
  safe(() => resolveOmensRecipeLayoutsToOfficialIdentityPoolsForTest(parts.layouts, foreign.resolvedPools));
  safe(() => resolveOmensRecipeLayoutsToOfficialIdentityPoolsForTest(parts.layouts));
  safe(() => resolveOmensRecipeLayoutsToOfficialIdentityPoolsForTest(parts.layouts, parts.resolvedPools, { pool: "override" }));
});

test("unknown, case, spacing and NFC-drifted references cannot be completed", () => {
  for (const change of [
    (bytes) => Buffer.from(bytes.toString("utf8").replace("\t\t1 Equipment", "\t\t1 equipment"), "utf8"),
    (bytes) => Buffer.from(bytes.toString("utf8").replace("\t\t1 Equipment", "\t\t1  Equipment"), "utf8"),
    (bytes) => Buffer.from(bytes.toString("utf8").replace("\t\t1 Equipment", "\t\t1 E\u0301quipment"), "utf8"),
    (bytes) => Buffer.from(bytes.toString("utf8").replace("\t\t1 Equipment", "\t\t1 Missing"), "utf8")
  ]) {
    const bytes = change(recipeBytes());
    assert.throws(() => {
      const cards = completeOmensRecipeCustomCardsAggregateForTest(parseOmensCustomCardsFromTrustedBytes(bytes), { common: 2, rare: 0, mythic: 0 });
      completeOmensRecipePoolsForTest(parseOmensPoolsFromTrustedBytes(bytes), parseOmensLayoutsFromTrustedBytes(bytes), cards);
    });
  }
});

const mutationModuleKey = "DRAFT_TABLE_TEST_RECIPE_LAYOUT_POOL_RESOLUTION_MODULE";
const sourcePath = new URL("../src/recipe-layout-pool-resolution.ts", import.meta.url);
const withCanonicalSnapshot = (action) => {
  let directory;
  try {
    directory = mkdtempSync(join(tmpdir(), "draft-table-recipe-layout-pool-mutation-"));
    const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url));
    for (const file of readdirSync(sourceDirectory).filter((file) => file.endsWith(".ts"))) copyFileSync(join(sourceDirectory, file), join(directory, file));
    symlinkSync(join(sourceDirectory, "../../../node_modules"), join(directory, "node_modules"), "dir");
    return action(directory);
  } finally { if (directory !== undefined) rmSync(directory, { recursive: true, force: true }); }
};
const loadMutationModules = async () => {
  const moduleUrl = process.env[mutationModuleKey] ?? sourcePath.href;
  const directory = new URL("./", moduleUrl);
  return {
    resolution: await import(moduleUrl),
    custom: await import(new URL("custom-cards.ts", directory)), eligibility: await import(new URL("draft-eligibility-classification.ts", directory)),
    layouts: await import(new URL("layouts.ts", directory)), upstream: await import(new URL("official-upstream-id-reconciliation.ts", directory)),
    pools: await import(new URL("pools.ts", directory)), identity: await import(new URL("recipe-official-identity-reconciliation.ts", directory)),
    poolResolution: await import(new URL("recipe-pool-identity-resolution.ts", directory))
  };
};
const runMutation = (mutated, contractName, marker, failure) => withCanonicalSnapshot((directory) => {
  const path = join(directory, "recipe-layout-pool-resolution.ts"); writeFileSync(path, mutated);
  const environment = { ...process.env, [mutationModuleKey]: pathToFileURL(path).href }; delete environment.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--test-name-pattern", exactTestNamePattern(contractName), fileURLToPath(import.meta.url)], { encoding: "utf8", env: environment });
  const lines = result.stdout.split(/\r?\n/);
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.equal(lines.filter((line) => line === `# ${marker}`).length, 1);
  assert.equal(lines.filter((line) => /^not ok \d+ - /.test(line) && line.replace(/^not ok \d+ - /, "") === contractName).length, 1);
  assert.equal(lines.filter((line) => line.includes(failure)).length, 1);
});

const ownershipContract = "layout slots resolve only through their exact capability-owned pools", ownershipMarker = "RECIPE_LAYOUT_POOL_OWNERSHIP_CONTRACT_EXECUTED";
test(ownershipContract, async () => {
  console.log(ownershipMarker); const m = await loadMutationModules(); const own = capabilities("First", m), foreign = capabilities("Foreign", m);
  assert.throws(() => m.resolution.resolveOmensRecipeLayoutsToOfficialIdentityPoolsForTest(own.layouts, foreign.resolvedPools), m.resolution.OmensRecipeLayoutPoolResolutionError, "EXACT_LAYOUT_POOL_OWNER_MUST_MATCH");
});
test("layout-to-pool ownership semantic mutation fails its exact named contract", () => {
  const original = readFileSync(sourcePath, "utf8");
  const mutated = original.replace("if (layoutOwner !== poolOwner) fail();", "if (false) fail();");
  assert.notEqual(mutated, original); runMutation(mutated, ownershipContract, ownershipMarker, "EXACT_LAYOUT_POOL_OWNER_MUST_MATCH");
});

const slotsContract = "slot positions preserve exact source order and repeated-reference multiplicity", slotsMarker = "RECIPE_LAYOUT_SLOT_ORDER_MULTIPLICITY_CONTRACT_EXECUTED";
test(slotsContract, async () => {
  console.log(slotsMarker); const m = await loadMutationModules(); const result = m.resolution.resolveOmensRecipeLayoutsToOfficialIdentityPoolsForTest(...Object.values(capabilities("First", m)));
  assert.deepEqual(result.layouts[0].slots.map((slot) => slot.sourcePoolLabel), expectedLabels, "EXACT_SLOT_MULTIPLICITY_AND_ORDER_MUST_BE_RETAINED");
});
test("slot multiplicity and order semantic mutation fails its exact named contract", () => {
  const original = readFileSync(sourcePath, "utf8");
  const mutated = original
    .replace("for (const sourceSlot of layout.slots)", "for (const sourceSlot of [...layout.slots].reverse())")
    .replace("repetition < sourceSlot.count", "repetition < 1")
    .replace("if (slots.length !== 14 || commonCount !== 11 || rareCount < 1 || rareCount + majesticCount !== 2 ||\n      rainbowCount !== 1 || (rareCount === 2 && majesticCount !== 0) || (rareCount === 1 && majesticCount !== 1)) fail();", "if (false) fail();");
  assert.notEqual(mutated, original); runMutation(mutated, slotsContract, slotsMarker, "EXACT_SLOT_MULTIPLICITY_AND_ORDER_MUST_BE_RETAINED");
});

const rolesContract = "recipe-structural roles derive only from resolved rarity and category ownership", rolesMarker = "RECIPE_LAYOUT_STRUCTURAL_ROLES_CONTRACT_EXECUTED";
test(rolesContract, async () => {
  console.log(rolesMarker); const m = await loadMutationModules(); let result;
  assert.doesNotThrow(() => { result = m.resolution.resolveOmensRecipeLayoutsToOfficialIdentityPoolsForTest(...Object.values(capabilities("First", m))); }, "EXACT_RECIPE_STRUCTURAL_ROLES_MUST_BE_RETAINED");
  assert.deepEqual(result.layouts[0].slots.map((slot) => slot.recipeStructuralRole), expectedRoles, "EXACT_RECIPE_STRUCTURAL_ROLES_MUST_BE_RETAINED");
});
test("pool-name-based recipe-structural role mutation fails its exact named contract", () => {
  const original = readFileSync(sourcePath, "utf8");
  const mutated = original.replace('pool.recipePoolCategory === "normal" && pool.fabRarity === "common"', 'sourceSlot.pool !== "Equipment" && pool.recipePoolCategory === "normal" && pool.fabRarity === "common"');
  assert.notEqual(mutated, original); runMutation(mutated, rolesContract, rolesMarker, "EXACT_RECIPE_STRUCTURAL_ROLES_MUST_BE_RETAINED");
});
test("recipe-structural role erasure and swap mutations fail their exact named contract", () => {
  const original = readFileSync(sourcePath, "utf8");
  for (const mutated of [
    original.replace(", recipeStructuralRole, resolvedPool: pool", ", resolvedPool: pool"),
    original.replace('rareCount === 1 ? "fixed-rare" : "rare-or-majestic"', 'rareCount === 1 ? "rare-or-majestic" : "fixed-rare"')
  ]) {
    assert.notEqual(mutated, original); runMutation(mutated, rolesContract, rolesMarker, "EXACT_RECIPE_STRUCTURAL_ROLES_MUST_BE_RETAINED");
  }
});

const outcomesContract = "recipe-structural rare-or-majestic outcomes retain the exact 114 to 114 distribution", outcomesMarker = "RECIPE_LAYOUT_STRUCTURAL_OUTCOMES_CONTRACT_EXECUTED";
test(outcomesContract, async () => {
  console.log(outcomesMarker); const m = await loadMutationModules();
  assert.doesNotThrow(() => m.resolution.validateOmensRecipeStructuralOutcomeCountsForTest(228, 114, 114));
  assert.throws(() => m.resolution.validateOmensRecipeStructuralOutcomeCountsForTest(228, 113, 115), m.resolution.OmensRecipeLayoutPoolResolutionError, "EXACT_RECIPE_STRUCTURAL_OUTCOME_DISTRIBUTION_MUST_BE_RETAINED");
});
test("recipe-structural 114-to-114 redistribution mutation fails its exact named contract", () => {
  const original = readFileSync(sourcePath, "utf8");
  const mutated = original.replace("if (layoutCount === 228 && (rareSecondOutcomes !== 114 || majesticSecondOutcomes !== 114)) fail();", "if (false) fail();");
  assert.notEqual(mutated, original); runMutation(mutated, outcomesContract, outcomesMarker, "EXACT_RECIPE_STRUCTURAL_OUTCOME_DISTRIBUTION_MUST_BE_RETAINED");
});
test("recipe-structural outcome aggregate rejects redistribution", () => {
  assert.doesNotThrow(() => validateOmensRecipeStructuralOutcomeCountsForTest(228, 114, 114));
  safe(() => validateOmensRecipeStructuralOutcomeCountsForTest(228, 115, 113));
});

const capabilityContract = "layout resolution accepts only its opaque completed layout capability", capabilityMarker = "RECIPE_LAYOUT_CAPABILITY_ONLY_CONTRACT_EXECUTED";
test(capabilityContract, async () => {
  console.log(capabilityMarker); const m = await loadMutationModules(); const parts = capabilities("First", m);
  assert.throws(() => m.resolution.resolveOmensRecipeLayoutsToOfficialIdentityPoolsForTest(structuredClone(parts.layouts), parts.resolvedPools), m.resolution.OmensRecipeLayoutPoolResolutionError, "OPAQUE_LAYOUT_CAPABILITY_MUST_BE_REQUIRED");
});
test("capability-only semantic mutation fails its exact named contract", () => {
  const original = readFileSync(sourcePath, "utf8");
  const mutated = original.replace("const layouts = readCompletedOmensRecipeLayoutsForPoolResolution(layoutCapability);\n  const layoutOwner = readCompletedOmensRecipeLayoutsSourceOwner(layoutCapability);", "const layouts = layoutCapability;\n  const layoutOwner = poolOwner;");
  assert.notEqual(mutated, original); runMutation(mutated, capabilityContract, capabilityMarker, "OPAQUE_LAYOUT_CAPABILITY_MUST_BE_REQUIRED");
});

test("mutation snapshots are file-local OS-temp canonical copies and always clean", () => {
  let snapshot; withCanonicalSnapshot((directory) => { snapshot = directory; assert.ok(directory.startsWith(tmpdir())); assert.equal(directory.startsWith(`${resolvePath(fileURLToPath(new URL("../../..", import.meta.url)))}${sep}`), false); }); assert.equal(existsSync(snapshot), false);
  let failed; assert.throws(() => withCanonicalSnapshot((directory) => { failed = directory; throw new Error("body"); })); assert.equal(existsSync(failed), false);
});
