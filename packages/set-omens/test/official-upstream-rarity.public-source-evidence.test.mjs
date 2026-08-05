import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  validateCardVaultOmensOfficialMembership,
  validateVerifiedFabCardSourceDocuments,
  verifyCardVaultOmensProductBytes,
  verifyFabCardSchemaBytes,
  verifyFabEnglishCardBytes
} from "../src/index.ts";
import {
  reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData,
  validateFabEnglishCardDataAgainstSchema
} from "../src/schema-validation.ts";
import { readSchemaValidatedFabEnglishCardDataForParser } from "../src/public-source-schema-validation.ts";

const ALL_UPSTREAM_PRINTING_ROW_TOTAL = 16_264;
const ALL_UPSTREAM_PRINTING_RARITY_CODE_DOMAIN = Object.freeze(["C", "R", "M", "P", "V", "T", "L", "S", "B", "F"]);
const OMN_OFFICIAL_BASE_RARITY_ROW_COUNTS = Object.freeze({ C: 251, R: 119, M: 68, V: 18, B: 14, L: 10, F: 2 });
const OMN_OFFICIAL_BASE_RARITY_ROW_TOTAL = 482;
const IAR_OFFICIAL_BASE_RARITY_ROW_COUNTS = Object.freeze({ V: 11 });
const IAR_OFFICIAL_BASE_RARITY_ROW_TOTAL = 11;
const ALL_OFFICIAL_RETAINED_RARITY_ROW_COUNTS = Object.freeze({ C: 251, R: 119, M: 68, V: 29, B: 14, L: 10, F: 2 });
const ALL_OFFICIAL_RETAINED_RARITY_ROW_TOTAL = 493;
const OMN_UNSUFFIXED_OFFICIAL_CANDIDATE_SOURCE_ORDER_RARITY_CODE_SEQUENCE_COUNTS = Object.freeze({
  "B,V,V": 6, B: 7, "M,M": 31, "R,R": 59, "C,C": 117, R: 1, C: 15, "C,V": 2, "B,V,V,V": 1, M: 2, "M,V": 1
});
const OMN_UNSUFFIXED_OFFICIAL_CANDIDATE_SOURCE_ORDER_RARITY_CODE_SEQUENCE_TOTAL = 242;
const OMN_UNSUFFIXED_OFFICIAL_CANDIDATE_FIRST_OBSERVED_UNIQUE_RARITY_CODE_SET_COUNTS = Object.freeze({
  "B,V": 7, B: 7, M: 33, R: 60, C: 132, "C,V": 2, "M,V": 1
});

const cardPath = process.env.FAB_CARD_SOURCE_EVIDENCE_PATH;
const schemaPath = process.env.FAB_CARD_SCHEMA_EVIDENCE_PATH;
const cardVaultPath = process.env.FAB_CARD_VAULT_EVIDENCE_PATH;
const available = Boolean(cardPath && schemaPath && cardVaultPath);

test("checksum-pinned public sources establish all-upstream rows, OMN/all-official retained rows, and OMN unsuffixed candidate sequence/set aggregates", {
  skip: !available ? "public source acceptance did not run; set all three evidence paths or use npm run test:public-source-evidence" : false
}, () => {
  const cardBytes = readFileSync(cardPath), schemaBytes = readFileSync(schemaPath), cardVaultBytes = readFileSync(cardVaultPath);
  verifyCardVaultOmensProductBytes(cardVaultBytes);
  const documents = validateVerifiedFabCardSourceDocuments(verifyFabEnglishCardBytes(cardBytes), verifyFabCardSchemaBytes(schemaBytes));
  const schemaValidated = validateFabEnglishCardDataAgainstSchema(documents.card, documents.schema);
  const allUpstreamPrintingRows = readSchemaValidatedFabEnglishCardDataForParser(schemaValidated).flatMap((card) => card.printings);
  assert.equal(allUpstreamPrintingRows.length, ALL_UPSTREAM_PRINTING_ROW_TOTAL);
  assert.deepEqual(new Set(allUpstreamPrintingRows.map((row) => row.rarity)), new Set(ALL_UPSTREAM_PRINTING_RARITY_CODE_DOMAIN));

  const records = reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData(
    validateCardVaultOmensOfficialMembership(cardVaultBytes), schemaValidated
  );
  const rarityCounts = (rows) => Object.fromEntries([...rows.reduce((counts, row) => counts.set(row.rarity, (counts.get(row.rarity) ?? 0) + 1), new Map()).entries()].sort(([left], [right]) => left.localeCompare(right)));
  const omnOfficialBaseRows = records.filter((record) => record.sourceSetMarker === "OMN").flatMap((record) => record.printings);
  const iarOfficialBaseRows = records.filter((record) => record.sourceSetMarker === "IAR").flatMap((record) => record.printings);
  const allOfficialRetainedRows = records.flatMap((record) => record.printings);
  assert.equal(omnOfficialBaseRows.length, OMN_OFFICIAL_BASE_RARITY_ROW_TOTAL);
  assert.deepEqual(rarityCounts(omnOfficialBaseRows), OMN_OFFICIAL_BASE_RARITY_ROW_COUNTS);
  assert.equal(iarOfficialBaseRows.length, IAR_OFFICIAL_BASE_RARITY_ROW_TOTAL);
  assert.deepEqual(rarityCounts(iarOfficialBaseRows), IAR_OFFICIAL_BASE_RARITY_ROW_COUNTS);
  assert.equal(allOfficialRetainedRows.length, ALL_OFFICIAL_RETAINED_RARITY_ROW_TOTAL);
  assert.deepEqual(rarityCounts(allOfficialRetainedRows), ALL_OFFICIAL_RETAINED_RARITY_ROW_COUNTS);
  assert.equal(OMN_OFFICIAL_BASE_RARITY_ROW_TOTAL + IAR_OFFICIAL_BASE_RARITY_ROW_TOTAL, ALL_OFFICIAL_RETAINED_RARITY_ROW_TOTAL);
  for (const rarity of new Set([...Object.keys(OMN_OFFICIAL_BASE_RARITY_ROW_COUNTS), ...Object.keys(IAR_OFFICIAL_BASE_RARITY_ROW_COUNTS)])) {
    assert.equal((OMN_OFFICIAL_BASE_RARITY_ROW_COUNTS[rarity] ?? 0) + (IAR_OFFICIAL_BASE_RARITY_ROW_COUNTS[rarity] ?? 0), ALL_OFFICIAL_RETAINED_RARITY_ROW_COUNTS[rarity]);
  }
  assert.deepEqual(Object.keys(IAR_OFFICIAL_BASE_RARITY_ROW_COUNTS), ["V"]);

  const omnUnsuffixedOfficialCandidates = records.filter((record) => record.sourceSetMarker === "OMN" && record.suffixMarker === null);
  const omnUnsuffixedOfficialCandidateSourceOrderRarityCodeSequenceCounts = Object.fromEntries([...omnUnsuffixedOfficialCandidates.reduce((counts, record) => {
    const key = record.printings.map((row) => row.rarity).join(","); return counts.set(key, (counts.get(key) ?? 0) + 1);
  }, new Map()).entries()].sort(([left], [right]) => left.localeCompare(right)));
  const omnUnsuffixedOfficialCandidateFirstObservedUniqueRarityCodeSetCounts = Object.fromEntries([...omnUnsuffixedOfficialCandidates.reduce((counts, record) => {
    const key = [...new Set(record.printings.map((row) => row.rarity))].sort().join(","); return counts.set(key, (counts.get(key) ?? 0) + 1);
  }, new Map()).entries()].sort(([left], [right]) => left.localeCompare(right)));
  assert.equal(omnUnsuffixedOfficialCandidates.length, OMN_UNSUFFIXED_OFFICIAL_CANDIDATE_SOURCE_ORDER_RARITY_CODE_SEQUENCE_TOTAL);
  assert.deepEqual(omnUnsuffixedOfficialCandidateSourceOrderRarityCodeSequenceCounts, OMN_UNSUFFIXED_OFFICIAL_CANDIDATE_SOURCE_ORDER_RARITY_CODE_SEQUENCE_COUNTS);
  assert.deepEqual(omnUnsuffixedOfficialCandidateFirstObservedUniqueRarityCodeSetCounts, OMN_UNSUFFIXED_OFFICIAL_CANDIDATE_FIRST_OBSERVED_UNIQUE_RARITY_CODE_SET_COUNTS);

  const anomalyIds = new Set(["OMN199", "OMN201"]);
  const anomalies = records.filter((record) => anomalyIds.has(record.officialPrintId));
  assert.deepEqual(new Set(anomalies.map((record) => record.officialPrintId)), anomalyIds);
  for (const record of anomalies) assert.deepEqual(record.printings.map((row) => row.rarity), ["C", "V"]);
});
