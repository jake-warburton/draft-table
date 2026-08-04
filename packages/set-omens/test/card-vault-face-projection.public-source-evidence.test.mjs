import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateCardVaultOmensOfficialMembership } from "../src/index.ts";
import { projectOfficialCardVaultFaceMetadata } from "../src/schema-validation.ts";

const cardPath = process.env.FAB_CARD_SOURCE_EVIDENCE_PATH;
const schemaPath = process.env.FAB_CARD_SCHEMA_EVIDENCE_PATH;
const cardVaultPath = process.env.FAB_CARD_VAULT_EVIDENCE_PATH;
const available = Boolean(cardPath && schemaPath && cardVaultPath);

test("the three checksum-verified public sources establish only pinned official Card Vault face and rendition aggregates", {
  skip: !available ? "public source acceptance did not run; set all three evidence paths or use npm run test:public-source-evidence" : false
}, () => {
  const faces = projectOfficialCardVaultFaceMetadata(
    validateCardVaultOmensOfficialMembership(readFileSync(cardVaultPath)),
    readFileSync(cardVaultPath)
  );
  const grouped = (predicate) => faces.filter((entry) => predicate(entry.print_id));
  const countFaces = (entries) => entries.reduce((total, entry) => total + entry.faces.length, 0);
  const unsuffixed = grouped((id) => !id.endsWith("-RF") && !id.endsWith("-CF") && !id.endsWith("-MV"));
  const rf = grouped((id) => id.endsWith("-RF")); const cf = grouped((id) => id.endsWith("-CF")); const mv = grouped((id) => id.endsWith("-MV"));
  const allFaces = faces.flatMap((entry) => entry.faces);
  const allUrls = allFaces.flatMap((face) => [face.image.small, face.image.normal, face.image.large]);
  assert.equal(faces.length, 260); assert.equal(allFaces.length, 262);
  assert.equal(faces.filter((entry) => entry.faces.length === 1).length, 258); assert.equal(faces.filter((entry) => entry.faces.length === 2).length, 2);
  assert.equal(allFaces.filter((face) => face.layout_position === 10).length, 260); assert.equal(allFaces.filter((face) => face.layout_position === 20).length, 2);
  assert.equal(new Set(allFaces.map((face) => face.image.small)).size, 262); assert.equal(new Set(allFaces.map((face) => face.image.normal)).size, 262); assert.equal(new Set(allFaces.map((face) => face.image.large)).size, 262); assert.equal(new Set(allUrls).size, 786);
  assert.equal(unsuffixed.length, 242); assert.equal(countFaces(unsuffixed), 242); assert.ok(unsuffixed.every((entry) => entry.faces.length === 1));
  assert.equal(rf.length, 6); assert.equal(countFaces(rf), 6); assert.ok(rf.every((entry) => entry.faces.length === 1));
  assert.equal(cf.length, 3); assert.equal(countFaces(cf), 3); assert.ok(cf.every((entry) => entry.faces.length === 1));
  assert.equal(mv.length, 9); assert.equal(countFaces(mv), 11); assert.equal(mv.filter((entry) => entry.faces.length === 1).length, 7); assert.equal(mv.filter((entry) => entry.faces.length === 2).length, 2);
});
