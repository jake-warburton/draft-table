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

const cardPath = process.env.FAB_CARD_SOURCE_EVIDENCE_PATH;
const schemaPath = process.env.FAB_CARD_SCHEMA_EVIDENCE_PATH;
const cardVaultPath = process.env.FAB_CARD_VAULT_EVIDENCE_PATH;
const available = Boolean(cardPath && schemaPath && cardVaultPath);

test("checksum-pinned public sources establish all-upstream domain, OMN official-base rows, all-official retained rows, exact IAR composition, and anomaly contexts", {
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
  const candidates = records.filter((record) => record.sourceSetMarker === "OMN" && record.suffixMarker === null);
  const omnUnsuffixedOfficialCandidateRaritySetCounts = new Map();
  for (const record of candidates) {
    const key = [...new Set(record.printings.map((row) => row.rarity))].sort().join("+");
    omnUnsuffixedOfficialCandidateRaritySetCounts.set(key, (omnUnsuffixedOfficialCandidateRaritySetCounts.get(key) ?? 0) + 1);
  }
  assert.deepEqual(Object.fromEntries(omnUnsuffixedOfficialCandidateRaritySetCounts), { "B+V": 7, B: 7, M: 33, R: 60, C: 132, "C+V": 2, "M+V": 1 });

  const anomalyIds = new Set(["OMN199", "OMN201"]);
  const anomalies = candidates.filter((record) => anomalyIds.has(record.officialPrintId));
  assert.equal(anomalies.length, 2);
  assert.deepEqual(new Set(anomalies.map((record) => record.officialPrintId)), anomalyIds);
  for (const record of anomalies) {
    assert.equal(record.baseCollectorId, record.officialPrintId);
    assert.deepEqual(new Set(record.printings.map((row) => row.rarity)), new Set(["C", "V"]));
    assert.equal(record.printings.length, 2);
    const commonRow = record.printings.find((row) => row.rarity === "C"); const variantRow = record.printings.find((row) => row.rarity === "V");
    assert.equal(commonRow.foiling, "S"); assert.deepEqual(commonRow.art_variations, []);
    assert.equal(variantRow.foiling, "C"); assert.deepEqual(variantRow.art_variations, ["AA", "FA"]);
  }
  assert.equal(records.some((record) => anomalyIds.has(record.baseCollectorId) && record.suffixMarker !== null), false);
});
