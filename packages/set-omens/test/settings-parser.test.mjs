import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  OmensRecipeSettingsError,
  parseVerifiedOmensSettings,
  verifyOmensRecipeBytes
} from "../src/index.ts";
import { parseOmensSettingsFromTrustedBytes } from "../src/settings.ts";

const privateEvidencePath = process.env.OMENS_RECIPE_EVIDENCE_PATH;
const source = (settings, later = "opaque later recipe body") =>
  Buffer.from(`\ufeff[Settings]\r\n${settings}\r\n[CustomCards]\r\n${later}`, "utf8");
const validSettings = JSON.stringify({
  showSlots: true,
  withReplacement: false,
  cardBack: "https://cards.invalid/back.png"
});

const expectSettingsError = (bytes) => {
  assert.throws(
    () => parseOmensSettingsFromTrustedBytes(bytes),
    (error) => {
      assert.ok(error instanceof OmensRecipeSettingsError);
      assert.equal(error.code, "OMENS_RECIPE_SETTINGS_INVALID");
      assert.equal(error.message, "Omens recipe settings are invalid.");
      assert.equal(error.stack, "OmensRecipeSettingsError: Omens recipe settings are invalid.");
      assert.deepEqual(JSON.parse(JSON.stringify(error)), {
        code: "OMENS_RECIPE_SETTINGS_INVALID",
        name: "OmensRecipeSettingsError"
      });
      return true;
    }
  );
};

test("parses the exact synthetic Settings envelope shape without exposing card-back evidence", () => {
  const settings = parseOmensSettingsFromTrustedBytes(source(validSettings));

  assert.deepEqual(settings, { withReplacement: false });
  assert.ok(Object.isFrozen(settings));
  assert.throws(() => {
    settings.withReplacement = true;
  }, TypeError);
  assert.equal("cardBack" in settings, false);
  assert.equal("showSlots" in settings, false);
});

test("rejects missing or duplicate Settings sections and malformed section framing", () => {
  expectSettingsError(source(validSettings).subarray(3).slice());
  expectSettingsError(Buffer.from(`\ufeff[Settings]\r\n${validSettings}\r\n[Settings]\r\nopaque`, "utf8"));
  expectSettingsError(Buffer.from(`\ufeff[Settings\r\n${validSettings}\r\n[CustomCards]\r\nopaque`, "utf8"));
  expectSettingsError(Buffer.from(`\ufeff[Settings]\r\n${validSettings}`, "utf8"));
  expectSettingsError(Buffer.from(`\ufeff[Settings]\r\n${validSettings}\r\n[Layouts]\r\nopaque`, "utf8"));
});

test("rejects malformed Settings JSON and its exact key and value contract", () => {
  expectSettingsError(source('{"showSlots":true'));
  expectSettingsError(source(JSON.stringify({ withReplacement: false, cardBack: "https://cards.invalid/back.png" })));
  expectSettingsError(source(JSON.stringify({ showSlots: true, withReplacement: false, cardBack: "https://cards.invalid/back.png", extra: true })));
  expectSettingsError(source(JSON.stringify({ showSlots: false, withReplacement: false, cardBack: "https://cards.invalid/back.png" })));
  expectSettingsError(source(JSON.stringify({ showSlots: true, withReplacement: true, cardBack: "https://cards.invalid/back.png" })));
  expectSettingsError(source(JSON.stringify({ showSlots: true, withReplacement: false, cardBack: "http://cards.invalid/back.png" })));
  expectSettingsError(source(JSON.stringify({ showSlots: "true", withReplacement: false, cardBack: "https://cards.invalid/back.png" })));
  expectSettingsError(source(JSON.stringify({ showSlots: true, withReplacement: "false", cardBack: "https://cards.invalid/back.png" })));
  expectSettingsError(source(JSON.stringify({ showSlots: true, withReplacement: false, cardBack: 1 })));
});

test("requires strict UTF-8, a BOM, CRLF-only lines, and no terminal newline", () => {
  expectSettingsError(Buffer.from(`[Settings]\r\n${validSettings}\r\n[CustomCards]\r\nopaque`, "utf8"));
  expectSettingsError(Buffer.from(`\ufeff[Settings]\n${validSettings}\n[CustomCards]\nopaque`, "utf8"));
  expectSettingsError(Buffer.from(`\ufeff[Settings]\r\n${validSettings}\r\n[CustomCards]\r\nopaque\r\n`, "utf8"));
  expectSettingsError(new Uint8Array([0xef, 0xbb, 0xbf, 0x5b, 0x53, 0x65, 0x74, 0x74, 0x69, 0x6e, 0x67, 0x73, 0x5d, 0x0d, 0x0a, 0xc3]));
});

test("does not interpret later recipe bodies", () => {
  assert.deepEqual(
    parseOmensSettingsFromTrustedBytes(source(validSettings, "{ definitely not valid later JSON or DSL [Settings-like text] }")),
    { withReplacement: false }
  );
});

test("settings errors never disclose source evidence", () => {
  const sensitiveSource = source(JSON.stringify({
    showSlots: true,
    withReplacement: false,
    cardBack: "https://private.invalid/secret",
    extra: true
  }));

  assert.throws(
    () => parseOmensSettingsFromTrustedBytes(sensitiveSource),
    (error) => {
      const disclosure = `${error.message}\n${error.stack}\n${JSON.stringify(error)}`;
      assert.doesNotMatch(disclosure, /private|secret|https:|cards\.invalid|\//i);
      return true;
    }
  );
});

test("the public parser requires a pinned verified Omens recipe", () => {
  assert.throws(() => parseVerifiedOmensSettings(Object.freeze({})), TypeError);
});

test("private settings parse passed", { skip: privateEvidencePath === undefined }, () => {
  const recipe = verifyOmensRecipeBytes(readFileSync(privateEvidencePath));
  const settings = parseVerifiedOmensSettings(recipe);

  assert.deepEqual(settings, { withReplacement: false });
  assert.ok(Object.isFrozen(settings));
});
