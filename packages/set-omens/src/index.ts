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
import {
  verifyPinnedFabCardSchemaBytes,
  verifyPinnedFabEnglishCardBytes,
  type VerifiedFabCardSchemaBytes,
  type VerifiedFabEnglishCardBytes
} from "./public-source-checksum.ts";
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

export const verifyFabEnglishCardBytes = (bytes: Uint8Array): VerifiedFabEnglishCardSource =>
  Object.freeze({
    descriptor: FAB_CARD_SOURCE,
    verification: verifyPinnedFabEnglishCardBytes(bytes)
  });

export const verifyFabCardSchemaBytes = (bytes: Uint8Array): VerifiedFabCardSchemaSource =>
  Object.freeze({
    descriptor: FAB_CARD_SOURCE,
    verification: verifyPinnedFabCardSchemaBytes(bytes)
  });

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
