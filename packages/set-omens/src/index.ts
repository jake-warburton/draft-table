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
  completeValidatedOmensRecipePools,
  parseOmensPoolsFromTrustedBytes,
  type OmensPools
} from "./pools.ts";

export { OmensRecipeChecksumError } from "./checksum.ts";
export { OMENS_RECIPE } from "./descriptor.ts";
export { CARD_VAULT_OMENS_PRODUCT_RESPONSE } from "./card-vault-product-descriptor.ts";
export {
  CardVaultOmensProductChecksumError,
  type VerifiedCardVaultOmensProductResponse
} from "./card-vault-product-checksum.ts";
export {
  CardVaultOfficialMembershipError,
  type OfficialCardVaultMembership
} from "./card-vault-official-membership.ts";
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
import {
  verifyCardVaultOmensProductResponseBytes,
  type VerifiedCardVaultOmensProductResponse
} from "./card-vault-product-checksum.ts";
import {
  validateCardVaultOmensOfficialMembershipBytes,
  type OfficialCardVaultMembership
} from "./card-vault-official-membership.ts";
import {
  verifyPinnedFabCardSchemaBytes,
  verifyPinnedFabEnglishCardBytes,
  type VerifiedFabCardSchemaBytes,
  type VerifiedFabEnglishCardBytes
} from "./public-source-checksum.ts";
import {
  validateFabCardSchemaDocumentFromVerifiedBytes,
  validateFabEnglishCardDocumentFromVerifiedBytes,
  type ValidatedFabCardSchemaDocument,
  type ValidatedFabEnglishCardDocument
} from "./public-source-document.ts";
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

/** Dated observed-response evidence only; not a version pin for future live responses. */
export const verifyCardVaultOmensProductBytes = (
  bytes: Uint8Array
): VerifiedCardVaultOmensProductResponse => verifyCardVaultOmensProductResponseBytes(bytes);

/** Validates the durable canonical official-membership fact from caller-provided response bytes. */
export const validateCardVaultOmensOfficialMembership = (
  bytes: Uint8Array
): OfficialCardVaultMembership => validateCardVaultOmensOfficialMembershipBytes(bytes);

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
  const pools = parseOmensPoolsFromTrustedBytes(bytes);
  const layouts = validateOmensRecipeLayoutsAggregate(parseOmensLayoutsFromTrustedBytes(bytes));
  const cards = validateOmensRecipeCustomCardsAggregate(parseOmensCustomCardsFromTrustedBytes(bytes));
  return completeValidatedOmensRecipePools(pools, layouts, cards);
};
