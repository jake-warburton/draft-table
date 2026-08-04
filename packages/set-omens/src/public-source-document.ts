import {
  readVerifiedFabCardSchemaBytesForParser,
  readVerifiedFabEnglishCardBytesForParser,
  type VerifiedFabCardSchemaBytes,
  type VerifiedFabEnglishCardBytes
} from "./public-source-checksum.ts";
export type FabCardSourceDocumentArtifact = "FAB_CARD_JSON" | "FAB_CARD_SCHEMA_JSON";

export class FabCardSourceJsonDocumentError extends Error {
  readonly code = "FAB_CARD_SOURCE_JSON_DOCUMENT_INVALID";
  readonly artifact: FabCardSourceDocumentArtifact;

  constructor(artifact: FabCardSourceDocumentArtifact) {
    super("Pinned public card source JSON document is invalid.");
    this.name = "FabCardSourceJsonDocumentError";
    this.artifact = artifact;
    this.stack = `${this.name}: ${this.message}`;
  }
}

declare const validatedFabEnglishCardDocumentBrand: unique symbol;
declare const validatedFabCardSchemaDocumentBrand: unique symbol;

export type ValidatedFabEnglishCardDocument = Readonly<{
  [validatedFabEnglishCardDocumentBrand]: true;
}>;

export type ValidatedFabCardSchemaDocument = Readonly<{
  [validatedFabCardSchemaDocumentBrand]: true;
}>;

type ValidatedDocument = ValidatedFabEnglishCardDocument | ValidatedFabCardSchemaDocument;

const bytesByDocument = new WeakMap<ValidatedDocument, Readonly<{
  artifact: FabCardSourceDocumentArtifact;
  bytes: Uint8Array;
  verified: boolean;
}>>();

const MAX_JSON_BYTES = 24_000_000;
const MAX_JSON_DEPTH = 512;

class JsonScanner {
  #offset = 0;
  readonly text: string;

  constructor(text: string) {
    this.text = text;
  }

  scan(): Readonly<{ kind: "array" | "object" | "scalar"; length?: number }> {
    const value = this.value(0);
    if (this.#offset !== this.text.length) throw new SyntaxError();
    return value;
  }

  private value(depth: number): Readonly<{ kind: "array" | "object" | "scalar"; length?: number }> {
    if (depth > MAX_JSON_DEPTH) throw new SyntaxError();
    this.skipWhitespace();
    const character = this.text[this.#offset];
    if (character === "{") return this.object(depth + 1);
    if (character === "[") return this.array(depth + 1);
    if (character === '"') { this.string(); return { kind: "scalar" }; }
    if (character === "t") return this.literal("true", true);
    if (character === "f") return this.literal("false", false);
    if (character === "n") return this.literal("null", null);
    if (character === "-" || (character !== undefined && character >= "0" && character <= "9")) return this.number();
    throw new SyntaxError();
  }

  private object(depth: number): Readonly<{ kind: "object" }> {
    this.#offset++;
    const keys = new Set<string>();
    this.skipWhitespace();
    if (this.text[this.#offset] === "}") { this.#offset++; return { kind: "object" }; }
    while (true) {
      this.skipWhitespace();
      if (this.text[this.#offset] !== '"') throw new SyntaxError();
      const key = this.string();
      if (keys.has(key)) throw new SyntaxError();
      keys.add(key);
      this.skipWhitespace();
      if (this.text[this.#offset++] !== ":") throw new SyntaxError();
      this.value(depth);
      this.skipWhitespace();
      const separator = this.text[this.#offset++];
      if (separator === "}") return { kind: "object" };
      if (separator !== ",") throw new SyntaxError();
    }
  }

  private array(depth: number): Readonly<{ kind: "array"; length: number }> {
    this.#offset++;
    let length = 0;
    this.skipWhitespace();
    if (this.text[this.#offset] === "]") { this.#offset++; return { kind: "array", length }; }
    while (true) {
      this.value(depth);
      length++;
      this.skipWhitespace();
      const separator = this.text[this.#offset++];
      if (separator === "]") return { kind: "array", length };
      if (separator !== ",") throw new SyntaxError();
    }
  }

  private string(): string {
    let result = "";
    this.#offset++;
    while (this.#offset < this.text.length) {
      const character = this.text[this.#offset++];
      if (character === '"') return result;
      if (character === "\\") {
        const escape = this.text[this.#offset++];
        if (escape === '"' || escape === "\\" || escape === "/") result += escape;
        else if (escape === "b") result += "\b";
        else if (escape === "f") result += "\f";
        else if (escape === "n") result += "\n";
        else if (escape === "r") result += "\r";
        else if (escape === "t") result += "\t";
        else if (escape === "u") {
          const hex = this.text.slice(this.#offset, this.#offset + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new SyntaxError();
          result += String.fromCharCode(Number.parseInt(hex, 16));
          this.#offset += 4;
        } else throw new SyntaxError();
      } else {
        if (character < " " || character === undefined) throw new SyntaxError();
        result += character;
      }
    }
    throw new SyntaxError();
  }

  private skipWhitespace(): void {
    while (this.text[this.#offset] === " " || this.text[this.#offset] === "\n" || this.text[this.#offset] === "\t") this.#offset++;
  }

  private literal(source: string, _value: unknown): Readonly<{ kind: "scalar" }> {
    if (this.text.slice(this.#offset, this.#offset + source.length) !== source) throw new SyntaxError();
    this.#offset += source.length;
    return { kind: "scalar" };
  }

  private number(): Readonly<{ kind: "scalar" }> {
    const start = this.#offset;
    if (this.text[this.#offset] === "-") this.#offset++;
    if (this.text[this.#offset] === "0") this.#offset++;
    else {
      if (!(this.text[this.#offset] >= "1" && this.text[this.#offset] <= "9")) throw new SyntaxError();
      while (this.text[this.#offset] >= "0" && this.text[this.#offset] <= "9") this.#offset++;
    }
    if (this.text[this.#offset] === ".") {
      this.#offset++;
      if (!(this.text[this.#offset] >= "0" && this.text[this.#offset] <= "9")) throw new SyntaxError();
      while (this.text[this.#offset] >= "0" && this.text[this.#offset] <= "9") this.#offset++;
    }
    if (this.text[this.#offset] === "e" || this.text[this.#offset] === "E") {
      this.#offset++;
      if (this.text[this.#offset] === "+" || this.text[this.#offset] === "-") this.#offset++;
      if (!(this.text[this.#offset] >= "0" && this.text[this.#offset] <= "9")) throw new SyntaxError();
      while (this.text[this.#offset] >= "0" && this.text[this.#offset] <= "9") this.#offset++;
    }
    Number(this.text.slice(start, this.#offset));
    return { kind: "scalar" };
  }
}

const validated = <Document extends ValidatedDocument>(
  bytes: Uint8Array,
  artifact: FabCardSourceDocumentArtifact,
  verified = false
): Document => {
  try {
    if (bytes.byteLength > MAX_JSON_BYTES || bytes[0] === 0xef || bytes.includes(0x0d)) throw new SyntaxError();
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const expectedStart = artifact === "FAB_CARD_JSON" ? "[" : "{";
    const expectedEnd = artifact === "FAB_CARD_JSON" ? "]" : "}";
    if (!text.startsWith(expectedStart) || !text.endsWith(expectedEnd)) throw new SyntaxError();
    const scanned = new JsonScanner(text).scan();
    if (artifact === "FAB_CARD_JSON" ? scanned.kind !== "array" || scanned.length === 0 : scanned.kind !== "object") throw new SyntaxError();
    JSON.parse(text);
  } catch {
    throw new FabCardSourceJsonDocumentError(artifact);
  }
  const document = Object.freeze({}) as Document;
  bytesByDocument.set(document, Object.freeze({ artifact, bytes: new Uint8Array(bytes), verified }));
  return document;
};

export const validateFabEnglishCardDocumentFromVerifiedBytes = (verification: VerifiedFabEnglishCardBytes): ValidatedFabEnglishCardDocument =>
  validated<ValidatedFabEnglishCardDocument>(readVerifiedFabEnglishCardBytesForParser(verification), "FAB_CARD_JSON", true);

export const validateFabCardSchemaDocumentFromVerifiedBytes = (verification: VerifiedFabCardSchemaBytes): ValidatedFabCardSchemaDocument =>
  validated<ValidatedFabCardSchemaDocument>(readVerifiedFabCardSchemaBytesForParser(verification), "FAB_CARD_SCHEMA_JSON", true);

export const validateFabEnglishCardDocumentFromTrustedBytes = (bytes: Uint8Array): ValidatedFabEnglishCardDocument =>
  validated<ValidatedFabEnglishCardDocument>(bytes, "FAB_CARD_JSON");

export const validateFabCardSchemaDocumentFromTrustedBytes = (bytes: Uint8Array): ValidatedFabCardSchemaDocument =>
  validated<ValidatedFabCardSchemaDocument>(bytes, "FAB_CARD_SCHEMA_JSON");

const readValidated = (document: ValidatedDocument, artifact: FabCardSourceDocumentArtifact, requireVerification = false): Uint8Array => {
  const retained = bytesByDocument.get(document);
  if (retained === undefined || retained.artifact !== artifact || (requireVerification && !retained.verified)) {
    throw new TypeError("Invalid public card source document.");
  }
  return new Uint8Array(retained.bytes);
};

/** Package-internal future parser seam; the root package export deliberately does not expose it. */
export const readValidatedFabEnglishCardBytesForParser = (document: ValidatedFabEnglishCardDocument): Uint8Array =>
  readValidated(document, "FAB_CARD_JSON");

/** Package-internal future parser seam; the root package export deliberately does not expose it. */
export const readValidatedFabCardSchemaBytesForParser = (document: ValidatedFabCardSchemaDocument): Uint8Array =>
  readValidated(document, "FAB_CARD_SCHEMA_JSON");

/** Package-internal schema-validation seam; only checksum-origin document capabilities qualify. */
export const readVerifiedValidatedFabEnglishCardBytesForSchemaValidation = (document: ValidatedFabEnglishCardDocument): Uint8Array =>
  readValidated(document, "FAB_CARD_JSON", true);

/** Package-internal schema-validation seam; only checksum-origin document capabilities qualify. */
export const readVerifiedValidatedFabCardSchemaBytesForSchemaValidation = (document: ValidatedFabCardSchemaDocument): Uint8Array =>
  readValidated(document, "FAB_CARD_SCHEMA_JSON", true);
