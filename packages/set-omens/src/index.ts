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
import {
  OmensRecipeLayoutsError,
  parseOmensLayoutsFromTrustedBytes,
  type OmensLayouts
} from "./layouts.ts";

export { OmensRecipeChecksumError } from "./checksum.ts";
export { OMENS_RECIPE } from "./descriptor.ts";
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

const validatePinnedLayoutsAggregate = (layouts: OmensLayouts): OmensLayouts => {
  if (layouts.layouts.length !== 228) throw new OmensRecipeLayoutsError();

  let totalWeight = 0;
  const occurrences = new Map<number, number>();
  for (const layout of layouts.layouts) {
    if (totalWeight > Number.MAX_SAFE_INTEGER - layout.weight) throw new OmensRecipeLayoutsError();
    totalWeight += layout.weight;
    occurrences.set(layout.weight, (occurrences.get(layout.weight) ?? 0) + 1);
  }

  if (totalWeight !== 460800) throw new OmensRecipeLayoutsError();

  const coefficients = new Map<number, number>();
  for (let offset = 0; offset < layouts.layouts.length; offset += 6) {
    const group = layouts.layouts.slice(offset, offset + 6);
    if (group.length !== 6) throw new OmensRecipeLayoutsError();
    const divisor = group.reduce((common, layout) => {
      let a = common;
      let b = layout.weight;
      while (b !== 0) [a, b] = [b, a % b];
      return a;
    }, 0);
    if (divisor === 0) throw new OmensRecipeLayoutsError();
    for (const layout of group) {
      const coefficient = layout.weight / divisor;
      coefficients.set(coefficient, (coefficients.get(coefficient) ?? 0) + 1);
    }
  }
  if (coefficients.size !== 6 || [...coefficients.values()].some((count) => count !== 38)) {
    throw new OmensRecipeLayoutsError();
  }
  return layouts;
};

export const parseVerifiedOmensLayouts = (
  recipe: VerifiedOmensRecipe
): OmensLayouts => validatePinnedLayoutsAggregate(parseOmensLayoutsFromTrustedBytes(
  readVerifiedOmensBytesForParser(recipe.verification)
));
