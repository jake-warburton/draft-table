import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { validateCardVaultOfficialMembershipBytesAgainstFact } from "../src/card-vault-official-membership.ts";
import { projectCardVaultOfficialFaceMetadataForTest } from "../src/card-vault-face-projection.ts";
import { reconcileOfficialUpstreamIdRecordsForTest } from "../src/official-upstream-id-reconciliation.ts";
import {
  OfficialFacePrintingMultiplicityReconciliationError,
  readOfficialFacePrintingMultiplicityReconciliationForFaceSemantics,
  reconcileOfficialFacePrintingMultiplicityForTest
} from "../src/official-face-printing-multiplicity-reconciliation.ts";

const host = "legendstory-production-s3-public.s3.amazonaws.com";
const mv = Array.from({ length: 9 }, (_, index) => ({ id: `IAR${String(index).padStart(3, "0")}-MV`, positions: index < 2 ? [10, 20] : [10] }));
const specs = [...mv, { id: "OMN100-RF", positions: [10] }, { id: "OMN101", positions: [10] }];
const ids = specs.map((entry) => entry.id);
const encode = (value) => new TextEncoder().encode(value);
const fact = (items) => { const canonical = `${[...items].sort().join("\n")}\n`; return Object.freeze({ total: items.length, omn: items.filter((id) => id.startsWith("OMN")).length, iar: items.filter((id) => id.startsWith("IAR")).length, byteLength: Buffer.byteLength(canonical), sha256: createHash("sha256").update(canonical).digest("hex") }); };
const response = (entries = specs) => JSON.stringify({ product_name: "Omens of the Third Age", release_date: "2026-06-05", cards: entries.map(({ id, positions }) => ({ print_id: id, faces: positions.map((layout_position) => ({ layout_position, image: Object.fromEntries(["small", "normal", "large"].map((size) => [size, `https://${host}/${id}-${layout_position}-${size}`])) })) })) });
const faceAggregate = Object.freeze({ entries: 11, faces: 13, oneFaceEntries: 9, twoFaceEntries: 2, position10Faces: 11, position20Faces: 2, smallUrls: 13, normalUrls: 13, largeUrls: 13, allUrls: 39, unsuffixedEntries: 1, unsuffixedFaces: 1, unsuffixedOneFaceEntries: 1, unsuffixedTwoFaceEntries: 0, rfEntries: 1, rfFaces: 1, rfOneFaceEntries: 1, rfTwoFaceEntries: 0, cfEntries: 0, cfFaces: 0, cfOneFaceEntries: 0, cfTwoFaceEntries: 0, mvEntries: 9, mvFaces: 11, mvOneFaceEntries: 7, mvTwoFaceEntries: 2 });
const multiplicityAggregate = Object.freeze({ mvEntries: 9, officialFaces: 11, upstreamPrintingRows: 11, oneToOneEntries: 7, twoToTwoEntries: 2, mismatches: 0 });
const forms = Object.freeze(specs.map(({ id }) => Object.freeze({ officialPrintId: id, baseCollectorId: id.replace(/-(?:RF|MV)$/u, ""), sourceSet: id.startsWith("IAR") ? "IAR" : "OMN", suffixMarker: id.endsWith("-MV") ? "MV" : id.endsWith("-RF") ? "RF" : null })));
const rowsFor = (form, count) => Array.from({ length: count }, (_, index) => ({ unique_id: `row-${form.baseCollectorId}-${index}`, set_printing_unique_id: form.sourceSet === "IAR" ? "iar" : "omn", id: form.baseCollectorId, set_id: form.sourceSet, edition: "e", foiling: "f", rarity: "r", expansion_slot: false, image_url: "https://images.example.invalid/a", art_variations: [] }));
const source = (counts = new Map(mv.map((entry) => [entry.id, entry.positions.length]))) => forms.map((form) => ({ unique_id: `card-${form.baseCollectorId}`, name: "fictional", printings: rowsFor(form, counts.get(form.officialPrintId) ?? (form.suffixMarker === "RF" ? 2 : 1)) }));
const reconciliationAggregate = (selectedForms = forms, counts = new Map(mv.map((entry) => [entry.id, entry.positions.length]))) => Object.freeze({ entries: selectedForms.length, omnEntries: selectedForms.filter((form) => form.sourceSet === "OMN").length, iarEntries: selectedForms.filter((form) => form.sourceSet === "IAR").length, omnPrintings: selectedForms.filter((form) => form.sourceSet === "OMN").reduce((total, form) => total + (counts.get(form.officialPrintId) ?? (form.suffixMarker === "RF" ? 2 : 1)), 0), iarPrintings: selectedForms.filter((form) => form.sourceSet === "IAR").reduce((total, form) => total + (counts.get(form.officialPrintId) ?? 1), 0) });
const faces = (entries = specs) => projectCardVaultOfficialFaceMetadataForTest(validateCardVaultOfficialMembershipBytesAgainstFact(encode(response(entries)), fact(entries.map((entry) => entry.id))), encode(response(entries)), { ...faceAggregate, entries: entries.length, faces: entries.reduce((total, entry) => total + entry.positions.length, 0), oneFaceEntries: entries.filter((entry) => entry.positions.length === 1).length, twoFaceEntries: entries.filter((entry) => entry.positions.length === 2).length, position10Faces: entries.length, position20Faces: entries.filter((entry) => entry.positions.length === 2).length, smallUrls: entries.reduce((total, entry) => total + entry.positions.length, 0), normalUrls: entries.reduce((total, entry) => total + entry.positions.length, 0), largeUrls: entries.reduce((total, entry) => total + entry.positions.length, 0), allUrls: entries.reduce((total, entry) => total + entry.positions.length * 3, 0), unsuffixedEntries: entries.filter((entry) => !/-[A-Z]+$/u.test(entry.id)).length, unsuffixedFaces: entries.filter((entry) => !/-[A-Z]+$/u.test(entry.id)).reduce((total, entry) => total + entry.positions.length, 0), unsuffixedOneFaceEntries: entries.filter((entry) => !/-[A-Z]+$/u.test(entry.id) && entry.positions.length === 1).length, unsuffixedTwoFaceEntries: entries.filter((entry) => !/-[A-Z]+$/u.test(entry.id) && entry.positions.length === 2).length, rfEntries: entries.filter((entry) => entry.id.endsWith("-RF")).length, rfFaces: entries.filter((entry) => entry.id.endsWith("-RF")).reduce((total, entry) => total + entry.positions.length, 0), rfOneFaceEntries: entries.filter((entry) => entry.id.endsWith("-RF") && entry.positions.length === 1).length, rfTwoFaceEntries: 0, cfEntries: 0, cfFaces: 0, cfOneFaceEntries: 0, cfTwoFaceEntries: 0, mvEntries: entries.filter((entry) => entry.id.endsWith("-MV")).length, mvFaces: entries.filter((entry) => entry.id.endsWith("-MV")).reduce((total, entry) => total + entry.positions.length, 0), mvOneFaceEntries: entries.filter((entry) => entry.id.endsWith("-MV") && entry.positions.length === 1).length, mvTwoFaceEntries: entries.filter((entry) => entry.id.endsWith("-MV") && entry.positions.length === 2).length });
const upstream = (inputForms = forms, inputSource = source(), aggregate = reconciliationAggregate(inputForms)) => reconcileOfficialUpstreamIdRecordsForTest(inputForms, inputSource, aggregate);
const reconcile = (faceCapability = faces(), upstreamCapability = upstream(), expected = multiplicityAggregate) => reconcileOfficialFacePrintingMultiplicityForTest(faceCapability, upstreamCapability, expected);
const snapshotMutation = (sourcePath, mutated, label) => { let directory; try { directory = mkdtempSync(join(tmpdir(), `draft-table-${label}-`)); const sourceDirectory = new URL("./", sourcePath); const isolated = mutated.replace(/from "(\.\/[^"\n]+)"/gu, (_match, specifier) => `from ${JSON.stringify(new URL(specifier, sourceDirectory).href)}`); const path = join(directory, "module.ts"); writeFileSync(path, isolated); return { directory, path }; } catch (error) { if (directory !== undefined) rmSync(directory, { force: true, recursive: true }); throw error; } };
const safe = (action) => assert.throws(action, (error) => { assert.ok(error instanceof OfficialFacePrintingMultiplicityReconciliationError); assert.equal(error.code, "OFFICIAL_FACE_PRINTING_MULTIPLICITY_RECONCILIATION_FAILED"); assert.equal(error.message, "Official face and printing multiplicity reconciliation failed."); assert.equal(error.stack, "OfficialFacePrintingMultiplicityReconciliationError: Official face and printing multiplicity reconciliation failed."); assert.deepEqual(JSON.parse(JSON.stringify(error)), { name: "OfficialFacePrintingMultiplicityReconciliationError", code: "OFFICIAL_FACE_PRINTING_MULTIPLICITY_RECONCILIATION_FAILED" }); assert.doesNotMatch(`${error.message}${error.stack}${JSON.stringify(error)}`, /IAR|OMN|fictional|[0-9]|https?:|\//iu); return true; });

test("MV multiplicity joins exact dual capabilities in canonical official order and excludes RF and unsuffixed rows", () => {
  const result = reconcile();
  assert.deepEqual(result.map((entry) => entry.officialPrintId), [...mv].map((entry) => entry.id).sort());
  assert.deepEqual(result.map((entry) => [entry.officialFaceCount, entry.upstreamPrintingRowCount]), [[2, 2], [2, 2], ...Array.from({ length: 7 }, () => [1, 1])]);
  assert.ok(result.every((entry) => entry.officialIsMulti === entry.upstreamIsMulti));
  assert.equal(result.length, 9);
});

test("MV multiplicity output is deeply immutable and copy-independent", () => {
  const first = reconcile(), second = reconcile();
  assert.ok(Object.isFrozen(first) && first.every(Object.isFrozen)); assert.notEqual(first, second); assert.notEqual(first[0], second[0]);
  assert.throws(() => { first[0].officialFaceCount = 1; }, TypeError);
  assert.equal(readOfficialFacePrintingMultiplicityReconciliationForFaceSemantics(first), first);
  safe(() => readOfficialFacePrintingMultiplicityReconciliationForFaceSemantics(Object.freeze([])));
});

test("forged capabilities, divergent membership, non-MV counts, and every aggregate guard fail closed", () => {
  safe(() => reconcile(Object.freeze([]), upstream())); safe(() => reconcile(faces(), Object.freeze([])));
  const fewer = specs.slice(0, -1); safe(() => reconcile(faces(fewer), upstream()));
  const three = new Map(mv.map((entry) => [entry.id, entry.positions.length])); three.set(mv[0].id, 3); safe(() => reconcile(faces(), upstream(forms, source(three), reconciliationAggregate(forms, three))));
  for (const key of Object.keys(multiplicityAggregate)) safe(() => reconcile(faces(), upstream(), { ...multiplicityAggregate, [key]: multiplicityAggregate[key] + 1 }));
});

const equalityContract = "MV per-entry equality and multi-entry set equality reject redistributed totals";
const equalityMarker = "MV_MULTIPLICITY_EQUALITY_CONTRACT_EXECUTED";
const equalityModuleKey = "DRAFT_TABLE_TEST_MV_MULTIPLICITY_MODULE";
test(equalityContract, async () => {
  console.log(equalityMarker);
  const module = process.env[equalityModuleKey] ? await import(process.env[equalityModuleKey]) : { OfficialFacePrintingMultiplicityReconciliationError, reconcileOfficialFacePrintingMultiplicityForTest };
  const counts = new Map(mv.map((entry) => [entry.id, entry.positions.length])); counts.set(mv[0].id, 1); counts.set(mv[2].id, 2);
  assert.throws(() => module.reconcileOfficialFacePrintingMultiplicityForTest(faces(), upstream(forms, source(counts), reconciliationAggregate(forms, counts)), multiplicityAggregate), module.OfficialFacePrintingMultiplicityReconciliationError, "MV_EQUALITY_SET_GUARD_REJECTED_REDISTRIBUTED_TOTALS");
});

test("MV equality/set semantic mutation is caught by its named contract", () => {
  const sourcePath = new URL("../src/official-face-printing-multiplicity-reconciliation.ts", import.meta.url); const original = readFileSync(sourcePath, "utf8");
  const mutated = original.replace("if (officialCount !== upstreamCount) fail();", "if (false) fail();").replace("officialMulti.size !== upstreamMulti.size || [...officialMulti].some((id) => !upstreamMulti.has(id))", "false");
  assert.notEqual(mutated, original, "per-entry equality and set-equality guards present"); const snapshot = snapshotMutation(sourcePath, mutated, "mv-equality");
  try { const env = { ...process.env, [equalityModuleKey]: pathToFileURL(snapshot.path).href }; delete env.NODE_TEST_CONTEXT; const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--test-name-pattern", `^${equalityContract}$`, fileURLToPath(import.meta.url)], { encoding: "utf8", env }); const lines = result.stdout.split(/\r?\n/);
    assert.equal(result.status, 1, result.stdout + result.stderr); assert.equal(lines.filter((line) => line === `# ${equalityMarker}`).length, 1); assert.equal(lines.filter((line) => /^not ok \d+ - /.test(line) && line.endsWith(equalityContract)).length, 1); assert.equal(lines.filter((line) => line.includes("Missing expected exception") && line.includes("MV_EQUALITY_SET_GUARD_REJECTED_REDISTRIBUTED_TOTALS")).length, 1);
  } finally { rmSync(snapshot.directory, { force: true, recursive: true }); }
});

const capabilityContract = "MV multiplicity requires both opaque capabilities and exact membership";
const capabilityMarker = "MV_MULTIPLICITY_CAPABILITY_CONTRACT_EXECUTED";
const capabilityModuleKey = "DRAFT_TABLE_TEST_MV_MULTIPLICITY_CAPABILITY_MODULE";
test(capabilityContract, async () => {
  console.log(capabilityMarker);
  const module = process.env[capabilityModuleKey] ? await import(process.env[capabilityModuleKey]) : { OfficialFacePrintingMultiplicityReconciliationError, reconcileOfficialFacePrintingMultiplicityForTest };
  const fewer = specs.slice(0, -1);
  safe(() => module.reconcileOfficialFacePrintingMultiplicityForTest(Object.freeze(faces(fewer).map((entry) => Object.freeze({ ...entry }))), upstream(), multiplicityAggregate));
});

test("MV capability semantic mutation is caught by its named contract", () => {
  const sourcePath = new URL("../src/official-face-printing-multiplicity-reconciliation.ts", import.meta.url); const original = readFileSync(sourcePath, "utf8"); const mutated = original.replace("readOfficialCardVaultFaceProjectionForMultiplicityReconciliation(faces)", "faces").replace("facesById.size !== faces.length || upstreamById.size !== upstream.length || facesById.size !== upstreamById.size", "false"); assert.notEqual(mutated, original, "face capability and membership guards present"); const snapshot = snapshotMutation(sourcePath, mutated, "mv-capability");
  try { const env = { ...process.env, [capabilityModuleKey]: pathToFileURL(snapshot.path).href }; delete env.NODE_TEST_CONTEXT; const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--test-name-pattern", `^${capabilityContract}$`, fileURLToPath(import.meta.url)], { encoding: "utf8", env }); const lines = result.stdout.split(/\r?\n/);
    assert.equal(result.status, 1, result.stdout + result.stderr); assert.equal(lines.filter((line) => line === `# ${capabilityMarker}`).length, 1); assert.equal(lines.filter((line) => /^not ok \d+ - /.test(line) && line.endsWith(capabilityContract)).length, 1); assert.equal(lines.filter((line) => line.includes("Missing expected exception")).length, 1);
  } finally { rmSync(snapshot.directory, { force: true, recursive: true }); }
});
