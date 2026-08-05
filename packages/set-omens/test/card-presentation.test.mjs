import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { projectCardVaultOfficialFaceMetadataForTest } from "../src/card-vault-face-projection.ts";
import { validateCardVaultOfficialMembershipBytesAgainstFact } from "../src/card-vault-official-membership.ts";
import { OmensCardPresentationError, projectOmensOfficialCardPresentation, readOmensCardPresentationForBuild } from "../src/card-presentation.ts";
import { reconcileOfficialUpstreamIdRecordsForTest } from "../src/official-upstream-id-reconciliation.ts";

const encode = (value) => new TextEncoder().encode(value);
const ids = ["OMN001", "OMN002-RF", "OMN003-CF", "IAR001-MV", "IAR002-MV"];
const fact = () => { const text = `${[...ids].sort().join("\n")}\n`; return Object.freeze({ total: 5, omn: 3, iar: 2, byteLength: Buffer.byteLength(text), sha256: createHash("sha256").update(text).digest("hex") }); };
const host = "legendstory-production-s3-public.s3.amazonaws.com";
const response = () => JSON.stringify({ product_name: "Omens of the Third Age", release_date: "2026-06-05", cards: ids.map((id, index) => ({ print_id: id, faces: (id === "IAR001-MV" ? [10, 20] : [10]).map((layout_position) => ({ layout_position, image: { small: `https://${host}/${index}-${layout_position}-s`, normal: `https://${host}/${index}-${layout_position}-n`, large: `https://${host}/${index}-${layout_position}-l` } })) })) });
const membership = () => validateCardVaultOfficialMembershipBytesAgainstFact(encode(response()), fact());
const faceAggregate = Object.freeze({ entries: 5, faces: 6, oneFaceEntries: 4, twoFaceEntries: 1, position10Faces: 5, position20Faces: 1, smallUrls: 6, normalUrls: 6, largeUrls: 6, allUrls: 18, unsuffixedEntries: 1, unsuffixedFaces: 1, unsuffixedOneFaceEntries: 1, unsuffixedTwoFaceEntries: 0, rfEntries: 1, rfFaces: 1, rfOneFaceEntries: 1, rfTwoFaceEntries: 0, cfEntries: 1, cfFaces: 1, cfOneFaceEntries: 1, cfTwoFaceEntries: 0, mvEntries: 2, mvFaces: 3, mvOneFaceEntries: 1, mvTwoFaceEntries: 1 });
const p = (id, unique_id, foiling, rarity, expansion_slot = false) => ({ unique_id, set_printing_unique_id: id.startsWith("IAR") ? "sp-iar" : "sp-omn", id, set_id: id.slice(0, 3), edition: "e", foiling, rarity, expansion_slot, image_url: "https://images.example.invalid/a", art_variations: [] });
const forms = Object.freeze(ids.map((officialPrintId) => Object.freeze({ officialPrintId, baseCollectorId: officialPrintId.replace(/-(?:RF|CF|MV)$/u, ""), sourceSet: officialPrintId.startsWith("IAR") ? "IAR" : "OMN", suffixMarker: officialPrintId.endsWith("-RF") ? "RF" : officialPrintId.endsWith("-CF") ? "CF" : officialPrintId.endsWith("-MV") ? "MV" : null })));
const source = () => [
  { unique_id: "card-1", name: "Red Name", pitch: "1", printings: [p("OMN001", "p-1", "N", "C")] },
  { unique_id: "card-2", name: "Yellow Name", pitch: "2", printings: [p("OMN002", "p-2a", "N", "R"), p("OMN002", "p-2b", "RF", "R")] },
  { unique_id: "card-3", name: "Blue Name", pitch: "3", printings: [p("OMN003", "p-3", "CF", "M", true)] },
  { unique_id: "card-4", name: "Face One", pitch: "", printings: [p("IAR001", "p-4", "MV", "L")] },
  { unique_id: "card-5", name: "Face Two", pitch: "", printings: [p("IAR002", "p-5", "MV", "V")] }
];
const reconciliation = () => reconcileOfficialUpstreamIdRecordsForTest(forms, source(), Object.freeze({ entries: 5, omnEntries: 3, iarEntries: 2, omnPrintings: 4, iarPrintings: 2 }));
const faces = () => projectCardVaultOfficialFaceMetadataForTest(membership(), encode(response()), faceAggregate);
const project = (record = reconciliation(), projection = faces(), identity = record[1], printing = identity.printings[1], position = 10) => projectOmensOfficialCardPresentation(record, projection, identity, printing, position);
const safe = (action) => assert.throws(action, (error) => { assert.ok(error instanceof OmensCardPresentationError); assert.equal(error.code, "OMENS_CARD_PRESENTATION_FAILED"); assert.deepEqual(JSON.parse(JSON.stringify(error)), { name: "OmensCardPresentationError", code: "OMENS_CARD_PRESENTATION_FAILED" }); return true; });

test("exact registered identity printing and face produce source-attributed immutable display values without semantic inference", () => {
  const record = reconciliation(); const result = project(record);
  assert.deepEqual(result, { officialPrintId: "OMN002-RF", baseCollectorId: "OMN002", upstreamCardId: "card-2", upstreamPrintingId: "p-2b", faceLayoutPosition: 10, displayName: "Yellow Name", pitch: "2", pitchColour: null, rarity: "R", imageUrl: `https://${host}/1-10-n`, treatment: "RF", rearMarker: null, source: { identity: "official-card-vault-membership + pinned-upstream-card.json", displayName: "pinned-upstream-card.json", pitch: "pinned-upstream-card.json", pitchColour: "unavailable", rarity: "pinned-upstream-card.json", imageUrl: "official-card-vault-response:normal-rendition", treatment: "pinned-upstream-card.json:foiling", rearMarker: "unavailable" } });
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.source)); assert.throws(() => { result.displayName = "x"; }, TypeError);
  assert.equal(readOmensCardPresentationForBuild(result), result);
});

test("representative pitch rarity treatment rear and two-face variants retain exact source values", () => {
  const record = reconciliation(), projection = faces();
  assert.deepEqual(project(record, projection, record[0], record[0].printings[0]), Object.assign({}, project(record, projection, record[0], record[0].printings[0]), { pitch: "1", rarity: "C", treatment: "N", rearMarker: null }));
  const blue = project(record, projection, record[2], record[2].printings[0]); assert.equal(blue.pitch, "3"); assert.equal(blue.rarity, "M"); assert.equal(blue.treatment, "CF"); assert.equal(blue.rearMarker, null);
  const secondFace = project(record, projection, record[3], record[3].printings[0], 20); assert.equal(secondFace.displayName, "Face One"); assert.equal(secondFace.faceLayoutPosition, 20); assert.match(secondFace.imageUrl, /3-20-n$/u);
});

test("foreign copied malformed, missing, ambiguous printing and face selections fail closed", () => {
  const record = reconciliation(), projection = faces();
  safe(() => project(Object.freeze([]), projection, record[1], record[1].printings[1]));
  safe(() => project(record, Object.freeze([]), record[1], record[1].printings[1]));
  safe(() => project(record, projection, { ...record[1] }, record[1].printings[1]));
  safe(() => project(record, projection, record[1], { ...record[1].printings[1] }));
  safe(() => project(record, projection, record[1], record[1].printings[0], 20));
  safe(() => project(record, projection, record[1], record[1].printings[1], 10.5));
  safe(() => readOmensCardPresentationForBuild(Object.freeze({})));
});

test("projection has no network or raw-byte parser boundary: checksum-verified capabilities remain upstream prerequisites", () => {
  const sourceText = readFileSync(new URL("../src/card-presentation.ts", import.meta.url), "utf8");
  assert.doesNotMatch(sourceText, /fetch\(|https?:\/\/|parseCardVaultResponseBytes|Uint8Array/u);
  assert.match(sourceText, /readOfficialUpstreamIdReconciliationForSuffixFoiling/u);
  assert.match(sourceText, /readOfficialCardVaultFaceProjectionForMultiplicityReconciliation/u);
});

const intrinsicContractName = "card presentation captures capability and membership methods before call-time poisoning";
const intrinsicContractMarker = "CARD_PRESENTATION_BOUND_REFERENCE_CONTRACT_EXECUTED";
const intrinsicModuleEnvironmentKey = "DRAFT_TABLE_TEST_CARD_PRESENTATION_MODULE";

const capabilitiesFrom = (modules) => {
  const officialMembership = modules.membership.validateCardVaultOfficialMembershipBytesAgainstFact(encode(response()), fact());
  return {
    reconciliation: modules.reconciliation.reconcileOfficialUpstreamIdRecordsForTest(forms, source(), Object.freeze({ entries: 5, omnEntries: 3, iarEntries: 2, omnPrintings: 4, iarPrintings: 2 })),
    faces: modules.faces.projectCardVaultOfficialFaceMetadataForTest(officialMembership, encode(response()), faceAggregate)
  };
};

test(intrinsicContractName, async () => {
  console.log(intrinsicContractMarker);
  const moduleUrl = process.env[intrinsicModuleEnvironmentKey] ?? new URL("../src/card-presentation.ts", import.meta.url).href;
  const directory = new URL("./", moduleUrl);
  const [presentation, reconciliationModule, facesModule, membershipModule] = await Promise.all([
    import(moduleUrl),
    import(new URL("official-upstream-id-reconciliation.ts", directory)),
    import(new URL("card-vault-face-projection.ts", directory)),
    import(new URL("card-vault-official-membership.ts", directory))
  ]);
  const capabilities = capabilitiesFrom({ reconciliation: reconciliationModule, faces: facesModule, membership: membershipModule });
  const identity = capabilities.reconciliation[1], printing = identity.printings[1];
  const includesDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, "includes");
  let projected, includesError;
  try {
    Object.defineProperty(Array.prototype, "includes", { configurable: true, writable: true, value: () => { throw new Error("poisoned includes"); } });
    projected = presentation.projectOmensOfficialCardPresentation(capabilities.reconciliation, capabilities.faces, identity, printing, 10);
  } catch (error) { includesError = error; } finally { Object.defineProperty(Array.prototype, "includes", includesDescriptor); }
  assert.equal(includesError, undefined, "BOUND_ARRAY_INCLUDES_MUST_SURVIVE_CALL_TIME_POISON");
  const weakSetHasDescriptor = Object.getOwnPropertyDescriptor(WeakSet.prototype, "has");
  let read, weakSetError;
  try {
    Object.defineProperty(WeakSet.prototype, "has", { configurable: true, writable: true, value: () => { throw new Error("poisoned weak set has"); } });
    read = presentation.readOmensCardPresentationForBuild(projected);
  } catch (error) { weakSetError = error; } finally { Object.defineProperty(WeakSet.prototype, "has", weakSetHasDescriptor); }
  assert.equal(weakSetError, undefined, "BOUND_WEAK_SET_HAS_MUST_SURVIVE_CALL_TIME_POISON");
  assert.equal(read, projected);
});

test("call-time intrinsic lookup mutations fail the named card-presentation bound-reference contract", () => {
  const sourcePath = new URL("../src/card-presentation.ts", import.meta.url);
  const original = readFileSync(sourcePath, "utf8");
  const mutations = [
    [
      "array-includes",
      "const arrayIncludes = Function.prototype.call.bind(Array.prototype.includes) as (values: readonly unknown[], value: unknown) => boolean;",
      "const arrayIncludes = ((values: readonly unknown[], value: unknown) => values.includes(value)) as (values: readonly unknown[], value: unknown) => boolean;",
      "BOUND_ARRAY_INCLUDES_MUST_SURVIVE_CALL_TIME_POISON"
    ],
    [
      "weak-set-has",
      "const weakSetHas = Function.prototype.call.bind(WeakSet.prototype.has) as (set: WeakSet<object>, value: object) => boolean;",
      "const weakSetHas = ((set: WeakSet<object>, value: object) => WeakSet.prototype.has.call(set, value)) as (set: WeakSet<object>, value: object) => boolean;",
      "BOUND_WEAK_SET_HAS_MUST_SURVIVE_CALL_TIME_POISON"
    ]
  ];
  for (const [label, anchor, replacement, failureMarker] of mutations) {
    assert.equal(original.split(anchor).length - 1, 1, `${label} capture anchor must be unique`);
    const mutated = original.replace(anchor, replacement);
    let snapshot;
    try {
      snapshot = mkdtempSync(join(tmpdir(), `draft-table-card-presentation-${label}-`));
      const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url));
      for (const sourceFile of readdirSync(sourceDirectory).filter((candidate) => candidate.endsWith(".ts"))) copyFileSync(join(sourceDirectory, sourceFile), join(snapshot, sourceFile));
      symlinkSync(join(sourceDirectory, "../../../node_modules"), join(snapshot, "node_modules"), "dir");
      writeFileSync(join(snapshot, "card-presentation.ts"), mutated);
      writeFileSync(join(snapshot, "tsconfig.json"), '{"compilerOptions":{"target":"ES2022","module":"ES2022","moduleResolution":"bundler","strict":true,"noEmit":true,"allowImportingTsExtensions":true},"include":["*.ts"]}');
      const checked = spawnSync(join(snapshot, "node_modules", ".bin", "tsc"), ["-p", join(snapshot, "tsconfig.json")], { encoding: "utf8" });
      assert.equal(checked.status, 0, `${label} isolated mutation must typecheck\n${checked.stdout}\n${checked.stderr}`);
      const environment = { ...process.env, [intrinsicModuleEnvironmentKey]: pathToFileURL(join(snapshot, "card-presentation.ts")).href };
      delete environment.NODE_TEST_CONTEXT;
      const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--test-name-pattern", `^${intrinsicContractName}$`, fileURLToPath(import.meta.url)], { encoding: "utf8", env: environment });
      const lines = result.stdout.split(/\r?\n/u);
      assert.equal(result.status, 1, `${label} mutation did not fail the focused contract\n${result.stdout}\n${result.stderr}`);
      assert.equal(lines.filter((line) => line === `# ${intrinsicContractMarker}`).length, 1, `${label} exact execution marker`);
      assert.equal(lines.filter((line) => /^not ok \d+ - /u.test(line) && line.endsWith(intrinsicContractName)).length, 1, `${label} exact named contract failure`);
      assert.equal(lines.filter((line) => line.includes(failureMarker)).length, 1, `${label} exact failure marker`);
    } finally { if (snapshot !== undefined) rmSync(snapshot, { recursive: true, force: true }); }
  }
});
