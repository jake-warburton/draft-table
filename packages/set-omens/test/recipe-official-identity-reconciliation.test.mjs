import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import {
  completeOmensRecipeCustomCardsAggregateForTest,
  parseOmensCustomCardsFromTrustedBytes
} from "../src/custom-cards.ts";
import {
  OfficialUpstreamIdReconciliationError,
  reconcileOfficialUpstreamIdRecordsForTest
} from "../src/official-upstream-id-reconciliation.ts";
import {
  OmensRecipeOfficialIdentityReconciliationError,
  reconcileOmensRecipeOfficialIdentityRecordsForTest
} from "../src/recipe-official-identity-reconciliation.ts";

const settings = JSON.stringify({ showSlots: true, withReplacement: false, cardBack: "https://cards.invalid/back.png" });
const card = (name, collector_number, rarity = "common") => ({ name, collector_number, mana_cost: "2", rarity, type: "action", image_uris: { en: "https://cards.invalid/a.png" } });
const recipeBytes = (cards) => Buffer.from(`\ufeff[Settings]\r\n${settings}\r\n[CustomCards]\r\n${JSON.stringify(cards)}\r\n[Layouts]\r\nopaque`, "utf8");
const recipeCards = Object.freeze([
  card("Fictional C (blue)", "OMN103", "mythic"),
  card("Fictional A (red)", "OMN100", "common"),
  card("Fictional B (yellow)", "OMN101", "rare")
]);
const recipeAggregate = Object.freeze({ common: 1, rare: 1, mythic: 1 });
const recipe = (cards = recipeCards, aggregate = recipeAggregate) => completeOmensRecipeCustomCardsAggregateForTest(parseOmensCustomCardsFromTrustedBytes(recipeBytes(cards)), aggregate);

const forms = Object.freeze([
  Object.freeze({ officialPrintId: "OMN102-RF", baseCollectorId: "OMN102", sourceSet: "OMN", suffixMarker: "RF" }),
  Object.freeze({ officialPrintId: "OMN100", baseCollectorId: "OMN100", sourceSet: "OMN", suffixMarker: null }),
  Object.freeze({ officialPrintId: "IAR200-MV", baseCollectorId: "IAR200", sourceSet: "IAR", suffixMarker: "MV" }),
  Object.freeze({ officialPrintId: "OMN104", baseCollectorId: "OMN104", sourceSet: "OMN", suffixMarker: null }),
  Object.freeze({ officialPrintId: "OMN101", baseCollectorId: "OMN101", sourceSet: "OMN", suffixMarker: null }),
  Object.freeze({ officialPrintId: "OMN103", baseCollectorId: "OMN103", sourceSet: "OMN", suffixMarker: null })
]);
const names = Object.freeze(new Map([
  ["OMN100", "Fictional A"], ["OMN101", "Fictional B"], ["OMN102", "Fictional Foil"],
  ["OMN103", "Fictional C"], ["OMN104", "Fictional Later"], ["IAR200", "Fictional Cross Set"]
]));
const pitches = Object.freeze(new Map([
  ["OMN100", "1"], ["OMN101", "2"], ["OMN102", "1"],
  ["OMN103", "3"], ["OMN104", ""], ["IAR200", ""]
]));
const printing = (form, index) => ({
  unique_id: `printing-${index}`,
  set_printing_unique_id: form.sourceSet === "OMN" ? "set-printing-omn" : "set-printing-iar",
  id: form.baseCollectorId,
  set_id: form.sourceSet,
  edition: "standard",
  foiling: "standard",
  rarity: "source-rarity",
  expansion_slot: false,
  image_url: "https://images.invalid/a.png",
  art_variations: []
});
const officialSource = (inputForms = forms, nameByBase = names, pitchByBase = pitches) => inputForms.map((form, index) => ({
  unique_id: `card-${index}`,
  name: nameByBase.get(form.baseCollectorId),
  pitch: pitchByBase.get(form.baseCollectorId) ?? "",
  printings: [printing(form, index)]
}));
const officialAggregate = Object.freeze({ entries: 6, omnEntries: 5, iarEntries: 1, omnPrintings: 5, iarPrintings: 1 });
const official = (inputForms = forms, source = officialSource(inputForms), aggregate = officialAggregate) => reconcileOfficialUpstreamIdRecordsForTest(inputForms, source, aggregate);
const expected = Object.freeze({
  recipeEntries: 3,
  officialEntries: 6,
  candidateEntries: 4,
  mappedEntries: 3,
  unmappedEntries: 3,
  unmappedOmn: 2,
  unmappedIar: 1,
  unmappedUnsuffixed: 1,
  unmappedRf: 1,
  unmappedCf: 0,
  unmappedMv: 1
});
const reconcile = (references = recipe(), records = official(), aggregate = expected) => reconcileOmensRecipeOfficialIdentityRecordsForTest(references, records, aggregate);
const safe = (action) => assert.throws(action, (error) => {
  assert.ok(error instanceof OmensRecipeOfficialIdentityReconciliationError);
  assert.equal(error.code, "OMENS_RECIPE_OFFICIAL_IDENTITY_RECONCILIATION_FAILED");
  assert.equal(error.message, "Omens recipe official identity reconciliation failed.");
  assert.equal(error.stack, "OmensRecipeOfficialIdentityReconciliationError: Omens recipe official identity reconciliation failed.");
  assert.deepEqual(JSON.parse(JSON.stringify(error)), { name: "OmensRecipeOfficialIdentityReconciliationError", code: "OMENS_RECIPE_OFFICIAL_IDENTITY_RECONCILIATION_FAILED" });
  assert.doesNotMatch(`${error.message}${error.stack}${JSON.stringify(error)}`, /Fictional|OMN|IAR|[0-9]|https?:|\\|\//i);
  return true;
});

test("dual capabilities join exact name and collector identity in recipe order and preserve canonical unmapped order", () => {
  const result = reconcile();
  assert.deepEqual(result.mapped, [
    { recipeName: "Fictional C (blue)", recipeCollectorNumber: "OMN103", recipeRarityLabel: "mythic", officialPrintId: "OMN103", officialBaseCollectorId: "OMN103", officialCardUniqueId: "card-5" },
    { recipeName: "Fictional A (red)", recipeCollectorNumber: "OMN100", recipeRarityLabel: "common", officialPrintId: "OMN100", officialBaseCollectorId: "OMN100", officialCardUniqueId: "card-1" },
    { recipeName: "Fictional B (yellow)", recipeCollectorNumber: "OMN101", recipeRarityLabel: "rare", officialPrintId: "OMN101", officialBaseCollectorId: "OMN101", officialCardUniqueId: "card-4" }
  ]);
  assert.deepEqual(result.unmapped, [
    { officialPrintId: "OMN102-RF", baseCollectorId: "OMN102", sourceSetMarker: "OMN", suffixMarker: "RF" },
    { officialPrintId: "IAR200-MV", baseCollectorId: "IAR200", sourceSetMarker: "IAR", suffixMarker: "MV" },
    { officialPrintId: "OMN104", baseCollectorId: "OMN104", sourceSetMarker: "OMN", suffixMarker: null }
  ]);
  assert.equal("excluded" in result, false);
  assert.equal(result.mapped.every((entry) => !Object.hasOwn(entry, "printings") && !Object.hasOwn(entry, "sourceSetMarker") && !Object.hasOwn(entry, "suffixMarker")), true);
});

test("red, yellow, blue, and pitchless source facts derive exact recipe-name correspondence without rewriting recipe strings", () => {
  const result = reconcile();
  assert.deepEqual(result.mapped.map((entry) => entry.recipeName), ["Fictional C (blue)", "Fictional A (red)", "Fictional B (yellow)"]);
  const pitchlessRecipe = recipe([card("Fictional Later", "OMN104")], { common: 1, rare: 0, mythic: 0 });
  const pitchless = reconcileOmensRecipeOfficialIdentityRecordsForTest(pitchlessRecipe, official(), { ...expected, recipeEntries: 1, mappedEntries: 1, unmappedEntries: 5, unmappedOmn: 4, unmappedUnsuffixed: 3 });
  assert.equal(pitchless.mapped[0].recipeName, "Fictional Later");
});

test("mapped and unmapped facts are deeply immutable, fresh, and copy-independent", () => {
  const result = reconcile(); const again = reconcile();
  assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.mapped)); assert.ok(Object.isFrozen(result.unmapped));
  assert.ok(result.mapped.every(Object.isFrozen)); assert.ok(result.unmapped.every(Object.isFrozen));
  assert.notEqual(result, again); assert.notEqual(result.mapped, again.mapped); assert.notEqual(result.unmapped, again.unmapped);
  assert.notEqual(result.mapped[0], again.mapped[0]); assert.notEqual(result.unmapped[0], again.unmapped[0]);
  assert.throws(() => { result.mapped[0].recipeName = "changed"; }, TypeError);
  assert.throws(() => { result.unmapped.push({}); }, TypeError);
});

test("only exact completed parser and official reconciliation capabilities are accepted", async () => {
  const references = recipe(); const records = official();
  safe(() => reconcileOmensRecipeOfficialIdentityRecordsForTest(Object.freeze([...references]), records, expected));
  safe(() => reconcileOmensRecipeOfficialIdentityRecordsForTest(references, Object.freeze([...records]), expected));
  safe(() => reconcileOmensRecipeOfficialIdentityRecordsForTest(Object.freeze(recipeCards.map((entry) => Object.freeze({ name: entry.name, collectorNumber: entry.collector_number, rarity: entry.rarity }))), records, expected));
  const boundary = await import("../src/schema-validation.ts");
  safe(() => boundary.reconcileOmensRecipeCustomCardsWithOfficialUpstreamIdentities(Object.freeze([]), Object.freeze([])));
});

test("exact matching rejects name-only, collector-only, swapped-name, case, compatibility, numeric, missing, suffix-stripped, and cross-set candidates", () => {
  const mismatchCases = [
    [card("Fictional A (red)", "OMN999"), "name only"],
    [card("Wrong Name", "OMN100"), "collector only"],
    [card("fictional a (red)", "OMN100"), "case folded"],
    [card("Ｆictional A (red)", "OMN100"), "compatibility normalized"],
    [card("Fictional A (red)", "omn100"), "collector case folded"],
    [card("Fictional A (red)", "OMN0100"), "numeric derived"],
    [card("Absent", "OMN999"), "missing"],
    [card("Fictional A", "OMN100"), "missing colour"],
    [card("Fictional A (yellow)", "OMN100"), "wrong colour"],
    [card("Fictional A(red)", "OMN100"), "spacing rewritten"],
    [card("Fictional Foil (red)", "OMN102"), "suffix stripped"]
  ];
  for (const [changed, label] of mismatchCases) {
    const cards = [{ ...recipeCards[0] }, changed, { ...recipeCards[2] }];
    safe(() => reconcile(recipe(cards), official(), expected), label);
  }
  const swapped = [card("Fictional B (red)", "OMN100", "common"), card("Fictional A (yellow)", "OMN101", "rare"), recipeCards[0]];
  safe(() => reconcile(recipe(swapped), official(), expected));
  const pitchedPitchless = [recipeCards[0], card("Fictional Later (red)", "OMN104"), recipeCards[2]];
  safe(() => reconcile(recipe(pitchedPitchless), official(), expected));

  const crossSetForms = Object.freeze(forms.map((form) => form.baseCollectorId === "IAR200"
    ? Object.freeze({ ...form, officialPrintId: "IAR200", suffixMarker: null })
    : form));
  const crossSetExpected = { ...expected, unmappedUnsuffixed: 2, unmappedMv: 0 };
  const crossSetRecipe = recipe([recipeCards[0], card("Fictional Cross Set", "IAR200", "common"), recipeCards[2]]);
  safe(() => reconcile(crossSetRecipe, official(crossSetForms, officialSource(crossSetForms)), crossSetExpected));

  const rewrittenPrintForms = Object.freeze(forms.map((form) => form.baseCollectorId === "OMN100"
    ? Object.freeze({ ...form, officialPrintId: "OMN100-RF" })
    : form));
  safe(() => reconcile(recipe(), official(rewrittenPrintForms, officialSource(rewrittenPrintForms)), expected));
});

test("candidate derived-name collisions reject before mapping while noncandidate collisions do not false-alarm", () => {
  const candidateNames = new Map(names); candidateNames.set("OMN104", "Fictional A");
  const candidatePitches = new Map(pitches); candidatePitches.set("OMN104", "1");
  safe(() => reconcile(recipe(), official(forms, officialSource(forms, candidateNames, candidatePitches))));

  const noncandidateNames = new Map(names); noncandidateNames.set("OMN102", "Fictional A"); noncandidateNames.set("IAR200", "Fictional A");
  const noncandidatePitches = new Map(pitches); noncandidatePitches.set("OMN102", "1"); noncandidatePitches.set("IAR200", "1");
  assert.equal(reconcile(recipe(), official(forms, officialSource(forms, noncandidateNames, noncandidatePitches))).mapped.length, 3);
});

test("trimmed and duplicate recipe facts and ambiguous or duplicate official ownership fail before joining", () => {
  assert.throws(() => parseOmensCustomCardsFromTrustedBytes(recipeBytes([card(" Fictional A", "OMN100")])), /custom cards are invalid/i);
  assert.throws(() => parseOmensCustomCardsFromTrustedBytes(recipeBytes([card("Fictional A", "OMN100"), card("Fictional A", "OMN101")])), /custom cards are invalid/i);
  const duplicatedForms = Object.freeze([forms[0], Object.freeze({ ...forms[0], officialPrintId: "OMN102-CF", suffixMarker: "CF" })]);
  assert.throws(() => reconcileOfficialUpstreamIdRecordsForTest(duplicatedForms, [], { entries: 2, omnEntries: 2, iarEntries: 0, omnPrintings: 0, iarPrintings: 0 }), OfficialUpstreamIdReconciliationError);
  const source = officialSource(); source.push({ ...source[1], unique_id: "ambiguous-owner", printings: [{ ...source[1].printings[0], unique_id: "ambiguous-printing" }] });
  assert.throws(() => official(forms, source), OfficialUpstreamIdReconciliationError);
});

test("partition ownership covers each official identity exactly once and every aggregate drift fails closed", () => {
  const result = reconcile();
  const partition = [...result.mapped.map((entry) => entry.officialPrintId), ...result.unmapped.map((entry) => entry.officialPrintId)];
  assert.equal(partition.length, forms.length); assert.equal(new Set(partition).size, forms.length);
  assert.deepEqual([...partition].sort(), forms.map((entry) => entry.officialPrintId).sort());
  for (const key of Object.keys(expected)) safe(() => reconcile(recipe(), official(), { ...expected, [key]: expected[key] + 1 }));
});

test("mapped and unmapped still total 260 when one identity crosses the accepted partition, but the accepted aggregate rejects it", () => {
  const base = (set, index) => `${set}${String(index).padStart(3, "0")}`;
  const largeForms = [
    ...Array.from({ length: 242 }, (_, index) => Object.freeze({ officialPrintId: base("OMN", index), baseCollectorId: base("OMN", index), sourceSet: "OMN", suffixMarker: null })),
    ...Array.from({ length: 6 }, (_, offset) => Object.freeze({ officialPrintId: `${base("OMN", 242 + offset)}-RF`, baseCollectorId: base("OMN", 242 + offset), sourceSet: "OMN", suffixMarker: "RF" })),
    ...Array.from({ length: 3 }, (_, offset) => Object.freeze({ officialPrintId: `${base("OMN", 248 + offset)}-CF`, baseCollectorId: base("OMN", 248 + offset), sourceSet: "OMN", suffixMarker: "CF" })),
    ...Array.from({ length: 9 }, (_, index) => Object.freeze({ officialPrintId: `${base("IAR", index)}-MV`, baseCollectorId: base("IAR", index), sourceSet: "IAR", suffixMarker: "MV" }))
  ];
  const largeNames = new Map(largeForms.map((form, index) => [form.baseCollectorId, `Generated Card ${index}`]));
  const largeSource = officialSource(largeForms, largeNames, new Map());
  const largeOfficial = official(largeForms, largeSource, { entries: 260, omnEntries: 251, iarEntries: 9, omnPrintings: 251, iarPrintings: 9 });
  const largeCards = largeForms.slice(0, 209).map((form, index) => card(index === 208 ? "Partition Crossing" : largeNames.get(form.baseCollectorId), index === 208 ? "OMN999" : form.baseCollectorId));
  const largeRecipe = recipe(largeCards, { common: 209, rare: 0, mythic: 0 });
  const accepted = { recipeEntries: 209, officialEntries: 260, candidateEntries: 242, mappedEntries: 209, unmappedEntries: 51, unmappedOmn: 42, unmappedIar: 9, unmappedUnsuffixed: 33, unmappedRf: 6, unmappedCf: 3, unmappedMv: 9 };
  const drift = reconcileOmensRecipeOfficialIdentityRecordsForTest(largeRecipe, largeOfficial, { ...accepted, mappedEntries: 208, unmappedEntries: 52, unmappedOmn: 43, unmappedUnsuffixed: 34 });
  assert.equal(drift.mapped.length + drift.unmapped.length, 260);
  safe(() => reconcileOmensRecipeOfficialIdentityRecordsForTest(largeRecipe, largeOfficial, accepted));
});

const canonicalModules = Object.freeze([
  "card-vault-face-projection.ts", "card-vault-official-membership.ts", "card-vault-print-id-forms.ts", "card-vault-product-checksum.ts", "card-vault-product-descriptor.ts", "checksum.ts", "custom-cards.ts", "descriptor.ts", "draft-eligibility-classification.ts", "index.ts", "layouts.ts", "official-face-printing-multiplicity-reconciliation.ts", "official-suffix-foiling-classification.ts", "official-upstream-id-reconciliation.ts", "official-upstream-printing-copy.ts", "omn-source-projection.ts", "pools.ts", "public-source-checksum.ts", "public-source-descriptor.ts", "public-source-document.ts", "public-source-schema-validation.ts", "recipe-official-identity-reconciliation.ts", "schema-validation.ts", "settings.ts", "sha256.ts"
]);
const withCanonicalSnapshot = (action, copy = copyFileSync) => {
  let directory;
  try {
    directory = mkdtempSync(join(tmpdir(), "draft-table-recipe-identity-mutation-"));
    const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url));
    for (const file of canonicalModules) copy(join(sourceDirectory, file), join(directory, file));
    symlinkSync(join(sourceDirectory, "../../../node_modules"), join(directory, "node_modules"), "dir");
    return action(directory);
  } finally {
    if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  }
};
const moduleEnvironmentKey = "DRAFT_TABLE_TEST_RECIPE_IDENTITY_RECONCILIATION_MODULE";
const exactContractName = "exact collector guard rejects a name-only match";
const exactMarker = "RECIPE_IDENTITY_EXACT_COLLECTOR_CONTRACT_EXECUTED";

test(exactContractName, async () => {
  console.log(exactMarker);
  const moduleUrl = process.env[moduleEnvironmentKey] ?? new URL("../src/recipe-official-identity-reconciliation.ts", import.meta.url).href;
  const loaded = await import(moduleUrl);
  const sourceDirectory = new URL("./", moduleUrl);
  const custom = await import(new URL("custom-cards.ts", sourceDirectory));
  const upstream = await import(new URL("official-upstream-id-reconciliation.ts", sourceDirectory));
  const references = custom.completeOmensRecipeCustomCardsAggregateForTest(custom.parseOmensCustomCardsFromTrustedBytes(recipeBytes([card("Fictional A (red)", "OMN999")])), { common: 1, rare: 0, mythic: 0 });
  assert.throws(() => loaded.reconcileOmensRecipeOfficialIdentityRecordsForTest(references, upstream.reconcileOfficialUpstreamIdRecordsForTest(forms, officialSource(), officialAggregate), { ...expected, recipeEntries: 1, mappedEntries: 1, unmappedEntries: 5, unmappedOmn: 4, unmappedUnsuffixed: 3 }), loaded.OmensRecipeOfficialIdentityReconciliationError, "EXACT_COLLECTOR_GUARD_REJECTED_NAME_ONLY_MATCH");
});

test("exact collector mutation is caught by its named capability-bound contract", () => {
  const sourcePath = new URL("../src/recipe-official-identity-reconciliation.ts", import.meta.url);
  const original = readFileSync(sourcePath, "utf8");
  const mutated = original.replace("if (entry.baseCollectorId === reference.collectorNumber) collectorMatches.push(index);", "if (derivedRecipeName(entry) === reference.name) collectorMatches.push(index);");
  assert.notEqual(mutated, original, "exact collector guard present");
  withCanonicalSnapshot((directory) => {
    const path = join(directory, "recipe-official-identity-reconciliation.ts"); writeFileSync(path, mutated);
    const environment = { ...process.env, [moduleEnvironmentKey]: pathToFileURL(path).href }; delete environment.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--test-name-pattern", `^${exactContractName}$`, fileURLToPath(import.meta.url)], { encoding: "utf8", env: environment });
    const lines = result.stdout.split(/\r?\n/);
    assert.equal(result.status, 1, `exact collector mutation did not fail named contract\n${result.stdout}\n${result.stderr}`);
    assert.equal(lines.filter((line) => line === `# ${exactMarker}`).length, 1, "exact execution marker");
    assert.equal(lines.filter((line) => /^not ok \d+ - /.test(line) && line.endsWith(exactContractName)).length, 1, "one named not ok");
    assert.equal(lines.filter((line) => line.includes("Missing expected exception") && line.includes("EXACT_COLLECTOR_GUARD_REJECTED_NAME_ONLY_MATCH")).length, 1, "one contract-specific failure line");
  });
});

const nameContractName = "exact name guard rejects a collector-only match";
const nameMarker = "RECIPE_IDENTITY_EXACT_NAME_CONTRACT_EXECUTED";
test(nameContractName, async () => {
  console.log(nameMarker);
  const moduleUrl = process.env[moduleEnvironmentKey] ?? new URL("../src/recipe-official-identity-reconciliation.ts", import.meta.url).href;
  const loaded = await import(moduleUrl);
  const sourceDirectory = new URL("./", moduleUrl);
  const custom = await import(new URL("custom-cards.ts", sourceDirectory));
  const upstream = await import(new URL("official-upstream-id-reconciliation.ts", sourceDirectory));
  const references = custom.completeOmensRecipeCustomCardsAggregateForTest(custom.parseOmensCustomCardsFromTrustedBytes(recipeBytes([card("Wrong Name", "OMN100")])), { common: 1, rare: 0, mythic: 0 });
  assert.throws(() => loaded.reconcileOmensRecipeOfficialIdentityRecordsForTest(references, upstream.reconcileOfficialUpstreamIdRecordsForTest(forms, officialSource(), officialAggregate), { ...expected, recipeEntries: 1, mappedEntries: 1, unmappedEntries: 5, unmappedOmn: 4, unmappedUnsuffixed: 3 }), loaded.OmensRecipeOfficialIdentityReconciliationError, "EXACT_NAME_GUARD_REJECTED_COLLECTOR_ONLY_MATCH");
});

test("exact name mutation is caught by its named capability-bound contract", () => {
  const sourcePath = new URL("../src/recipe-official-identity-reconciliation.ts", import.meta.url);
  const original = readFileSync(sourcePath, "utf8");
  const mutated = original.replace("derivedRecipeName(candidate) !== reference.name", "false");
  assert.notEqual(mutated, original, "exact name guard present");
  withCanonicalSnapshot((directory) => {
    const path = join(directory, "recipe-official-identity-reconciliation.ts"); writeFileSync(path, mutated);
    const environment = { ...process.env, [moduleEnvironmentKey]: pathToFileURL(path).href }; delete environment.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--test-name-pattern", `^${nameContractName}$`, fileURLToPath(import.meta.url)], { encoding: "utf8", env: environment });
    const lines = result.stdout.split(/\r?\n/);
    assert.equal(result.status, 1, `exact name mutation did not fail named contract\n${result.stdout}\n${result.stderr}`);
    assert.equal(lines.filter((line) => line === `# ${nameMarker}`).length, 1, "exact name execution marker");
    assert.equal(lines.filter((line) => /^not ok \d+ - /.test(line) && line.endsWith(nameContractName)).length, 1, "one exact name not ok");
    assert.equal(lines.filter((line) => line.includes("Missing expected exception") && line.includes("EXACT_NAME_GUARD_REJECTED_COLLECTOR_ONLY_MATCH")).length, 1, "one exact name failure line");
  });
});

const colourContractName = "pitch colour mapping derives exact red recipe correspondence";
const colourMarker = "RECIPE_IDENTITY_PITCH_COLOUR_CONTRACT_EXECUTED";
test(colourContractName, async () => {
  console.log(colourMarker);
  const moduleUrl = process.env[moduleEnvironmentKey] ?? new URL("../src/recipe-official-identity-reconciliation.ts", import.meta.url).href;
  const loaded = await import(moduleUrl);
  const sourceDirectory = new URL("./", moduleUrl);
  const custom = await import(new URL("custom-cards.ts", sourceDirectory));
  const upstream = await import(new URL("official-upstream-id-reconciliation.ts", sourceDirectory));
  const references = custom.completeOmensRecipeCustomCardsAggregateForTest(custom.parseOmensCustomCardsFromTrustedBytes(recipeBytes([card("Fictional A (red)", "OMN100")])), { common: 1, rare: 0, mythic: 0 });
  assert.doesNotThrow(() => loaded.reconcileOmensRecipeOfficialIdentityRecordsForTest(references, upstream.reconcileOfficialUpstreamIdRecordsForTest(forms, officialSource(), officialAggregate), { ...expected, recipeEntries: 1, mappedEntries: 1, unmappedEntries: 5, unmappedOmn: 4, unmappedUnsuffixed: 3 }), "PITCH_ONE_MUST_DERIVE_EXACT_RED_CORRESPONDENCE");
});

test("pitch colour mapping mutation is caught by its exact named derived-correspondence contract", () => {
  const sourcePath = new URL("../src/recipe-official-identity-reconciliation.ts", import.meta.url);
  const original = readFileSync(sourcePath, "utf8");
  const mutated = original.replace('if (pitch === "1") return "red";', 'if (pitch === "1") return "yellow";');
  assert.notEqual(mutated, original, "pitch-one colour mapping present");
  withCanonicalSnapshot((directory) => {
    const path = join(directory, "recipe-official-identity-reconciliation.ts"); writeFileSync(path, mutated);
    const environment = { ...process.env, [moduleEnvironmentKey]: pathToFileURL(path).href }; delete environment.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--test-name-pattern", `^${colourContractName}$`, fileURLToPath(import.meta.url)], { encoding: "utf8", env: environment });
    const lines = result.stdout.split(/\r?\n/);
    assert.equal(result.status, 1, `pitch colour mutation did not fail named contract\n${result.stdout}\n${result.stderr}`);
    assert.equal(lines.filter((line) => line === `# ${colourMarker}`).length, 1, "exact pitch colour marker");
    assert.equal(lines.filter((line) => /^not ok \d+ - /.test(line) && line.endsWith(colourContractName)).length, 1, "one pitch colour not ok");
    assert.equal(lines.filter((line) => line.includes("Got unwanted exception") && line.includes("PITCH_ONE_MUST_DERIVE_EXACT_RED_CORRESPONDENCE")).length, 1, "one pitch colour failure line");
  });
});

const pitchlessContractName = "pitchless fallback derives exact bare recipe correspondence";
const pitchlessMarker = "RECIPE_IDENTITY_PITCHLESS_FALLBACK_CONTRACT_EXECUTED";
test(pitchlessContractName, async () => {
  console.log(pitchlessMarker);
  const moduleUrl = process.env[moduleEnvironmentKey] ?? new URL("../src/recipe-official-identity-reconciliation.ts", import.meta.url).href;
  const loaded = await import(moduleUrl);
  const sourceDirectory = new URL("./", moduleUrl);
  const custom = await import(new URL("custom-cards.ts", sourceDirectory));
  const upstream = await import(new URL("official-upstream-id-reconciliation.ts", sourceDirectory));
  const references = custom.completeOmensRecipeCustomCardsAggregateForTest(custom.parseOmensCustomCardsFromTrustedBytes(recipeBytes([card("Fictional Later", "OMN104")])), { common: 1, rare: 0, mythic: 0 });
  assert.doesNotThrow(() => loaded.reconcileOmensRecipeOfficialIdentityRecordsForTest(references, upstream.reconcileOfficialUpstreamIdRecordsForTest(forms, officialSource(), officialAggregate), { ...expected, recipeEntries: 1, mappedEntries: 1, unmappedEntries: 5, unmappedOmn: 4, unmappedUnsuffixed: 3 }), "PITCHLESS_MUST_DERIVE_EXACT_BARE_CORRESPONDENCE");
});

test("pitchless fallback mutation is caught by its exact named bare-correspondence contract", () => {
  const sourcePath = new URL("../src/recipe-official-identity-reconciliation.ts", import.meta.url);
  const original = readFileSync(sourcePath, "utf8");
  const mutated = original.replace("return colour === null ? entry.name :", "return colour === null ? `${entry.name} (red)` :");
  assert.notEqual(mutated, original, "pitchless bare-name fallback present");
  withCanonicalSnapshot((directory) => {
    const path = join(directory, "recipe-official-identity-reconciliation.ts"); writeFileSync(path, mutated);
    const environment = { ...process.env, [moduleEnvironmentKey]: pathToFileURL(path).href }; delete environment.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--test-name-pattern", `^${pitchlessContractName}$`, fileURLToPath(import.meta.url)], { encoding: "utf8", env: environment });
    const lines = result.stdout.split(/\r?\n/);
    assert.equal(result.status, 1, `pitchless fallback mutation did not fail named contract\n${result.stdout}\n${result.stderr}`);
    assert.equal(lines.filter((line) => line === `# ${pitchlessMarker}`).length, 1, "exact pitchless marker");
    assert.equal(lines.filter((line) => /^not ok \d+ - /.test(line) && line.endsWith(pitchlessContractName)).length, 1, "one pitchless not ok");
    assert.equal(lines.filter((line) => line.includes("Got unwanted exception") && line.includes("PITCHLESS_MUST_DERIVE_EXACT_BARE_CORRESPONDENCE")).length, 1, "one pitchless failure line");
  });
});

const partitionContractName = "partition aggregate guard rejects one identity crossing from mapped to unmapped";
const partitionMarker = "RECIPE_IDENTITY_PARTITION_CONTRACT_EXECUTED";
test(partitionContractName, async () => {
  console.log(partitionMarker);
  const moduleUrl = process.env[moduleEnvironmentKey] ?? new URL("../src/recipe-official-identity-reconciliation.ts", import.meta.url).href;
  const loaded = await import(moduleUrl);
  const sourceDirectory = new URL("./", moduleUrl);
  const custom = await import(new URL("custom-cards.ts", sourceDirectory));
  const upstream = await import(new URL("official-upstream-id-reconciliation.ts", sourceDirectory));
  const crossed = recipeCards.map((entry) => entry.collector_number === "OMN103" ? card("Absent", "OMN999", "mythic") : entry);
  const references = custom.completeOmensRecipeCustomCardsAggregateForTest(custom.parseOmensCustomCardsFromTrustedBytes(recipeBytes(crossed)), recipeAggregate);
  assert.throws(() => loaded.reconcileOmensRecipeOfficialIdentityRecordsForTest(references, upstream.reconcileOfficialUpstreamIdRecordsForTest(forms, officialSource(), officialAggregate), { ...expected, unmappedOmn: 3, unmappedUnsuffixed: 2 }), loaded.OmensRecipeOfficialIdentityReconciliationError, "PARTITION_AGGREGATE_GUARD_REJECTED_CROSSING_IDENTITY");
});

test("partition aggregate mutation is caught by its named capability-bound contract", () => {
  const sourcePath = new URL("../src/recipe-official-identity-reconciliation.ts", import.meta.url);
  const original = readFileSync(sourcePath, "utf8");
  const mutated = original.replace("mapped.length !== expected.mappedEntries || unmapped.length !== expected.unmappedEntries ||", "false ||");
  assert.notEqual(mutated, original, "partition aggregate guard present");
  withCanonicalSnapshot((directory) => {
    const path = join(directory, "recipe-official-identity-reconciliation.ts"); writeFileSync(path, mutated);
    const environment = { ...process.env, [moduleEnvironmentKey]: pathToFileURL(path).href }; delete environment.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--test-name-pattern", `^${partitionContractName}$`, fileURLToPath(import.meta.url)], { encoding: "utf8", env: environment });
    const lines = result.stdout.split(/\r?\n/);
    assert.equal(result.status, 1, `partition mutation did not fail named contract\n${result.stdout}\n${result.stderr}`);
    assert.equal(lines.filter((line) => line === `# ${partitionMarker}`).length, 1, "exact partition marker");
    assert.equal(lines.filter((line) => /^not ok \d+ - /.test(line) && line.endsWith(partitionContractName)).length, 1, "one partition not ok");
    assert.equal(lines.filter((line) => line.includes("Missing expected exception") && line.includes("PARTITION_AGGREGATE_GUARD_REJECTED_CROSSING_IDENTITY")).length, 1, "one partition failure line");
  });
});

test("mutation snapshots contain only canonical source modules, resolve dependencies, and clean setup and body failures", () => {
  let snapshot;
  withCanonicalSnapshot((directory) => {
    snapshot = directory;
    assert.deepEqual(readdirSync(directory).filter((entry) => entry !== "node_modules").sort(), [...canonicalModules].sort());
    assert.ok(directory.startsWith(tmpdir()));
    assert.equal(directory.startsWith(`${resolve(fileURLToPath(new URL("../../..", import.meta.url)))}${sep}`), false);
  });
  assert.equal(existsSync(snapshot), false);
  let bodySnapshot; const bodyError = new Error("body failure");
  assert.throws(() => withCanonicalSnapshot((directory) => { bodySnapshot = directory; throw bodyError; }), bodyError);
  assert.equal(existsSync(bodySnapshot), false);
  let setupSnapshot; const setupError = new Error("setup failure");
  assert.throws(() => withCanonicalSnapshot(() => assert.fail("action reached"), (_source, destination) => { setupSnapshot = dirname(destination); throw setupError; }), setupError);
  assert.equal(existsSync(setupSnapshot), false);
});
