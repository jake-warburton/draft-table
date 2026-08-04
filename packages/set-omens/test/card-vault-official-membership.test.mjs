import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  CardVaultOfficialMembershipError,
  validateCardVaultOmensOfficialMembership
} from "../src/index.ts";
import {
  readOfficialCardVaultMembershipPrintIdsForReconciliation,
  validateCardVaultOfficialMembershipBytesAgainstFact
} from "../src/card-vault-official-membership.ts";

const encode = (value) => new TextEncoder().encode(value);
const response = (cards, extra = {}) => JSON.stringify({ product_name: "Omens of the Third Age", release_date: "2026-06-05", cards: cards.map((print_id) => ({ print_id })), ...extra });
const factFor = (ids) => {
  const canonical = `${[...ids].sort().join("\n")}\n`;
  return Object.freeze({ total: ids.length, omn: ids.filter((id) => id.startsWith("OMN")).length, iar: ids.filter((id) => id.startsWith("IAR")).length, byteLength: Buffer.byteLength(canonical), sha256: createHash("sha256").update(canonical).digest("hex") });
};
const ids = ["OMN002", "IAR001", "OMN001"];
const valid = (value = response(ids)) => validateCardVaultOfficialMembershipBytesAgainstFact(encode(value), factFor(ids));

const expectSafeError = (action) => assert.throws(action, (error) => {
  assert.ok(error instanceof CardVaultOfficialMembershipError);
  assert.equal(error.code, "CARD_VAULT_OFFICIAL_MEMBERSHIP_INVALID");
  assert.equal(error.message, "Official Card Vault membership is invalid.");
  assert.equal(error.stack, "CardVaultOfficialMembershipError: Official Card Vault membership is invalid.");
  assert.deepEqual(JSON.parse(JSON.stringify(error)), { name: "CardVaultOfficialMembershipError", code: "CARD_VAULT_OFFICIAL_MEMBERSHIP_INVALID" });
  assert.doesNotMatch(`${error.message}${error.stack}${JSON.stringify(error)}`, /OMN|IAR|omens|2026|cards|https?:|\\|\//i);
  return true;
});

test("fictional membership contracts canonicalize order, cosmetic JSON, and exactly one terminal newline", () => {
  const membership = valid();
  assert.ok(Object.isFrozen(membership));
  assert.deepEqual(Object.keys(membership), []);
  assert.deepEqual(readOfficialCardVaultMembershipPrintIdsForReconciliation(membership), ["IAR001", "OMN001", "OMN002"]);
  const reorderedCosmetic = '{ "cards" : [{"unused":{"a":1},"print_id":"OMN001"},{"print_id":"OMN002","label":"different"},{"print_id":"IAR001"}], "release_date":"2026-06-05", "product_name":"Omens of the Third Age", "ignored":true }';
  assert.deepEqual(readOfficialCardVaultMembershipPrintIdsForReconciliation(valid(reorderedCosmetic)), ["IAR001", "OMN001", "OMN002"]);
  assert.equal(createHash("sha256").update("IAR001\nOMN001\nOMN002\n").digest("hex"), factFor(ids).sha256);
});

test("fictional membership contracts reject duplicate, missing, extra, renamed, and prefix-count changes", () => {
  expectSafeError(() => valid(response(["OMN001", "OMN001", "IAR001"])));
  expectSafeError(() => valid(response(["OMN001", "IAR001"])));
  expectSafeError(() => valid(response([...ids, "OMN003"])));
  expectSafeError(() => valid(response(["OMN009", "IAR001", "OMN001"])));
  expectSafeError(() => validateCardVaultOfficialMembershipBytesAgainstFact(encode(response(["OMN001", "OMN002", "OMN003"])), factFor(ids)));
  expectSafeError(() => valid(response(["XYZ001", "IAR001", "OMN001"])));
});

test("fictional membership contracts strictly reject product facts, unsafe IDs, malformed encoding, duplicate keys, and root shapes", () => {
  for (const value of [
    JSON.stringify({ product_name: "Other", release_date: "2026-06-05", cards: [] }),
    JSON.stringify({ product_name: "Omens of the Third Age", release_date: "2026-01-01", cards: [] }),
    JSON.stringify({ product_name: "Omens of the Third Age", release_date: "2026-06-05", cards: {} }),
    response([" OMN001", "IAR001", "OMN002"]), response(["OMN001\n", "IAR001", "OMN002"]), response(["OMN001", "IAR001", "OMN\u0301002"]),
    '{"product_name":"Omens of the Third Age","product_name":"Omens of the Third Age","release_date":"2026-06-05","cards":[]}',
    '{"product_name":"Omens of the Third Age","release_date":"2026-06-05","cards":[{"print_id":"OMN001","nested":{"x":1,"x":2}}]}',
    "null", "[]", "{}", "{} {}"
  ]) expectSafeError(() => valid(value));
  expectSafeError(() => validateCardVaultOfficialMembershipBytesAgainstFact(new Uint8Array([0xc3, 0x28]), factFor(ids)));
});

test("membership capabilities retain private immutable IDs and only yield frozen independent copies", () => {
  const membership = valid();
  const first = readOfficialCardVaultMembershipPrintIdsForReconciliation(membership);
  const second = readOfficialCardVaultMembershipPrintIdsForReconciliation(membership);
  assert.ok(Object.isFrozen(first));
  assert.notEqual(first, second);
  assert.throws(() => { first[0] = "OMN999"; }, TypeError);
  assert.deepEqual(second, ["IAR001", "OMN001", "OMN002"]);
  expectSafeError(() => readOfficialCardVaultMembershipPrintIdsForReconciliation(Object.freeze({})));
  expectSafeError(() => validateCardVaultOmensOfficialMembership(encode(response(ids))));
});

test("semantic mutation contracts prove canonical sort, newline, digest, and count guards", () => {
  const sourcePath = new URL("../src/card-vault-official-membership.ts", import.meta.url);
  const original = readFileSync(sourcePath, "utf8");
  const mutations = [
    ["sort", "Object.freeze([...ids].sort())", "Object.freeze([...ids])"],
    ["newline", '`${ids.join("\\n")}\\n`', '`${ids.join("\\n")}`'],
    ["digest", "sha256Hex(canonicalBytes) !== fact.sha256", "false"],
    ["count", "ids.length !== fact.total", "false"]
  ];
  for (const [name, before, after] of mutations) {
    const mutated = original.replace(before, after);
    assert.notEqual(mutated, original, name);
    const path = `${dirname(fileURLToPath(sourcePath))}/card-vault-membership-mutation-${process.pid}-${name}.ts`;
    writeFileSync(path, mutated);
    try {
      const total = name === "count" ? 4 : 3;
      const digest = name === "digest" ? "'0'.repeat(64)" : "createHash('sha256').update(canonical).digest('hex')";
      const expected = name === "sort" || name === "newline" ? 0 : 42;
      const program = `import { validateCardVaultOfficialMembershipBytesAgainstFact } from ${JSON.stringify(new URL(`file://${path}`).href)}; import { createHash } from 'node:crypto'; const e=new TextEncoder(); const ids=['OMN002','IAR001','OMN001']; const canonical='IAR001\\nOMN001\\nOMN002\\n'; const fact={total:${total},omn:2,iar:1,byteLength:Buffer.byteLength(canonical),sha256:${digest}}; const body=JSON.stringify({product_name:'Omens of the Third Age',release_date:'2026-06-05',cards:ids.map(print_id=>({print_id}))}); try { validateCardVaultOfficialMembershipBytesAgainstFact(e.encode(body),fact); process.exit(42); } catch { process.exit(0); }`;
      const result = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", program], { encoding: "utf8" });
      assert.equal(result.status, expected, `${name}: named mutation did not produce its exact expected marker`);
    } finally { rmSync(path, { force: true }); }
  }
});
