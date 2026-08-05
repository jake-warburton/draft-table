/** Exact external recipe/MTG-tool labels accepted at the ingest boundary. */
export type OmensRecipeRarityLabel = "common" | "rare" | "mythic";

/** FaB-native classification used after the one recipe boundary. */
export type FabNativeRecipeRarity = "common" | "rare" | "majestic";

/** Exact pinned upstream rarity-code vocabulary; only C/R/M receive semantics in this slice. */
export type FabRarityCode = "C" | "R" | "M" | "P" | "V" | "T" | "L" | "S" | "B" | "F";

export type OmensRecipeFabRarityTranslation = Readonly<{
  fabRarity: FabNativeRecipeRarity;
  correspondingUpstreamCode: FabRarityCode;
}>;

const COMMON_RECIPE_TO_FAB = Object.freeze({ fabRarity: "common", correspondingUpstreamCode: "C" } as const);
const RARE_RECIPE_TO_FAB = Object.freeze({ fabRarity: "rare", correspondingUpstreamCode: "R" } as const);
const MYTHIC_RECIPE_TO_FAB = Object.freeze({ fabRarity: "majestic", correspondingUpstreamCode: "M" } as const);

/** Named exhaustive seam; callers retain exact source labels separately. */
export const translateOmensRecipeRarityAtFabSeam = (
  sourceLabel: OmensRecipeRarityLabel
): OmensRecipeFabRarityTranslation => {
  switch (sourceLabel) {
    case "common": return COMMON_RECIPE_TO_FAB;
    case "rare": return RARE_RECIPE_TO_FAB;
    case "mythic": return MYTHIC_RECIPE_TO_FAB;
  }
};
