import AjvDraft4 from "ajv-draft-04";
import {
  readValidatedFabCardSchemaBytesForParser,
  readValidatedFabEnglishCardBytesForParser,
  type ValidatedFabCardSchemaDocument,
  type ValidatedFabEnglishCardDocument
} from "./public-source-document.ts";

export class FabCardSourceSchemaValidationError extends Error {
  readonly code = "FAB_CARD_SOURCE_SCHEMA_VALIDATION_FAILED";

  constructor() {
    super("Pinned public card source schema validation failed.");
    this.name = "FabCardSourceSchemaValidationError";
    this.stack = `${this.name}: ${this.message}`;
  }
}

declare const schemaValidatedFabEnglishCardDataBrand: unique symbol;

export type SchemaValidatedFabEnglishCardData = Readonly<{
  [schemaValidatedFabEnglishCardDataBrand]: true;
}>;

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const dataByCapability = new WeakMap<SchemaValidatedFabEnglishCardData, JsonValue[]>();
const DRAFT_04 = "http://json-schema.org/draft-04/schema#";

const hasRemoteReference = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(hasRemoteReference);
  if (value === null || typeof value !== "object") return false;
  for (const [key, child] of Object.entries(value)) {
    if (key === "$ref" && (typeof child !== "string" || !child.startsWith("#"))) return true;
    if (hasRemoteReference(child)) return true;
  }
  return false;
};

const parse = (bytes: Uint8Array): unknown => JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));

const validate = (cardBytes: Uint8Array, schemaBytes: Uint8Array): SchemaValidatedFabEnglishCardData => {
  try {
    const schema = parse(schemaBytes);
    if (schema === null || typeof schema !== "object" || (schema as { $schema?: unknown }).$schema !== DRAFT_04 || hasRemoteReference(schema)) {
      throw new Error();
    }
    const validator = new AjvDraft4({ allErrors: false, messages: false, strict: true, validateSchema: true }).compile(schema);
    const cards = parse(cardBytes);
    if (!Array.isArray(cards) || !validator(cards)) throw new Error();
    const capability = Object.freeze({}) as SchemaValidatedFabEnglishCardData;
    dataByCapability.set(capability, structuredClone(cards) as JsonValue[]);
    return capability;
  } catch {
    throw new FabCardSourceSchemaValidationError();
  }
};

/** Package-internal test and composition seam; the package root accepts only verified document capabilities. */
export const validateFabCardDataDocumentsForSchema = (
  card: ValidatedFabEnglishCardDocument,
  schema: ValidatedFabCardSchemaDocument
): SchemaValidatedFabEnglishCardData => validate(
  readValidatedFabEnglishCardBytesForParser(card),
  readValidatedFabCardSchemaBytesForParser(schema)
);

/** Package-internal future OMN parser seam; returns a fresh owned copy. */
export const readSchemaValidatedFabEnglishCardDataForParser = (
  capability: SchemaValidatedFabEnglishCardData
): JsonValue[] => {
  const data = dataByCapability.get(capability);
  if (data === undefined) throw new TypeError("Invalid schema-validated public card data.");
  return structuredClone(data);
};
