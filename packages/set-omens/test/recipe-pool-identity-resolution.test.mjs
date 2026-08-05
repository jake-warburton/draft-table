import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { completeOmensRecipeCustomCardsAggregateForTest, parseOmensCustomCardsFromTrustedBytes } from "../src/custom-cards.ts";
import { classifyOmensDraftEligibilityForTest } from "../src/draft-eligibility-classification.ts";
import { parseOmensLayoutsFromTrustedBytes } from "../src/layouts.ts";
import { reconcileOfficialUpstreamIdRecordsForTest } from "../src/official-upstream-id-reconciliation.ts";
import { completeOmensRecipePoolsForTest, parseOmensPoolsFromTrustedBytes } from "../src/pools.ts";
import { reconcileOmensRecipeOfficialIdentityRecordsForTest } from "../src/recipe-official-identity-reconciliation.ts";
import { OmensRecipePoolIdentityResolutionError, resolveOmensRecipePoolsToDraftableOfficialIdentitiesForTest } from "../src/recipe-pool-identity-resolution.ts";

const settings = JSON.stringify({ showSlots: true, withReplacement: false, cardBack: "https://cards.invalid/back.png" });
const card = (name, collector_number) => ({ name, collector_number, mana_cost: "2", rarity: "common", type: "action", image_uris: { en: "https://cards.invalid/a.png" } });
const recipeBytes = (name = "Same Source Reference", collector = "OMN100", poolReference = name, pools = [
  ["Wizard", [[3, poolReference]]], ["Rfcommon", [[1, poolReference]]]
]) => Buffer.from(`\ufeff[Settings]\r\n${settings}\r\n[CustomCards]\r\n${JSON.stringify([card(name, collector)])}\r\n[Layouts]\r\n\t- Fictional Layout (1)\r\n\t\t13 Wizard\r\n\t\t1 Rfcommon\r\n${pools.map(([label, entries]) => `[${label}]\r\n${entries.map(([weight, reference]) => `${weight} ${reference}`).join("\r\n")}`).join("\r\n")}`, "utf8");
const forms = Object.freeze([
  Object.freeze({ officialPrintId: "OMN102", baseCollectorId: "OMN102", sourceSet: "OMN", suffixMarker: null }),
  Object.freeze({ officialPrintId: "IAR200-MV", baseCollectorId: "IAR200", sourceSet: "IAR", suffixMarker: "MV" }),
  Object.freeze({ officialPrintId: "OMN100", baseCollectorId: "OMN100", sourceSet: "OMN", suffixMarker: null })
]);
const names = new Map([["OMN100", "Same Source Reference"], ["OMN102", "Open Identity"], ["IAR200", "Excluded Identity"]]);
const source = (nameByBase = names) => forms.map((form, index) => ({ unique_id: `card-${index}`, name: nameByBase.get(form.baseCollectorId), pitch: "", printings: [{ unique_id: `printing-${index}`, set_printing_unique_id: `set-${form.sourceSet}`, id: form.baseCollectorId, set_id: form.sourceSet, edition: "standard", foiling: "standard", rarity: "C", expansion_slot: false, image_url: "https://images.invalid/a.png", art_variations: [] }] }));
const officialExpected = Object.freeze({ entries: 3, omnEntries: 2, iarEntries: 1, omnPrintings: 2, iarPrintings: 1 });
const identityExpected = Object.freeze({ recipeEntries: 1, officialEntries: 3, candidateEntries: 2, mappedEntries: 1, unmappedEntries: 2, unmappedOmn: 1, unmappedIar: 1, unmappedUnsuffixed: 1, unmappedRf: 0, unmappedCf: 0, unmappedMv: 1 });
const eligibilityExpected = Object.freeze({ officialEntries: 3, mappedEntries: 1, mappedIarEntries: 0, excludedEntries: 1, excludedIarEntries: 1, excludedNonIarEntries: 0, unclassifiedEntries: 1, unclassifiedOmnEntries: 1, unclassifiedIarEntries: 0, unclassifiedUnsuffixed: 1, unclassifiedRf: 0, unclassifiedCf: 0, unclassifiedMv: 0 });
const capabilities = ({ bytes = recipeBytes(), officialNames = names } = {}) => {
  const recipe = completeOmensRecipeCustomCardsAggregateForTest(parseOmensCustomCardsFromTrustedBytes(bytes), { common: 1, rare: 0, mythic: 0 });
  const pools = completeOmensRecipePoolsForTest(parseOmensPoolsFromTrustedBytes(bytes), parseOmensLayoutsFromTrustedBytes(bytes), recipe);
  const official = reconcileOfficialUpstreamIdRecordsForTest(forms, source(officialNames), officialExpected);
  const identities = reconcileOmensRecipeOfficialIdentityRecordsForTest(recipe, official, identityExpected);
  const eligibility = classifyOmensDraftEligibilityForTest(identities, official, eligibilityExpected);
  return { pools, identities, eligibility };
};
const resolve = (parts = capabilities()) => resolveOmensRecipePoolsToDraftableOfficialIdentitiesForTest(parts.pools, parts.identities, parts.eligibility);
const safe = (action) => assert.throws(action, (error) => {
  assert.ok(error instanceof OmensRecipePoolIdentityResolutionError);
  assert.equal(error.code, "OMENS_RECIPE_POOL_IDENTITY_RESOLUTION_FAILED");
  assert.equal(error.message, "Omens recipe pool identity resolution failed.");
  assert.equal(error.stack, "OmensRecipePoolIdentityResolutionError: Omens recipe pool identity resolution failed.");
  assert.deepEqual(JSON.parse(JSON.stringify(error)), { name: "OmensRecipePoolIdentityResolutionError", code: "OMENS_RECIPE_POOL_IDENTITY_RESOLUTION_FAILED" });
  assert.doesNotMatch(`${error.message}${error.stack}${JSON.stringify(error)}`, /Same|Source|OMN|IAR|Wizard|Rfcommon|[0-9]|https?:|\\|\//i);
  return true;
});

test("staged exact pool reference ownership resolves collector-first to a draftable official identity in source order", () => {
  assert.deepEqual(resolve(), [
    { sourcePoolLabel: "Wizard", fabRarity: "common", recipePoolCategory: "normal", entries: [{ weight: 3, officialIdentity: { baseCollectorId: "OMN100", cardUniqueId: "card-2" } }] },
    { sourcePoolLabel: "Rfcommon", fabRarity: "common", recipePoolCategory: "rainbow-foil", entries: [{ weight: 1, officialIdentity: { baseCollectorId: "OMN100", cardUniqueId: "card-2" } }] }
  ]);
});

test("resolved facts are deeply immutable, fresh, copy-independent, and select no printing or treatment", () => {
  const parts = capabilities(), first = resolve(parts), second = resolve(parts);
  assert.ok(Object.isFrozen(first)); assert.notEqual(first, second);
  for (let pool = 0; pool < first.length; pool++) {
    assert.ok(Object.isFrozen(first[pool])); assert.ok(Object.isFrozen(first[pool].entries)); assert.notEqual(first[pool], second[pool]); assert.notEqual(first[pool].entries, second[pool].entries);
    for (let entry = 0; entry < first[pool].entries.length; entry++) { assert.ok(Object.isFrozen(first[pool].entries[entry])); assert.ok(Object.isFrozen(first[pool].entries[entry].officialIdentity)); assert.notEqual(first[pool].entries[entry], second[pool].entries[entry]); assert.notEqual(first[pool].entries[entry].officialIdentity, second[pool].entries[entry].officialIdentity); }
  }
  assert.throws(() => first.push({}), TypeError); assert.throws(() => { first[0].entries[0].weight = 9; }, TypeError);
  const serialized = JSON.stringify(first);
  assert.doesNotMatch(serialized, /Same Source Reference|officialPrintId|suffix|foiling|printing|treatment|image|slot/i);
});

test("forged or copied capabilities, unresolved ownership, and case spacing or NFC drift fail closed", () => {
  const parts = capabilities();
  safe(() => resolve({ ...parts, pools: structuredClone(parts.pools) }));
  safe(() => resolve({ ...parts, identities: structuredClone(parts.identities) }));
  safe(() => resolve({ ...parts, eligibility: structuredClone(parts.eligibility) }));
  for (const reference of ["same Source Reference", "Same  Source Reference", "Same Source Refe\u0301rence", "Foreign Reference"]) {
    assert.throws(() => capabilities({ bytes: recipeBytes("Same Source Reference", "OMN100", reference) }));
  }
});

test("collector-first identity and exact eligibility ownership reject cross-capability drift", () => {
  const parts = capabilities();
  const alternateNames = new Map(names); alternateNames.set("OMN100", "Different Official Name");
  assert.throws(() => capabilities({ officialNames: alternateNames }));
  const foreign = capabilities({ bytes: recipeBytes("Foreign Recipe Owner", "OMN100"), officialNames: new Map(names).set("OMN100", "Foreign Recipe Owner") });
  safe(() => resolve({ pools: parts.pools, identities: foreign.identities, eligibility: foreign.eligibility }));
  safe(() => resolve({ pools: parts.pools, identities: parts.identities, eligibility: foreign.eligibility }));
});

test("source pool and entry order, weights, duplicate-across-pool semantics, and category are retained exactly", () => {
  const bytes = recipeBytes("Same Source Reference", "OMN100", "Same Source Reference", [["Rfcommon", [[7, "Same Source Reference"]]], ["Wizard", [[2, "Same Source Reference"]]]]);
  assert.deepEqual(resolve(capabilities({ bytes })), [
    { sourcePoolLabel: "Rfcommon", fabRarity: "common", recipePoolCategory: "rainbow-foil", entries: [{ weight: 7, officialIdentity: { baseCollectorId: "OMN100", cardUniqueId: "card-2" } }] },
    { sourcePoolLabel: "Wizard", fabRarity: "common", recipePoolCategory: "normal", entries: [{ weight: 2, officialIdentity: { baseCollectorId: "OMN100", cardUniqueId: "card-2" } }] }
  ]);
});

test("no caller-supplied policy or aggregate override is accepted", () => {
  const parts = capabilities();
  safe(() => resolveOmensRecipePoolsToDraftableOfficialIdentitiesForTest(parts.pools, parts.identities, parts.eligibility, { allow: "excluded" }));
});

const mutationModuleKey = "DRAFT_TABLE_TEST_RECIPE_POOL_IDENTITY_RESOLUTION_MODULE";
const sourcePath = new URL("../src/recipe-pool-identity-resolution.ts", import.meta.url);
const withCanonicalSnapshot = (action) => {
  let directory;
  try {
    directory = mkdtempSync(join(tmpdir(), "draft-table-recipe-pool-identity-mutation-"));
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
    layouts: await import(new URL("layouts.ts", directory)), pools: await import(new URL("pools.ts", directory)),
    identity: await import(new URL("recipe-official-identity-reconciliation.ts", directory)), upstream: await import(new URL("official-upstream-id-reconciliation.ts", directory))
  };
};
const mutationRecipeBytes = (recipeCards, poolRows) => Buffer.from(`\ufeff[Settings]\r\n${settings}\r\n[CustomCards]\r\n${JSON.stringify(recipeCards)}\r\n[Layouts]\r\n\t- Mutation Layout (1)\r\n${poolRows.map(([label], index) => `\t\t${index === 0 ? 14 - poolRows.length + 1 : 1} ${label}`).join("\r\n")}\r\n${poolRows.map(([label, poolEntries]) => `[${label}]\r\n${poolEntries.map(([weight, reference]) => `${weight} ${reference}`).join("\r\n")}`).join("\r\n")}`, "utf8");
const mutationCapabilities = (m, recipeCards, poolRows, inputForms, sourceNames, { completePools = true } = {}) => {
  const bytes = mutationRecipeBytes(recipeCards, poolRows);
  const counts = recipeCards.reduce((aggregate, entry) => ({ ...aggregate, [entry.rarity]: aggregate[entry.rarity] + 1 }), { common: 0, rare: 0, mythic: 0 });
  const references = m.custom.completeOmensRecipeCustomCardsAggregateForTest(m.custom.parseOmensCustomCardsFromTrustedBytes(bytes), counts);
  const parsedPools = m.pools.parseOmensPoolsFromTrustedBytes(bytes);
  const pools = completePools ? m.pools.completeOmensRecipePoolsForTest(parsedPools, m.layouts.parseOmensLayoutsFromTrustedBytes(bytes), references) : parsedPools;
  const sourceRecords = inputForms.map((form, index) => ({ unique_id: `mutation-card-${index}`, name: sourceNames.get(form.baseCollectorId), pitch: "", printings: [{ unique_id: `mutation-printing-${index}`, set_printing_unique_id: `mutation-set-${form.sourceSet}`, id: form.baseCollectorId, set_id: form.sourceSet, edition: "standard", foiling: "standard", rarity: "C", expansion_slot: false, image_url: "https://images.invalid/a.png", art_variations: [] }] }));
  const officialAggregate = { entries: inputForms.length, omnEntries: inputForms.filter((form) => form.sourceSet === "OMN").length, iarEntries: inputForms.filter((form) => form.sourceSet === "IAR").length, omnPrintings: inputForms.filter((form) => form.sourceSet === "OMN").length, iarPrintings: inputForms.filter((form) => form.sourceSet === "IAR").length };
  const official = m.upstream.reconcileOfficialUpstreamIdRecordsForTest(Object.freeze(inputForms.map(Object.freeze)), sourceRecords, officialAggregate);
  const candidateEntries = inputForms.filter((form) => form.sourceSet === "OMN" && form.suffixMarker === null).length;
  const mappedEntries = recipeCards.length;
  const unmapped = inputForms.filter((form) => !recipeCards.some((entry) => entry.collector_number === form.baseCollectorId));
  const identities = m.identity.reconcileOmensRecipeOfficialIdentityRecordsForTest(references, official, {
    recipeEntries: recipeCards.length, officialEntries: inputForms.length, candidateEntries, mappedEntries, unmappedEntries: unmapped.length,
    unmappedOmn: unmapped.filter((form) => form.sourceSet === "OMN").length, unmappedIar: unmapped.filter((form) => form.sourceSet === "IAR").length,
    unmappedUnsuffixed: unmapped.filter((form) => form.suffixMarker === null).length, unmappedRf: unmapped.filter((form) => form.suffixMarker === "RF").length,
    unmappedCf: unmapped.filter((form) => form.suffixMarker === "CF").length, unmappedMv: unmapped.filter((form) => form.suffixMarker === "MV").length
  });
  const excluded = unmapped.filter((form) => form.sourceSet === "IAR"), unclassified = unmapped.filter((form) => form.sourceSet !== "IAR");
  const eligibility = m.eligibility.classifyOmensDraftEligibilityForTest(identities, official, {
    officialEntries: inputForms.length, mappedEntries, mappedIarEntries: 0, excludedEntries: excluded.length, excludedIarEntries: excluded.length, excludedNonIarEntries: 0,
    unclassifiedEntries: unclassified.length, unclassifiedOmnEntries: unclassified.length, unclassifiedIarEntries: 0,
    unclassifiedUnsuffixed: unclassified.filter((form) => form.suffixMarker === null).length, unclassifiedRf: unclassified.filter((form) => form.suffixMarker === "RF").length,
    unclassifiedCf: unclassified.filter((form) => form.suffixMarker === "CF").length, unclassifiedMv: unclassified.filter((form) => form.suffixMarker === "MV").length
  });
  return { pools, identities, eligibility };
};
const ownershipContract = "every pool entry resolves through its exact validated same-source owner", ownershipMarker = "RECIPE_POOL_REFERENCE_OWNERSHIP_CONTRACT_EXECUTED";
test(ownershipContract, async () => {
  console.log(ownershipMarker); const m = await loadMutationModules();
  const recipeCards = [card("First Owner", "OMN100"), card("Second Owner", "OMN101")];
  const inputForms = [{ officialPrintId: "OMN100", baseCollectorId: "OMN100", sourceSet: "OMN", suffixMarker: null }, { officialPrintId: "OMN101", baseCollectorId: "OMN101", sourceSet: "OMN", suffixMarker: null }, { officialPrintId: "IAR200-MV", baseCollectorId: "IAR200", sourceSet: "IAR", suffixMarker: "MV" }];
  const parts = mutationCapabilities(m, recipeCards, [["Wizard", [[2, "First Owner"]]], ["Generic", [[5, "Second Owner"]]]], inputForms, new Map([["OMN100", "First Owner"], ["OMN101", "Second Owner"], ["IAR200", "Excluded"]]));
  let result; assert.doesNotThrow(() => { result = m.resolution.resolveOmensRecipePoolsToDraftableOfficialIdentitiesForTest(parts.pools, parts.identities, parts.eligibility); }, "EXACT_POOL_ENTRY_OWNER_MUST_BE_USED");
  assert.deepEqual(result.flatMap((pool) => pool.entries.map((entry) => entry.officialIdentity.baseCollectorId)), ["OMN100", "OMN101"], "EXACT_POOL_ENTRY_OWNER_MUST_BE_USED");
});
test("pool-reference ownership semantic mutation fails its exact named contract", () => {
  const original = readFileSync(sourcePath, "utf8");
  const mutated = original.replace("readCompletedOmensRecipePoolEntryOwner(pools, entry)", "readCompletedOmensRecipePoolEntryOwner(pools, pools.pools[0].entries[0])");
  assert.notEqual(mutated, original);
  withCanonicalSnapshot((directory) => {
    const path = join(directory, "recipe-pool-identity-resolution.ts"); writeFileSync(path, mutated);
    const environment = { ...process.env, [mutationModuleKey]: pathToFileURL(path).href }; delete environment.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--test-name-pattern", `^${ownershipContract}$`, fileURLToPath(import.meta.url)], { encoding: "utf8", env: environment });
    const lines = result.stdout.split(/\r?\n/);
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(lines.filter((line) => line === `# ${ownershipMarker}`).length, 1);
    assert.equal(lines.filter((line) => /^not ok \d+ - /.test(line) && line.endsWith(ownershipContract)).length, 1);
    assert.equal(lines.filter((line) => line.includes("EXACT_POOL_ENTRY_OWNER_MUST_BE_USED")).length, 1);
  });
});

const collectorContract = "pool ownership resolves identity collector-first and never by upstream-derived name", collectorMarker = "RECIPE_POOL_COLLECTOR_FIRST_IDENTITY_CONTRACT_EXECUTED";
test(collectorContract, async () => {
  console.log(collectorMarker); const m = await loadMutationModules();
  const poolParts = mutationCapabilities(m, [card("Shared Name", "OMN100")], [["Wizard", [[1, "Shared Name"]]]], [{ officialPrintId: "OMN100", baseCollectorId: "OMN100", sourceSet: "OMN", suffixMarker: null }, { officialPrintId: "IAR200-MV", baseCollectorId: "IAR200", sourceSet: "IAR", suffixMarker: "MV" }], new Map([["OMN100", "Shared Name"], ["IAR200", "Excluded"]]));
  const identityParts = mutationCapabilities(m, [card("Shared Name", "OMN101")], [["Wizard", [[1, "Shared Name"]]]], [{ officialPrintId: "OMN101", baseCollectorId: "OMN101", sourceSet: "OMN", suffixMarker: null }, { officialPrintId: "IAR200-MV", baseCollectorId: "IAR200", sourceSet: "IAR", suffixMarker: "MV" }], new Map([["OMN101", "Shared Name"], ["IAR200", "Excluded"]]));
  assert.throws(() => m.resolution.resolveOmensRecipePoolsToDraftableOfficialIdentitiesForTest(poolParts.pools, identityParts.identities, identityParts.eligibility), m.resolution.OmensRecipePoolIdentityResolutionError, "COLLECTOR_FIRST_MUST_REJECT_DIRECT_NAME_JOIN");
});
test("collector-first semantic mutation fails its exact named contract", () => {
  const original = readFileSync(sourcePath, "utf8");
  const mutated = original
    .replace("identityByRecipeCollector.get(owner.collectorNumber) ?? fail()", "identities.mapped.find((candidate) => candidate.recipeName === owner.name) ?? fail()")
    .replace("identity.recipeCollectorNumber !== owner.collectorNumber || identity.recipeName", "false || identity.recipeName")
    .replace("if (normalOwnership.size !== identityByRecipeCollector.size ||\n    [...identityByRecipeCollector.keys()].some((collector) => normalOwnership.get(collector) !== 1)) fail();", "if (false) fail();");
  assert.notEqual(mutated, original);
  withCanonicalSnapshot((directory) => {
    const path = join(directory, "recipe-pool-identity-resolution.ts"); writeFileSync(path, mutated);
    const environment = { ...process.env, [mutationModuleKey]: pathToFileURL(path).href }; delete environment.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--test-name-pattern", `^${collectorContract}$`, fileURLToPath(import.meta.url)], { encoding: "utf8", env: environment });
    const lines = result.stdout.split(/\r?\n/);
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(lines.filter((line) => line === `# ${collectorMarker}`).length, 1);
    assert.equal(lines.filter((line) => /^not ok \d+ - /.test(line) && line.endsWith(collectorContract)).length, 1);
    assert.equal(lines.filter((line) => line.includes("COLLECTOR_FIRST_MUST_REJECT_DIRECT_NAME_JOIN")).length, 1);
  });
});

const draftableContract = "only exact draftable eligibility facts can enter resolved recipe pools", draftableMarker = "RECIPE_POOL_DRAFTABLE_ONLY_CONTRACT_EXECUTED";
test(draftableContract, async () => {
  console.log(draftableMarker); const m = await loadMutationModules(); const parts = mutationCapabilities(m, [card("Draftable Owner", "OMN100")], [["Wizard", [[1, "Draftable Owner"]]]], [
    { officialPrintId: "IAR200-MV", baseCollectorId: "IAR200", sourceSet: "IAR", suffixMarker: "MV" },
    { officialPrintId: "OMN102", baseCollectorId: "OMN102", sourceSet: "OMN", suffixMarker: null },
    { officialPrintId: "OMN100", baseCollectorId: "OMN100", sourceSet: "OMN", suffixMarker: null }
  ], new Map([["OMN100", "Draftable Owner"], ["OMN102", "Open"], ["IAR200", "Excluded"]]));
  const result = m.resolution.resolveOmensRecipePoolsToDraftableOfficialIdentitiesForTest(parts.pools, parts.identities, parts.eligibility);
  assert.deepEqual(result[0].entries[0].officialIdentity, { baseCollectorId: "OMN100", cardUniqueId: "mutation-card-2" }, "ONLY_DRAFTABLE_EXACT_IDENTITY_MAY_ENTER_POOL");
});
test("draftable-only eligibility semantic mutation fails its exact named contract", () => {
  const original = readFileSync(sourcePath, "utf8");
  const mutated = original
    .replace("eligibilityByPrint.get(identity.officialPrintId) ?? fail()", "eligibility.find((fact) => fact.draftEligibility !== \"draftable\") ?? fail()")
    .replace("if (draftFact.officialPrintId !== identity.officialPrintId || draftFact.baseCollectorId !== identity.officialBaseCollectorId ||\n        draftFact.officialCardUniqueId !== identity.officialCardUniqueId || draftFact.draftEligibility !== \"draftable\") fail();", "if (false) fail();")
    .replace("baseCollectorId: identity.officialBaseCollectorId,\n        cardUniqueId: identity.officialCardUniqueId", "baseCollectorId: draftFact.baseCollectorId,\n        cardUniqueId: draftFact.officialCardUniqueId");
  assert.notEqual(mutated, original);
  withCanonicalSnapshot((directory) => {
    const path = join(directory, "recipe-pool-identity-resolution.ts"); writeFileSync(path, mutated);
    const environment = { ...process.env, [mutationModuleKey]: pathToFileURL(path).href }; delete environment.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--test-name-pattern", `^${draftableContract}$`, fileURLToPath(import.meta.url)], { encoding: "utf8", env: environment });
    const lines = result.stdout.split(/\r?\n/);
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(lines.filter((line) => line === `# ${draftableMarker}`).length, 1);
    assert.equal(lines.filter((line) => /^not ok \d+ - /.test(line) && line.endsWith(draftableContract)).length, 1);
    assert.equal(lines.filter((line) => line.includes("ONLY_DRAFTABLE_EXACT_IDENTITY_MAY_ENTER_POOL")).length, 1);
  });
});

test("mutation snapshots are file-local OS-temp canonical copies and always clean", () => {
  let snapshot; withCanonicalSnapshot((directory) => { snapshot = directory; assert.ok(directory.startsWith(tmpdir())); assert.equal(directory.startsWith(`${resolvePath(fileURLToPath(new URL("../../..", import.meta.url)))}${sep}`), false); }); assert.equal(existsSync(snapshot), false);
  let failed; assert.throws(() => withCanonicalSnapshot((directory) => { failed = directory; throw new Error("body"); })); assert.equal(existsSync(failed), false);
});
