import {
  readVerifiedOmensBytesForParser,
  type VerifiedOmensBytes,
  verifyPinnedOmensBytes
} from "./checksum.ts";
import { OMENS_RECIPE } from "./descriptor.ts";
import {
  parseOmensCustomCardsFromTrustedBytes,
  validateOmensRecipeCustomCardsAggregate,
  type OmensRecipeCardReference
} from "./custom-cards.ts";
import {
  parseOmensSettingsFromTrustedBytes,
  type OmensSettings
} from "./settings.ts";

export { OmensRecipeChecksumError } from "./checksum.ts";
export { OMENS_RECIPE } from "./descriptor.ts";
export {
  OmensRecipeCustomCardsError,
  type OmensRecipeCardReference
} from "./custom-cards.ts";
export { OmensRecipeSettingsError, type OmensSettings } from "./settings.ts";

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
