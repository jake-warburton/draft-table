import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
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
