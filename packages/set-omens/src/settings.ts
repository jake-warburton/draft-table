const UTF8_BOM = new Uint8Array([0xef, 0xbb, 0xbf]);
const SECTION_HEADER = /^\[[A-Za-z][A-Za-z0-9]*\]$/;
const SETTINGS_HEADER = "[Settings]";
const CUSTOM_CARDS_HEADER = "[CustomCards]";
const EXPECTED_SETTINGS_KEYS = new Set(["showSlots", "withReplacement", "cardBack"]);

export class OmensRecipeSettingsError extends Error {
  readonly code = "OMENS_RECIPE_SETTINGS_INVALID";

  constructor() {
    super("Omens recipe settings are invalid.");
    this.name = "OmensRecipeSettingsError";
    this.stack = `${this.name}: ${this.message}`;
  }
}

export type OmensSettings = Readonly<{
  withReplacement: false;
}>;

const invalidSettings = (): never => {
  throw new OmensRecipeSettingsError();
};

const hasUtf8Bom = (bytes: Uint8Array): boolean =>
  UTF8_BOM.every((byte, index) => bytes[index] === byte);

const decodeEnvelope = (bytes: Uint8Array): string => {
  if (!hasUtf8Bom(bytes)) {
    return invalidSettings();
  }

  try {
    const source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes.subarray(UTF8_BOM.length));

    if (source.endsWith("\r\n") || /\r(?!\n)|(?<!\r)\n/.test(source)) {
      return invalidSettings();
    }

    return source;
  } catch {
    return invalidSettings();
  }
};

const hasExactlyExpectedKeys = (json: string, value: Record<string, unknown>): boolean => {
  const keyMatches = json.matchAll(/"((?:\\.|[^"\\])*)"\s*:/g);
  const keys: string[] = [];

  try {
    for (const match of keyMatches) {
      keys.push(JSON.parse(`"${match[1]}"`) as string);
    }
  } catch {
    return false;
  }

  return keys.length === EXPECTED_SETTINGS_KEYS.size &&
    new Set(keys).size === keys.length &&
    Object.keys(value).length === EXPECTED_SETTINGS_KEYS.size &&
    Object.keys(value).every((key) => EXPECTED_SETTINGS_KEYS.has(key));
};

const isHttpsUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.length > 0;
  } catch {
    return false;
  }
};

/**
 * Test-only seam for synthetic malformed-input contracts. It accepts no
 * verification capability and is intentionally not re-exported publicly.
 */
export const parseOmensSettingsFromTrustedBytes = (bytes: Uint8Array): OmensSettings => {
  try {
    const lines = decodeEnvelope(bytes).split("\r\n");

    if (lines[0] !== SETTINGS_HEADER) {
      return invalidSettings();
    }

    const nextSectionIndex = lines.findIndex((line, index) => index > 0 && SECTION_HEADER.test(line));
    if (nextSectionIndex === -1 || lines[nextSectionIndex] !== CUSTOM_CARDS_HEADER || lines.filter((line) => line === SETTINGS_HEADER).length !== 1) {
      return invalidSettings();
    }

    const settingsJson = lines.slice(1, nextSectionIndex).join("\r\n");
    const parsed: unknown = JSON.parse(settingsJson);
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
      return invalidSettings();
    }

    const settings = parsed as Record<string, unknown>;
    if (!hasExactlyExpectedKeys(settingsJson, settings) ||
      settings.showSlots !== true ||
      settings.withReplacement !== false ||
      typeof settings.cardBack !== "string" ||
      !isHttpsUrl(settings.cardBack)) {
      return invalidSettings();
    }

    if (lines.slice(nextSectionIndex + 1).some((line) => line === SETTINGS_HEADER)) {
      return invalidSettings();
    }

    return Object.freeze({ withReplacement: false });
  } catch (error) {
    if (error instanceof OmensRecipeSettingsError) {
      throw error;
    }

    return invalidSettings();
  }
};
