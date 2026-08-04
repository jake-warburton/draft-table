import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  OmensRecipeCustomCardsError,
  parseVerifiedOmensCustomCards,
  verifyOmensRecipeBytes
} from "../src/index.ts";
import {
  parseOmensCustomCardsFromTrustedBytes,
  validateOmensRecipeCustomCardsAggregate
} from "../src/custom-cards.ts";

const privateEvidencePath = process.env.OMENS_RECIPE_EVIDENCE_PATH;
const settings = JSON.stringify({
  showSlots: true,
  withReplacement: false,
  cardBack: "https://cards.invalid/back.png"
});
const card = (overrides = {}) => ({
  name: "Fictional Aster",
  collector_number: "OMN-001",
  mana_cost: "2",
  rarity: "common",
  type: "action",
  image_uris: { en: "https://cards.invalid/fictional-aster.png" },
  ...overrides
});
const source = (cards, later = "opaque later recipe body") => Buffer.from(
  `\ufeff[Settings]\r\n${settings}\r\n[CustomCards]\r\n${JSON.stringify(cards)}\r\n[Layouts]\r\n${later}`,
  "utf8"
);

const expectCustomCardsError = (bytes) => {
  assert.throws(
    () => parseOmensCustomCardsFromTrustedBytes(bytes),
    (error) => {
      assert.ok(error instanceof OmensRecipeCustomCardsError);
      assert.equal(error.code, "OMENS_RECIPE_CUSTOM_CARDS_INVALID");
      assert.equal(error.message, "Omens recipe custom cards are invalid.");
      assert.equal(error.stack, "OmensRecipeCustomCardsError: Omens recipe custom cards are invalid.");
      assert.deepEqual(JSON.parse(JSON.stringify(error)), {
        code: "OMENS_RECIPE_CUSTOM_CARDS_INVALID",
        name: "OmensRecipeCustomCardsError"
      });
      return true;
    }
  );
};

test("parses minimal immutable recipe references from synthetic CustomCards records", () => {
  const references = parseOmensCustomCardsFromTrustedBytes(source([
    card(),
    card({ name: "Fictional Beacon", collector_number: "OMN-002", rarity: "rare" }),
    card({ name: "Fictional Cipher", collector_number: "OMN-003", rarity: "mythic" })
  ]));

  assert.deepEqual(references, [
    { name: "Fictional Aster", collectorNumber: "OMN-001", rarity: "common" },
    { name: "Fictional Beacon", collectorNumber: "OMN-002", rarity: "rare" },
    { name: "Fictional Cipher", collectorNumber: "OMN-003", rarity: "mythic" }
  ]);
  assert.ok(Object.isFrozen(references));
  assert.ok(references.every(Object.isFrozen));
  assert.throws(() => { references[0].name = "changed"; }, TypeError);
  assert.throws(() => { references.push({}); }, TypeError);
  assert.equal("image_uris" in references[0], false);
  assert.equal("type" in references[0], false);
});

test("rejects incorrect Omens aggregate totals and rarity distributions", () => {
  const references = (common, rare, mythic) => parseOmensCustomCardsFromTrustedBytes(source([
    ...Array.from({ length: common }, (_, index) => card({ name: `Common ${index}`, collector_number: `C-${index}` })),
    ...Array.from({ length: rare }, (_, index) => card({ name: `Rare ${index}`, collector_number: `R-${index}`, rarity: "rare" })),
    ...Array.from({ length: mythic }, (_, index) => card({ name: `Mythic ${index}`, collector_number: `M-${index}`, rarity: "mythic" }))
  ]));

  for (const invalidReferences of [
    references(133, 60, 15),
    references(135, 60, 15),
    references(133, 61, 15)
  ]) {
    assert.throws(
      () => validateOmensRecipeCustomCardsAggregate(invalidReferences),
      OmensRecipeCustomCardsError
    );
  }
});

test("validates CustomCards section framing while leaving later bodies uninterpreted", () => {
  assert.deepEqual(
    parseOmensCustomCardsFromTrustedBytes(source([card()], "{ not valid layout or pool data [CustomCards] }")),
    [{ name: "Fictional Aster", collectorNumber: "OMN-001", rarity: "common" }]
  );
  expectCustomCardsError(Buffer.from(`\ufeff[Settings]\r\n${settings}\r\n[Layouts]\r\n[]`, "utf8"));
  expectCustomCardsError(Buffer.from(`\ufeff[Settings]\r\n${settings}\r\n[CustomCards]\r\n[]\r\n[CustomCards]\r\nopaque`, "utf8"));
  expectCustomCardsError(Buffer.from(`\ufeff[Settings]\r\n${settings}\r\n[CustomCards]\r\n[]`, "utf8"));
});

test("rejects malformed JSON, top-level non-arrays, empty arrays, and exact schema violations", () => {
  expectCustomCardsError(source("["));
  expectCustomCardsError(source({ card: card() }));
  expectCustomCardsError(source([]));
  expectCustomCardsError(source([card({ extra: true })]));
  const missing = card(); delete missing.type;
  expectCustomCardsError(source([missing]));
  for (const field of ["name", "collector_number", "mana_cost", "rarity", "type"]) {
    expectCustomCardsError(source([card({ [field]: 1 })]));
  }
  expectCustomCardsError(source([card({ image_uris: "https://cards.invalid/image.png" })]));
  expectCustomCardsError(source([card({ image_uris: { en: "http://cards.invalid/image.png" } })]));
  expectCustomCardsError(source([card({ image_uris: { en: "   " } })]));
  expectCustomCardsError(source([card({ rarity: "legendary" })]));
  expectCustomCardsError(source([card({ name: " Fictional Aster" })]));
  expectCustomCardsError(source([card({ collector_number: "OMN-001\n" })]));
  expectCustomCardsError(source([card({ mana_cost: "" })]));
  expectCustomCardsError(source([card({ type: "action", name: "Fictional Aster" }), card({ name: "Fictional Aster", collector_number: "OMN-002" })]));
  expectCustomCardsError(source([card(), card({ name: "Fictional Beacon" })]));
  expectCustomCardsError(Buffer.from(`\ufeff[Settings]\r\n${settings}\r\n[CustomCards]\r\n[{"name":"Fictional Aster","name":"Other"}]\r\n[Layouts]\r\nopaque`, "utf8"));
});

test("rejects C1 Unicode controls in every CustomCards textual field", () => {
  for (const [field, value] of [
    ["name", "Fictional\u0085Aster"],
    ["collector_number", "OMN-\u0085-001"],
    ["mana_cost", "2\u0085"],
    ["rarity", "common\u0085"],
    ["type", "action\u0085"],
    ["image_uris", { en: "https://cards.invalid/fictional-aster\u0085.png" }]
  ]) {
    expectCustomCardsError(source([card({ [field]: value })]));
  }
});

test("custom card errors never disclose source records", () => {
  const sensitive = source([card({ name: "Private Card Name", image_uris: { en: "https://private.invalid/secret" }, extra: true })]);
  assert.throws(() => parseOmensCustomCardsFromTrustedBytes(sensitive), (error) => {
    const disclosure = `${error.message}\n${error.stack}\n${JSON.stringify(error)}`;
    assert.doesNotMatch(disclosure, /private|secret|https:|fictional|\//i);
    return true;
  });
});

test("the public custom card parser requires a pinned verified Omens recipe", () => {
  assert.throws(() => parseVerifiedOmensCustomCards(Object.freeze({})), TypeError);
});

test("private CustomCards parse passed", { skip: !privateEvidencePath ? "private acceptance contract did not run; set OMENS_RECIPE_EVIDENCE_PATH or use npm run test:evidence" : false }, () => {
  const references = parseVerifiedOmensCustomCards(verifyOmensRecipeBytes(readFileSync(privateEvidencePath)));
  assert.ok(Object.isFrozen(references));
  assert.ok(references.every(Object.isFrozen));
});
