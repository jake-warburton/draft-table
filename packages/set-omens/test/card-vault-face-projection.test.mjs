import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import {
  CardVaultFaceProjectionError,
  projectCardVaultOfficialFaceMetadataForTest
} from "../src/card-vault-face-projection.ts";
import { validateCardVaultOfficialMembershipBytesAgainstFact } from "../src/card-vault-official-membership.ts";
import { projectOfficialCardVaultFaceMetadata } from "../src/schema-validation.ts";

const host = "legendstory-production-s3-public.s3.amazonaws.com";
const encode = (value) => new TextEncoder().encode(value);
const factFor = (ids) => {
  const canonical = `${[...ids].sort().join("\n")}\n`;
  return Object.freeze({ total: ids.length, omn: ids.filter((id) => id.startsWith("OMN")).length, iar: ids.filter((id) => id.startsWith("IAR")).length, byteLength: Buffer.byteLength(canonical), sha256: createHash("sha256").update(canonical).digest("hex") });
};
const url = (id, position, rendition, authority = host) => `https://${authority}/${id}-${position}-${rendition}.jpg`;
const response = (specs, options = {}) => JSON.stringify({ product_name: "Omens of the Third Age", release_date: "2026-06-05", cards: specs.map(({ id, positions = [10] }) => ({ print_id: id, faces: positions.map((layout_position) => ({ layout_position, image: { small: url(id, layout_position, "small", options.authority), normal: url(id, layout_position, "normal", options.authority), large: url(id, layout_position, "large", options.authority) } })) })) });
const specs = [{ id: "OMN001" }, { id: "OMN002-RF" }, { id: "OMN003-CF" }, { id: "IAR001-MV", positions: [10, 20] }, { id: "IAR002-MV" }];
const ids = specs.map((entry) => entry.id);
const aggregate = Object.freeze({ entries: 5, faces: 6, oneFaceEntries: 4, twoFaceEntries: 1, position10Faces: 5, position20Faces: 1, smallUrls: 6, normalUrls: 6, largeUrls: 6, allUrls: 18, unsuffixedEntries: 1, unsuffixedFaces: 1, unsuffixedOneFaceEntries: 1, unsuffixedTwoFaceEntries: 0, rfEntries: 1, rfFaces: 1, rfOneFaceEntries: 1, rfTwoFaceEntries: 0, cfEntries: 1, cfFaces: 1, cfOneFaceEntries: 1, cfTwoFaceEntries: 0, mvEntries: 2, mvFaces: 3, mvOneFaceEntries: 1, mvTwoFaceEntries: 1 });
const membership = () => validateCardVaultOfficialMembershipBytesAgainstFact(encode(response(specs)), factFor(ids));
const project = (input = response(specs), expected = aggregate, capability = membership()) => projectCardVaultOfficialFaceMetadataForTest(capability, encode(input), expected);
const safe = (action) => assert.throws(action, (error) => {
  assert.ok(error instanceof CardVaultFaceProjectionError);
  assert.equal(error.code, "CARD_VAULT_FACE_PROJECTION_INVALID");
  assert.equal(error.message, "Official Card Vault face projection is invalid.");
  assert.equal(error.stack, "CardVaultFaceProjectionError: Official Card Vault face projection is invalid.");
  assert.deepEqual(JSON.parse(JSON.stringify(error)), { name: "CardVaultFaceProjectionError", code: "CARD_VAULT_FACE_PROJECTION_INVALID" });
  assert.doesNotMatch(`${error.message}${error.stack}${JSON.stringify(error)}`, /OMN|IAR|Fictional|[0-9]|https?:|\|\//);
  return true;
});

const rewrite = (input, change) => JSON.stringify(change(JSON.parse(input)));

test("capability-bound face projection preserves canonical membership order across cosmetic response order changes", () => {
  const reordered = response([...specs].reverse());
  const result = project(reordered);
  assert.deepEqual(result.map((entry) => entry.print_id), [...ids].sort());
  assert.deepEqual(project(` { "cards" : ${JSON.stringify(JSON.parse(reordered).cards)} , "release_date":"2026-06-05", "product_name":"Omens of the Third Age" } `).map((entry) => entry.print_id), [...ids].sort());
  safe(() => project(response([...specs, { id: "OMN999" }])));
  safe(() => project(response(specs), aggregate, Object.freeze({})));
});

test("face projection accepts only dense ordered one-or-two-face forms and complete exact rendition URLs", () => {
  const cases = [
    (x) => { x.cards[0].faces = []; return x; },
    (x) => { x.cards[0].faces.push(x.cards[0].faces[0], x.cards[0].faces[0]); return x; },
    (x) => { x.cards[3].faces.reverse(); return x; },
    (x) => { x.cards[0].faces[0].layout_position = 11; return x; },
    (x) => { x.cards[0].faces[0].layout_position = 10.5; return x; },
    (x) => { x.cards[0].faces[0].image = null; return x; },
    (x) => { delete x.cards[0].faces[0].image.small; return x; },
    (x) => { x.cards[0].faces[0].image.small = `http://${host}/x`; return x; },
    (x) => { x.cards[0].faces[0].image.small = `https://other.invalid/x`; return x; },
    (x) => { x.cards[0].faces[0].image.small = ` https://${host}/x`; return x; },
    (x) => { x.cards[0].faces[0].image.small = `https://${host}/e\u0301`; return x; },
    (x) => { x.cards[0].faces[0].image.small = `https://${host}/x\n`; return x; },
    (x) => { x.cards[0].faces[0].image.normal = x.cards[0].faces[0].image.small; return x; }
  ];
  for (const change of cases) safe(() => project(rewrite(response(specs), change)));
});

test("malformed response boundaries, nested duplicate keys, and immutable independent output fail closed or remain isolated", () => {
  for (const value of ["[]", "{}", "{} {}", '{"product_name":"Omens of the Third Age","release_date":"2026-06-05","cards":[{"print_id":"OMN001","faces":{"x":1,"x":2}}]}']) safe(() => project(value));
  safe(() => projectOfficialCardVaultFaceMetadata(membership(), new Uint8Array([0xc3, 0x28])));
  const first = project(); const second = project();
  assert.ok(Object.isFrozen(first) && Object.isFrozen(first[0]) && Object.isFrozen(first[0].faces) && Object.isFrozen(first[0].faces[0]) && Object.isFrozen(first[0].faces[0].image));
  assert.notEqual(first, second); assert.notEqual(first[0], second[0]); assert.notEqual(first[0].faces[0].image, second[0].faces[0].image);
  assert.throws(() => { first[0].faces[0].image.small = "x"; }, TypeError);
});

const positionContract = "face projection position guard rejects reversed source order";
const positionMarker = "FACE_POSITION_CONTRACT_EXECUTED";
const mutationEnvironmentKey = "DRAFT_TABLE_TEST_FACE_PROJECTION_MODULE";
test(positionContract, async () => {
  console.log(positionMarker);
  const module = process.env[mutationEnvironmentKey] ? await import(process.env[mutationEnvironmentKey]) : { CardVaultFaceProjectionError, projectCardVaultOfficialFaceMetadataForTest };
  assert.throws(() => module.projectCardVaultOfficialFaceMetadataForTest(membership(), encode(response([{ id: "OMN001" }, { id: "OMN002-RF" }, { id: "OMN003-CF" }, { id: "IAR001-MV", positions: [20, 10] }, { id: "IAR002-MV" }])), aggregate), module.CardVaultFaceProjectionError, "POSITION_GUARD_REJECTED_REVERSED_ORDER");
});

test("face projection semantic mutation ownership catches the position guard through its named contract", () => {
  const sourcePath = new URL("../src/card-vault-face-projection.ts", import.meta.url);
  const original = readFileSync(sourcePath, "utf8");
  const mutated = original.replace("retainedFace.layout_position !== (index === 0 ? 10 : 20)", "false");
  assert.notEqual(mutated, original, "position guard present");
  const path = `${dirname(fileURLToPath(sourcePath))}/face-projection-mutation-${process.pid}-positions.ts`;
  writeFileSync(path, mutated);
  try {
    const env = { ...process.env, [mutationEnvironmentKey]: pathToFileURL(path).href }; delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--test-name-pattern", `^${positionContract}$`, fileURLToPath(import.meta.url)], { encoding: "utf8", env });
    const lines = result.stdout.split(/\r?\n/);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.equal(lines.filter((line) => line === `# ${positionMarker}`).length, 1);
    assert.equal(lines.filter((line) => /^not ok \d+ - /.test(line) && line.endsWith(positionContract)).length, 1);
    assert.equal(lines.filter((line) => line.includes("Missing expected exception") && line.includes("POSITION_GUARD_REJECTED_REVERSED_ORDER")).length, 1);
  } finally { rmSync(path, { force: true }); }
});

const credentialContractName = "face projection rejects credential-bearing rendition URLs while exact authority passes";
const credentialContractMarker = "FACE_CREDENTIAL_CONTRACT_EXECUTED";
const credentialMutationEnvironmentKey = "DRAFT_TABLE_TEST_FACE_CREDENTIAL_MODULE";

test(credentialContractName, async () => {
  console.log(credentialContractMarker);
  const module = process.env[credentialMutationEnvironmentKey]
    ? await import(process.env[credentialMutationEnvironmentKey])
    : { CardVaultFaceProjectionError, projectCardVaultOfficialFaceMetadataForTest };
  assert.doesNotThrow(() => module.projectCardVaultOfficialFaceMetadataForTest(membership(), encode(response(specs)), aggregate));
  const credentialResponse = response(specs, { authority: `user:pw@${host}` });
  assert.throws(() => module.projectCardVaultOfficialFaceMetadataForTest(membership(), encode(credentialResponse), aggregate), module.CardVaultFaceProjectionError, "CREDENTIAL_GUARD_REJECTED_USERINFO_URL");
});

test("face projection credential mutation is caught by its named authority contract", () => {
  const sourcePath = new URL("../src/card-vault-face-projection.ts", import.meta.url);
  const original = readFileSync(sourcePath, "utf8");
  const mutated = original.replace("url.username !== \"\" || url.password !== \"\"", "(url.username !== \"\" || url.password !== \"\") && false");
  assert.notEqual(mutated, original, "credential guard present");
  const path = `${dirname(fileURLToPath(sourcePath))}/face-projection-mutation-${process.pid}-credentials.ts`;
  writeFileSync(path, mutated);
  try {
    const env = { ...process.env, [credentialMutationEnvironmentKey]: pathToFileURL(path).href }; delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--test-name-pattern", `^${credentialContractName}$`, fileURLToPath(import.meta.url)], { encoding: "utf8", env });
    const lines = result.stdout.split(/\r?\n/);
    assert.equal(result.status, 1, `credential mutation did not fail named contract\n${result.stdout}\n${result.stderr}`);
    assert.equal(lines.filter((line) => line === `# ${credentialContractMarker}`).length, 1);
    assert.equal(lines.filter((line) => /^not ok \d+ - /.test(line) && line.endsWith(credentialContractName)).length, 1);
    assert.equal(lines.filter((line) => line.includes("Missing expected exception") && line.includes("CREDENTIAL_GUARD_REJECTED_USERINFO_URL")).length, 1);
  } finally { rmSync(path, { force: true }); }
});

const portContractName = "face projection rejects explicit-port rendition URLs while exact authority passes";
const portContractMarker = "FACE_PORT_CONTRACT_EXECUTED";
const portMutationEnvironmentKey = "DRAFT_TABLE_TEST_FACE_PORT_MODULE";

test(portContractName, async () => {
  console.log(portContractMarker);
  const module = process.env[portMutationEnvironmentKey]
    ? await import(process.env[portMutationEnvironmentKey])
    : { CardVaultFaceProjectionError, projectCardVaultOfficialFaceMetadataForTest };
  assert.doesNotThrow(() => module.projectCardVaultOfficialFaceMetadataForTest(membership(), encode(response(specs)), aggregate));
  for (const authority of [`${host}:8443`, `${host}:443`]) {
    const portResponse = response(specs, { authority });
    assert.throws(() => module.projectCardVaultOfficialFaceMetadataForTest(membership(), encode(portResponse), aggregate), module.CardVaultFaceProjectionError, "PORT_GUARD_REJECTED_EXPLICIT_PORT_URL");
  }
});

test("face projection port mutation is caught by its named authority contract", () => {
  const sourcePath = new URL("../src/card-vault-face-projection.ts", import.meta.url);
  const original = readFileSync(sourcePath, "utf8");
  const mutated = original.replace("(url.port !== \"\" || hasExplicitPort(text))", "(url.port !== \"\" || hasExplicitPort(text)) && false");
  assert.notEqual(mutated, original, "port guard present");
  const path = `${dirname(fileURLToPath(sourcePath))}/face-projection-mutation-${process.pid}-port.ts`;
  writeFileSync(path, mutated);
  try {
    const env = { ...process.env, [portMutationEnvironmentKey]: pathToFileURL(path).href }; delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--test-name-pattern", `^${portContractName}$`, fileURLToPath(import.meta.url)], { encoding: "utf8", env });
    const lines = result.stdout.split(/\r?\n/);
    assert.equal(result.status, 1, `port mutation did not fail named contract\n${result.stdout}\n${result.stderr}`);
    assert.equal(lines.filter((line) => line === `# ${portContractMarker}`).length, 1);
    assert.equal(lines.filter((line) => /^not ok \d+ - /.test(line) && line.endsWith(portContractName)).length, 1);
    assert.equal(lines.filter((line) => line.includes("Missing expected exception") && line.includes("PORT_GUARD_REJECTED_EXPLICIT_PORT_URL")).length, 1);
  } finally { rmSync(path, { force: true }); }
});

test("aggregate and suffix split guards reject every independently pinned aggregate drift", () => {
  for (const key of Object.keys(aggregate)) safe(() => project(response(specs), { ...aggregate, [key]: aggregate[key] + 1 }));
});
