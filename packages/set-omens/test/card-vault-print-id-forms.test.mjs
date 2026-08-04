import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  validateCardVaultOfficialMembershipBytesAgainstFact
} from "../src/card-vault-official-membership.ts";
import {
  CardVaultPrintIdFormsError,
  readOfficialCardVaultPrintIdForms
} from "../src/card-vault-print-id-forms.ts";

const encode = (value) => new TextEncoder().encode(value);
const officialIds = () => [
  ...Array.from({ length: 242 }, (_, index) => `OMN${String(index + 1).padStart(3, "0")}`),
  ...Array.from({ length: 6 }, (_, index) => `OMN${String(index + 243).padStart(3, "0")}-RF`),
  ...Array.from({ length: 3 }, (_, index) => `OMN${String(index + 249).padStart(3, "0")}-CF`),
  ...Array.from({ length: 9 }, (_, index) => `IAR${String(index + 1).padStart(3, "0")}-MV`)
];
const response = (ids) => JSON.stringify({
  product_name: "Omens of the Third Age",
  release_date: "2026-06-05",
  cards: ids.map((print_id) => ({ print_id }))
});
const factFor = (ids) => {
  const canonical = `${[...ids].sort().join("\n")}\n`;
  return Object.freeze({
    total: ids.length,
    omn: ids.filter((id) => id.startsWith("OMN")).length,
    iar: ids.filter((id) => id.startsWith("IAR")).length,
    byteLength: Buffer.byteLength(canonical),
    sha256: createHash("sha256").update(canonical).digest("hex")
  });
};
const membershipFor = (ids) => validateCardVaultOfficialMembershipBytesAgainstFact(encode(response(ids)), factFor(ids));
const classify = (ids = officialIds()) => readOfficialCardVaultPrintIdForms(membershipFor(ids));

const expectSafeError = (action) => assert.throws(action, (error) => {
  assert.ok(error instanceof CardVaultPrintIdFormsError);
  assert.equal(error.code, "CARD_VAULT_PRINT_ID_FORMS_INVALID");
  assert.equal(error.message, "Official Card Vault print-ID forms are invalid.");
  assert.equal(error.stack, "CardVaultPrintIdFormsError: Official Card Vault print-ID forms are invalid.");
  assert.deepEqual(JSON.parse(JSON.stringify(error)), { name: "CardVaultPrintIdFormsError", code: "CARD_VAULT_PRINT_ID_FORMS_INVALID" });
  assert.doesNotMatch(`${error.message}${error.stack}${JSON.stringify(error)}`, /OMN001|IAR001|242|251|260|Omens of the Third Age|2026-06-05|https?:|\\|\//);
  return true;
});

const replacing = (ids, before, after) => ids.map((id) => id === before ? after : id);

const invalidCases = () => {
  const ids = officialIds();
  return {
    grammar: replacing(ids, "OMN001", "OMN0001"),
    combination: replacing(ids, "OMN001", "IAR010"),
    counts: replacing(ids, "OMN001", "OMN001-RF"),
    distinct: replacing(ids, "OMN243-RF", "OMN001-RF")
  };
};

test("fictional capability-bound forms preserve grammar, forms, and canonical order", () => {
  const ids = officialIds().reverse();
  const forms = classify(ids);
  assert.deepEqual(forms.map((form) => form.officialPrintId), [...ids].sort());
  assert.deepEqual(forms[0], { officialPrintId: "IAR001-MV", baseCollectorId: "IAR001", sourceSet: "IAR", suffixMarker: "MV" });
  assert.deepEqual(forms.find((form) => form.officialPrintId === "OMN001"), { officialPrintId: "OMN001", baseCollectorId: "OMN001", sourceSet: "OMN", suffixMarker: null });
  assert.deepEqual(forms.find((form) => form.officialPrintId === "OMN243-RF"), { officialPrintId: "OMN243-RF", baseCollectorId: "OMN243", sourceSet: "OMN", suffixMarker: "RF" });
  assert.deepEqual(forms.find((form) => form.officialPrintId === "OMN249-CF"), { officialPrintId: "OMN249-CF", baseCollectorId: "OMN249", sourceSet: "OMN", suffixMarker: "CF" });
});

test("fictional forms are fresh, deeply immutable, and copy-safe", () => {
  const first = classify();
  const second = classify();
  assert.ok(Object.isFrozen(first));
  assert.ok(first.every(Object.isFrozen));
  assert.notEqual(first, second);
  assert.notEqual(first[0], second[0]);
  assert.throws(() => first.push({}), TypeError);
  assert.throws(() => { first[0].officialPrintId = "OMN999"; }, TypeError);
  assert.equal(second[0].officialPrintId, "IAR001-MV");
});

test("fictional forms reject forgery, grammar, pairings, aggregate drift, and duplicate bases safely", () => {
  expectSafeError(() => readOfficialCardVaultPrintIdForms(Object.freeze({})));
  for (const ids of Object.values(invalidCases())) expectSafeError(() => classify(ids));
  expectSafeError(() => classify(officialIds().slice(1)));
  expectSafeError(() => classify(replacing(officialIds(), "OMN001", "OMN001-X")));
  expectSafeError(() => classify(replacing(officialIds(), "OMN243-RF", "IAR010-RF")));
  expectSafeError(() => classify(replacing(officialIds(), "OMN249-CF", "IAR010-CF")));
  expectSafeError(() => classify(replacing(officialIds(), "IAR001-MV", "OMN252-MV")));
});

test("semantic mutation contracts own grammar, combination, count, and distinct-base guards", () => {
  const sourcePath = new URL("../src/card-vault-print-id-forms.ts", import.meta.url);
  const original = readFileSync(sourcePath, "utf8");
  const cases = invalidCases();
  const mutations = [
    ["grammar", [
      ["const FORM = /^(OMN|IAR)([0-9]{3})(?:-(RF|CF|MV))?$/;", "const FORM = /^(OMN|IAR)([0-9]{3,4})(?:-(RF|CF|MV))?$/;"]
    ]],
    ["combination", [
      ["if (sourceSet === \"OMN\" && suffixMarker === null) omn++;", "if (suffixMarker === null) omn++;"]
    ]],
    ["counts", [
      ["if (ids.length !== 260 || bases.size !== 260 || omn !== 242 || rf !== 6 || cf !== 3 || mv !== 9) {", "if (ids.length !== 260 || bases.size !== 260) {"]
    ]],
    ["distinct", [
      ["if (bases.has(baseCollectorId)) throw new CardVaultPrintIdFormsError();", "if (false) throw new CardVaultPrintIdFormsError();"],
      ["bases.size !== 260", "false"]
    ]]
  ];
  for (const [name, replacements] of mutations) {
    let mutated = original;
    for (const [before, after] of replacements) {
      const next = mutated.replace(before, after);
      assert.notEqual(next, mutated, `${name}: mutation target missing`);
      mutated = next;
    }
    const path = `${dirname(fileURLToPath(sourcePath))}/card-vault-forms-mutation-${process.pid}-${name}.ts`;
    writeFileSync(path, mutated);
    try {
      const program = `import { createHash } from 'node:crypto'; import { validateCardVaultOfficialMembershipBytesAgainstFact } from ${JSON.stringify(new URL("../src/card-vault-official-membership.ts", import.meta.url).href)}; import { readOfficialCardVaultPrintIdForms } from ${JSON.stringify(new URL(`file://${path}`).href)}; const ids=${JSON.stringify(cases[name])}; const canonical=[...ids].sort().join('\\n')+'\\n'; const fact={total:ids.length,omn:ids.filter(x=>x.startsWith('OMN')).length,iar:ids.filter(x=>x.startsWith('IAR')).length,byteLength:Buffer.byteLength(canonical),sha256:createHash('sha256').update(canonical).digest('hex')}; const body=JSON.stringify({product_name:'Omens of the Third Age',release_date:'2026-06-05',cards:ids.map(print_id=>({print_id}))}); const membership=validateCardVaultOfficialMembershipBytesAgainstFact(new TextEncoder().encode(body),fact); readOfficialCardVaultPrintIdForms(membership); console.log(${JSON.stringify(`MUTATION_ACCEPTED:`)}+${JSON.stringify(name)});`;
      const result = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", program], { encoding: "utf8" });
      assert.equal(result.status, 0, `${name}: named mutation did not execute successfully\n${result.stderr}`);
      assert.equal(result.stdout.trim(), `MUTATION_ACCEPTED:${name}`, `${name}: exact acceptance marker missing`);
    } finally {
      rmSync(path, { force: true });
    }
  }
});
