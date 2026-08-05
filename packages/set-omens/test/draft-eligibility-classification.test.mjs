import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { completeOmensRecipeCustomCardsAggregateForTest, parseOmensCustomCardsFromTrustedBytes } from "../src/custom-cards.ts";
import { reconcileOfficialUpstreamIdRecordsForTest } from "../src/official-upstream-id-reconciliation.ts";
import { reconcileOmensRecipeOfficialIdentityRecordsForTest } from "../src/recipe-official-identity-reconciliation.ts";
import {
  DraftEligibilityClassificationError,
  classifyOmensDraftEligibilityForTest
} from "../src/draft-eligibility-classification.ts";

const settings = JSON.stringify({ showSlots: true, withReplacement: false, cardBack: "https://cards.invalid/back.png" });
const card = (name, collector_number) => ({ name, collector_number, mana_cost: "2", rarity: "common", type: "action", image_uris: { en: "https://cards.invalid/a.png" } });
const recipeBytes = (cards) => Buffer.from(`\ufeff[Settings]\r\n${settings}\r\n[CustomCards]\r\n${JSON.stringify(cards)}\r\n[Layouts]\r\nopaque`, "utf8");
const forms = Object.freeze([
  Object.freeze({ officialPrintId: "OMN102", baseCollectorId: "OMN102", sourceSet: "OMN", suffixMarker: null }),
  Object.freeze({ officialPrintId: "IAR200-MV", baseCollectorId: "IAR200", sourceSet: "IAR", suffixMarker: "MV" }),
  Object.freeze({ officialPrintId: "OMN100", baseCollectorId: "OMN100", sourceSet: "OMN", suffixMarker: null }),
  Object.freeze({ officialPrintId: "OMN103-RF", baseCollectorId: "OMN103", sourceSet: "OMN", suffixMarker: "RF" }),
  Object.freeze({ officialPrintId: "OMN101", baseCollectorId: "OMN101", sourceSet: "OMN", suffixMarker: null }),
  Object.freeze({ officialPrintId: "OMN104-CF", baseCollectorId: "OMN104", sourceSet: "OMN", suffixMarker: "CF" })
]);
const names = new Map([["OMN100", "Fictional A"], ["OMN101", "Fictional B"], ["OMN102", "Unmapped"], ["OMN103", "Foil"], ["OMN104", "Cold"], ["IAR200", "Cross Set"]]);
const pitches = new Map([["OMN100", "1"], ["OMN101", ""], ["OMN102", ""], ["OMN103", ""], ["OMN104", ""], ["IAR200", ""]]);
const recipe = (nameByBase = names) => completeOmensRecipeCustomCardsAggregateForTest(parseOmensCustomCardsFromTrustedBytes(recipeBytes([
  card(`${nameByBase.get("OMN101")}`, "OMN101"), card(`${nameByBase.get("OMN100")} (red)`, "OMN100")
])), { common: 2, rare: 0, mythic: 0 });
const source = (inputForms = forms, nameByBase = names, changedUniqueBase = null) => inputForms.map((form, index) => ({
  unique_id: form.baseCollectorId === changedUniqueBase ? `changed-card-${index}` : `card-${index}`,
  name: nameByBase.get(form.baseCollectorId), pitch: pitches.get(form.baseCollectorId),
  printings: [{ unique_id: `printing-${index}`, set_printing_unique_id: `set-${form.sourceSet}`, id: form.baseCollectorId, set_id: form.sourceSet,
    edition: "standard", foiling: "standard", rarity: index % 2 === 0 ? "V" : "C", expansion_slot: false, image_url: "https://images.invalid/a.png", art_variations: [] }]
}));
const officialExpected = Object.freeze({ entries: 6, omnEntries: 5, iarEntries: 1, omnPrintings: 5, iarPrintings: 1 });
const official = (inputForms = forms, inputSource = source(inputForms)) => reconcileOfficialUpstreamIdRecordsForTest(inputForms, inputSource, officialExpected);
const identityExpected = Object.freeze({ recipeEntries: 2, officialEntries: 6, candidateEntries: 3, mappedEntries: 2, unmappedEntries: 4, unmappedOmn: 3, unmappedIar: 1, unmappedUnsuffixed: 1, unmappedRf: 1, unmappedCf: 1, unmappedMv: 1 });
const identities = (records = official(), references = recipe()) => reconcileOmensRecipeOfficialIdentityRecordsForTest(references, records, identityExpected);
const expected = Object.freeze({ officialEntries: 6, mappedEntries: 2, mappedIarEntries: 0, excludedEntries: 1, excludedIarEntries: 1, excludedNonIarEntries: 0, unclassifiedEntries: 3, unclassifiedOmnEntries: 3, unclassifiedIarEntries: 0, unclassifiedUnsuffixed: 1, unclassifiedRf: 1, unclassifiedCf: 1, unclassifiedMv: 0 });
const classify = (identity = identities(), records = official(), aggregate = expected) => classifyOmensDraftEligibilityForTest(identity, records, aggregate);
const safe = (action) => assert.throws(action, (error) => {
  assert.ok(error instanceof DraftEligibilityClassificationError);
  assert.equal(error.code, "DRAFT_ELIGIBILITY_CLASSIFICATION_FAILED");
  assert.equal(error.message, "Draft eligibility classification failed.");
  assert.equal(error.stack, "DraftEligibilityClassificationError: Draft eligibility classification failed.");
  assert.deepEqual(JSON.parse(JSON.stringify(error)), { name: "DraftEligibilityClassificationError", code: "DRAFT_ELIGIBILITY_CLASSIFICATION_FAILED" });
  assert.doesNotMatch(`${error.message}${error.stack}${JSON.stringify(error)}`, /Fictional|OMN|IAR|[0-9]|https?:|\\|\//i);
  return true;
});

test("opaque capability classification preserves canonical official order and exact captain-policy states", () => {
  assert.deepEqual(classify(), [
    { officialPrintId: "OMN102", baseCollectorId: "OMN102", sourceSetMarker: "OMN", suffixMarker: null, officialCardUniqueId: "card-0", draftEligibility: "unclassified", classificationBasis: "recipe-source-absence-open" },
    { officialPrintId: "IAR200-MV", baseCollectorId: "IAR200", sourceSetMarker: "IAR", suffixMarker: "MV", officialCardUniqueId: "card-1", draftEligibility: "excluded", classificationBasis: "captain-approved-IAR-exclusion" },
    { officialPrintId: "OMN100", baseCollectorId: "OMN100", sourceSetMarker: "OMN", suffixMarker: null, officialCardUniqueId: "card-2", draftEligibility: "draftable", classificationBasis: "captain-approved-recipe-draftable" },
    { officialPrintId: "OMN103-RF", baseCollectorId: "OMN103", sourceSetMarker: "OMN", suffixMarker: "RF", officialCardUniqueId: "card-3", draftEligibility: "unclassified", classificationBasis: "recipe-source-absence-open" },
    { officialPrintId: "OMN101", baseCollectorId: "OMN101", sourceSetMarker: "OMN", suffixMarker: null, officialCardUniqueId: "card-4", draftEligibility: "draftable", classificationBasis: "captain-approved-recipe-draftable" },
    { officialPrintId: "OMN104-CF", baseCollectorId: "OMN104", sourceSetMarker: "OMN", suffixMarker: "CF", officialCardUniqueId: "card-5", draftEligibility: "unclassified", classificationBasis: "recipe-source-absence-open" }
  ]);
});

test("classification is deeply immutable, fresh, copy-independent, and ignores names and rarity", () => {
  const first = classify(), second = classify();
  assert.ok(Object.isFrozen(first)); assert.ok(first.every(Object.isFrozen)); assert.notEqual(first, second); assert.notEqual(first[0], second[0]);
  assert.throws(() => { first[0].draftEligibility = "excluded"; }, TypeError); assert.throws(() => first.push({}), TypeError);
  const alternateNames = new Map([...names].map(([base]) => [base, `Different ${base}`]));
  const alternateRecords = official(forms, source(forms, alternateNames));
  const alternate = classify(identities(alternateRecords, recipe(alternateNames)), alternateRecords);
  assert.deepEqual(alternate.map(({ officialPrintId, baseCollectorId, sourceSetMarker, suffixMarker, draftEligibility, classificationBasis }) => ({ officialPrintId, baseCollectorId, sourceSetMarker, suffixMarker, draftEligibility, classificationBasis })), first.map(({ officialPrintId, baseCollectorId, sourceSetMarker, suffixMarker, draftEligibility, classificationBasis }) => ({ officialPrintId, baseCollectorId, sourceSetMarker, suffixMarker, draftEligibility, classificationBasis })));
});

test("only registered capabilities, exact one-to-one ownership, partition facts, and aggregates are accepted", async () => {
  const records = official(), identity = identities(records);
  safe(() => classify(Object.freeze({ mapped: identity.mapped, unmapped: identity.unmapped }), records));
  safe(() => classify(identity, Object.freeze([...records])));
  const boundary = await import("../src/schema-validation.ts");
  safe(() => boundary.classifyOmensOfficialDraftEligibility(Object.freeze([]), Object.freeze([])));
  safe(() => boundary.classifyOmensOfficialDraftEligibility(identity, records, Object.freeze({})));
  safe(() => classify(identity, official(forms, source(forms, names, "OMN100"))));
  const changedSuffix = Object.freeze(forms.map((form) => form.officialPrintId === "OMN103-RF" ? Object.freeze({ ...form, officialPrintId: "OMN103-CF", suffixMarker: "CF" }) : form));
  safe(() => classify(identity, official(changedSuffix, source(changedSuffix))));
  const changedSet = Object.freeze(forms.map((form) => form.baseCollectorId === "IAR200" ? Object.freeze({ ...form, sourceSet: "OMN", officialPrintId: "OMN200-MV" })
    : form.baseCollectorId === "OMN102" ? Object.freeze({ ...form, sourceSet: "IAR", officialPrintId: "IAR102" }) : form));
  safe(() => classify(identity, official(changedSet, source(changedSet))));
  for (const key of Object.keys(expected)) safe(() => classify(identity, records, { ...expected, [key]: expected[key] + 1 }));
});

const moduleEnvironmentKey = "DRAFT_TABLE_TEST_DRAFT_ELIGIBILITY_CLASSIFICATION_MODULE";
const sourcePath = new URL("../src/draft-eligibility-classification.ts", import.meta.url);
const withCanonicalSnapshot = (action) => {
  let directory;
  try {
    directory = mkdtempSync(join(tmpdir(), "draft-table-draft-eligibility-mutation-"));
    const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url));
    for (const file of readdirSync(sourceDirectory).filter((file) => file.endsWith(".ts"))) copyFileSync(join(sourceDirectory, file), join(directory, file));
    symlinkSync(join(sourceDirectory, "../../../node_modules"), join(directory, "node_modules"), "dir");
    return action(directory);
  } finally { if (directory !== undefined) rmSync(directory, { recursive: true, force: true }); }
};
const loadMutationModules = async () => {
  const moduleUrl = process.env[moduleEnvironmentKey] ?? sourcePath.href;
  const directory = new URL("./", moduleUrl);
  return { classification: await import(moduleUrl), custom: await import(new URL("custom-cards.ts", directory)), upstream: await import(new URL("official-upstream-id-reconciliation.ts", directory)), identity: await import(new URL("recipe-official-identity-reconciliation.ts", directory)) };
};
const mutationCapabilities = (modules, { changedUniqueBase = null } = {}) => {
  const records = modules.upstream.reconcileOfficialUpstreamIdRecordsForTest(forms, source(forms, names, changedUniqueBase), officialExpected);
  const references = modules.custom.completeOmensRecipeCustomCardsAggregateForTest(modules.custom.parseOmensCustomCardsFromTrustedBytes(recipeBytes([card("Fictional B", "OMN101"), card("Fictional A (red)", "OMN100")])), { common: 2, rare: 0, mythic: 0 });
  return { records, identities: modules.identity.reconcileOmensRecipeOfficialIdentityRecordsForTest(references, records, identityExpected) };
};
const mutationRun = (mutated, contractName, marker, failure) => withCanonicalSnapshot((directory) => {
  const path = join(directory, "draft-eligibility-classification.ts"); writeFileSync(path, mutated);
  const environment = { ...process.env, [moduleEnvironmentKey]: pathToFileURL(path).href }; delete environment.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--test-name-pattern", `^${contractName}$`, fileURLToPath(import.meta.url)], { encoding: "utf8", env: environment });
  const lines = result.stdout.split(/\r?\n/);
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.equal(lines.filter((line) => line === `# ${marker}`).length, 1);
  assert.equal(lines.filter((line) => /^not ok \d+ - /.test(line) && line.endsWith(contractName)).length, 1);
  assert.equal(lines.filter((line) => line.includes(failure)).length, 1);
});

const ownershipContract = "mapped membership requires exact official base and card ownership", ownershipMarker = "DRAFT_ELIGIBILITY_MAPPED_OWNERSHIP_CONTRACT_EXECUTED";
test(ownershipContract, async () => {
  console.log(ownershipMarker); const m = await loadMutationModules();
  const original = mutationCapabilities(m); const drifted = mutationCapabilities(m, { changedUniqueBase: "OMN100" });
  assert.throws(() => m.classification.classifyOmensDraftEligibilityForTest(original.identities, drifted.records, expected), m.classification.DraftEligibilityClassificationError, "MAPPED_MEMBERSHIP_OWNERSHIP_MUST_REJECT_DRIFT");
});
test("mapped membership ownership mutation fails its exact named contract", () => {
  const original = Buffer.from(requireSource()).toString();
  let mutated = original.replace("record.officialPrintId !== identity.officialPrintId || record.baseCollectorId !== identity.officialBaseCollectorId || record.unique_id !== identity.officialCardUniqueId ||", "false ||");
  mutated = mutated.replace("officialByCard.get(identity.officialCardUniqueId) !== record ||", "false ||");
  assert.notEqual(mutated, original); mutationRun(mutated, ownershipContract, ownershipMarker, "MAPPED_MEMBERSHIP_OWNERSHIP_MUST_REJECT_DRIFT");
});

const iarContract = "only IAR unmapped identities receive the captain exclusion state", iarMarker = "DRAFT_ELIGIBILITY_IAR_ONLY_EXCLUSION_CONTRACT_EXECUTED";
test(iarContract, async () => {
  console.log(iarMarker); const m = await loadMutationModules(); const c = mutationCapabilities(m);
  const swapped = { ...expected, excludedIarEntries: 0, excludedNonIarEntries: 1, unclassifiedOmnEntries: 2, unclassifiedIarEntries: 1, unclassifiedUnsuffixed: 0, unclassifiedMv: 1 };
  assert.throws(() => m.classification.classifyOmensDraftEligibilityForTest(c.identities, c.records, swapped), m.classification.DraftEligibilityClassificationError, "IAR_ONLY_CAPTAIN_EXCLUSION_MUST_NOT_MOVE_TO_OMN");
});
test("IAR-only exclusion mutation fails its exact named contract", () => {
  const original = Buffer.from(requireSource()).toString();
  const mutated = original.replace('record.sourceSetMarker === "IAR" ? "excluded" : "unclassified"', 'record.officialPrintId === "OMN102" ? "excluded" : "unclassified"');
  assert.notEqual(mutated, original); mutationRun(mutated, iarContract, iarMarker, "IAR_ONLY_CAPTAIN_EXCLUSION_MUST_NOT_MOVE_TO_OMN");
});

const boundaryContract = "all non-IAR unmapped identities preserve the unclassified boundary", boundaryMarker = "DRAFT_ELIGIBILITY_UNCLASSIFIED_BOUNDARY_CONTRACT_EXECUTED";
test(boundaryContract, async () => {
  console.log(boundaryMarker); const m = await loadMutationModules(); const c = mutationCapabilities(m);
  const collapsed = { ...expected, excludedEntries: 4, excludedNonIarEntries: 3, unclassifiedEntries: 0, unclassifiedOmnEntries: 0, unclassifiedUnsuffixed: 0, unclassifiedRf: 0, unclassifiedCf: 0 };
  assert.throws(() => m.classification.classifyOmensDraftEligibilityForTest(c.identities, c.records, collapsed), m.classification.DraftEligibilityClassificationError, "NON_IAR_UNMAPPED_BOUNDARY_MUST_REMAIN_UNCLASSIFIED");
});
test("unclassified boundary mutation fails its exact named contract", () => {
  const original = Buffer.from(requireSource()).toString();
  const mutated = original.replace('record.sourceSetMarker === "IAR" ? "excluded" : "unclassified"', '"excluded"');
  assert.notEqual(mutated, original); mutationRun(mutated, boundaryContract, boundaryMarker, "NON_IAR_UNMAPPED_BOUNDARY_MUST_REMAIN_UNCLASSIFIED");
});

function requireSource() { return (awaitImportRead())(); }
function awaitImportRead() { return () => { const fs = process.getBuiltinModule("node:fs"); return fs.readFileSync(sourcePath); }; }

test("mutation snapshots are file-local OS-temp canonical copies and always clean", () => {
  let snapshot; withCanonicalSnapshot((directory) => { snapshot = directory; assert.ok(directory.startsWith(tmpdir())); assert.equal(directory.startsWith(`${resolve(fileURLToPath(new URL("../../..", import.meta.url)))}${sep}`), false); }); assert.equal(existsSync(snapshot), false);
  let failed; assert.throws(() => withCanonicalSnapshot((directory) => { failed = directory; throw new Error("body"); })); assert.equal(existsSync(failed), false);
});
