import {
  readVerifiedOmensBytesForParser,
  type VerifiedOmensBytes,
  verifyPinnedOmensBytes
} from "./checksum.ts";
import { OMENS_RECIPE } from "./descriptor.ts";
import { FAB_CARD_SOURCE } from "./public-source-descriptor.ts";
import {
  parseOmensCustomCardsFromTrustedBytes,
  validateOmensRecipeCustomCardsAggregate,
  type OmensRecipeCardReference
} from "./custom-cards.ts";
import {
  parseOmensSettingsFromTrustedBytes,
  type OmensSettings
} from "./settings.ts";
import {
  parseOmensLayoutsFromTrustedBytes,
  validateOmensRecipeLayoutsAggregate,
  type OmensLayouts
} from "./layouts.ts";
import {
  parseOmensPoolsFromTrustedBytes,
  validateOmensRecipePoolsAggregate,
  validateOmensRecipeReferences,
  type OmensPools
} from "./pools.ts";

export { OmensRecipeChecksumError } from "./checksum.ts";
export { OMENS_RECIPE } from "./descriptor.ts";
export { FAB_CARD_SOURCE } from "./public-source-descriptor.ts";
export {
  FabCardSourceChecksumError,
  type FabCardSourceArtifact
} from "./public-source-checksum.ts";
export {
  FabCardSourceJsonDocumentError,
  type FabCardSourceDocumentArtifact,
  type ValidatedFabCardSchemaDocument,
  type ValidatedFabEnglishCardDocument
} from "./public-source-document.ts";
export {
  FabCardSourceSchemaValidationError,
  type SchemaValidatedFabEnglishCardData
} from "./public-source-schema-validation.ts";
import {
  verifyPinnedFabCardSchemaBytes,
  verifyPinnedFabEnglishCardBytes,
  type VerifiedFabCardSchemaBytes,
  type VerifiedFabEnglishCardBytes
} from "./public-source-checksum.ts";
import {
  readVerifiedValidatedFabCardSchemaBytesForSchemaValidation,
  readVerifiedValidatedFabEnglishCardBytesForSchemaValidation,
  validateFabCardSchemaDocumentFromVerifiedBytes,
  validateFabEnglishCardDocumentFromVerifiedBytes,
  type ValidatedFabCardSchemaDocument,
  type ValidatedFabEnglishCardDocument
} from "./public-source-document.ts";
import {
  FabCardSourceSchemaValidationError,
  validateFabCardDataDocumentsForSchema,
  type SchemaValidatedFabEnglishCardData
} from "./public-source-schema-validation.ts";
export {
  OmensRecipeCustomCardsError,
  type OmensRecipeCardReference
} from "./custom-cards.ts";
export { OmensRecipeSettingsError, type OmensSettings } from "./settings.ts";
export {
  OmensRecipeLayoutsError,
  type OmensLayout,
  type OmensLayouts,
  type OmensLayoutSlot
} from "./layouts.ts";
export {
  OmensRecipePoolsError,
  type OmensPool,
  type OmensPoolEntry,
  type OmensPools
} from "./pools.ts";

export type VerifiedFabEnglishCardSource = Readonly<{
  descriptor: typeof FAB_CARD_SOURCE;
  verification: VerifiedFabEnglishCardBytes;
}>;

export type VerifiedFabCardSchemaSource = Readonly<{
  descriptor: typeof FAB_CARD_SOURCE;
  verification: VerifiedFabCardSchemaBytes;
}>;

const verifiedPublicSources = new WeakMap<object, "FAB_CARD_JSON" | "FAB_CARD_SCHEMA_JSON">();

const source = <Source extends object>(sourceArtifact: "FAB_CARD_JSON" | "FAB_CARD_SCHEMA_JSON", verification: Source): Source => {
  verifiedPublicSources.set(verification, sourceArtifact);
  return verification;
};

const requireVerifiedPublicSource = (candidate: object, artifact: "FAB_CARD_JSON" | "FAB_CARD_SCHEMA_JSON"): void => {
  if (verifiedPublicSources.get(candidate) !== artifact) throw new TypeError("Invalid public card source verification.");
};

export const verifyFabEnglishCardBytes = (bytes: Uint8Array): VerifiedFabEnglishCardSource =>
  source("FAB_CARD_JSON", Object.freeze({
    descriptor: FAB_CARD_SOURCE,
    verification: verifyPinnedFabEnglishCardBytes(bytes)
  }));

export const verifyFabCardSchemaBytes = (bytes: Uint8Array): VerifiedFabCardSchemaSource =>
  source("FAB_CARD_SCHEMA_JSON", Object.freeze({
    descriptor: FAB_CARD_SOURCE,
    verification: verifyPinnedFabCardSchemaBytes(bytes)
  }));

export const validateVerifiedFabEnglishCardDocument = (
  card: VerifiedFabEnglishCardSource
): ValidatedFabEnglishCardDocument => {
  requireVerifiedPublicSource(card, "FAB_CARD_JSON");
  return validateFabEnglishCardDocumentFromVerifiedBytes(card.verification);
};

export const validateVerifiedFabCardSchemaDocument = (
  schema: VerifiedFabCardSchemaSource
): ValidatedFabCardSchemaDocument => {
  requireVerifiedPublicSource(schema, "FAB_CARD_SCHEMA_JSON");
  return validateFabCardSchemaDocumentFromVerifiedBytes(schema.verification);
};

const requireVerifiedValidatedFabEnglishCardDocument = (card: ValidatedFabEnglishCardDocument): void => {
  readVerifiedValidatedFabEnglishCardBytesForSchemaValidation(card);
};

const requireVerifiedValidatedFabCardSchemaDocument = (schema: ValidatedFabCardSchemaDocument): void => {
  readVerifiedValidatedFabCardSchemaBytesForSchemaValidation(schema);
};

/** Validates the complete pinned card document against the complete pinned Draft-04 schema. */
export const validateFabEnglishCardDataAgainstSchema = (
  card: ValidatedFabEnglishCardDocument,
  schema: ValidatedFabCardSchemaDocument
): SchemaValidatedFabEnglishCardData => {
  try {
    requireVerifiedValidatedFabEnglishCardDocument(card);
    requireVerifiedValidatedFabCardSchemaDocument(schema);
    return validateFabCardDataDocumentsForSchema(card, schema);
  } catch (error) {
    if (error instanceof FabCardSourceSchemaValidationError) throw error;
    throw new FabCardSourceSchemaValidationError();
  }
};

export const validateVerifiedFabCardSourceDocuments = (
  card: VerifiedFabEnglishCardSource,
  schema: VerifiedFabCardSchemaSource
): Readonly<{
  card: ValidatedFabEnglishCardDocument;
  schema: ValidatedFabCardSchemaDocument;
}> => {
  requireVerifiedPublicSource(card, "FAB_CARD_JSON");
  requireVerifiedPublicSource(schema, "FAB_CARD_SCHEMA_JSON");
  return Object.freeze({
    card: validateFabEnglishCardDocumentFromVerifiedBytes(card.verification),
    schema: validateFabCardSchemaDocumentFromVerifiedBytes(schema.verification)
  });
};

export type VerifiedOmensRecipe = Readonly<{
  descriptor: typeof OMENS_RECIPE;
  verification: VerifiedOmensBytes;
}>;

export const verifyOmensRecipeBytes = (bytes: Uint8Array): VerifiedOmensRecipe =>
  Object.freeze({
    descriptor: OMENS_RECIPE,
    verification: verifyPinnedOmensBytes(bytes)
  });

export const parseVerifiedOmensSettings = (
  recipe: VerifiedOmensRecipe
): OmensSettings => parseOmensSettingsFromTrustedBytes(
  readVerifiedOmensBytesForParser(recipe.verification)
);

export const parseVerifiedOmensCustomCards = (
  recipe: VerifiedOmensRecipe
): ReadonlyArray<OmensRecipeCardReference> => validateOmensRecipeCustomCardsAggregate(
  parseOmensCustomCardsFromTrustedBytes(readVerifiedOmensBytesForParser(recipe.verification))
);

export const parseVerifiedOmensLayouts = (
  recipe: VerifiedOmensRecipe
): OmensLayouts => validateOmensRecipeLayoutsAggregate(parseOmensLayoutsFromTrustedBytes(
  readVerifiedOmensBytesForParser(recipe.verification)
));

export const parseVerifiedOmensPools = (
  recipe: VerifiedOmensRecipe
): OmensPools => {
  const bytes = readVerifiedOmensBytesForParser(recipe.verification);
  const pools = validateOmensRecipePoolsAggregate(parseOmensPoolsFromTrustedBytes(bytes));
  const layouts = validateOmensRecipeLayoutsAggregate(parseOmensLayoutsFromTrustedBytes(bytes));
  const cards = validateOmensRecipeCustomCardsAggregate(parseOmensCustomCardsFromTrustedBytes(bytes));
  validateOmensRecipeReferences(layouts, pools, cards);
  return pools;
};
