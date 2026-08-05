export const PUBLIC_SOURCE_EVIDENCE_SUFFIX = ".public-source-evidence.test.mjs";
export const RECIPE_IDENTITY_EVIDENCE_SUFFIX = ".recipe-identity-evidence.test.mjs";
export const RECIPE_RARITY_EVIDENCE_SUFFIX = ".recipe-rarity-evidence.test.mjs";

export const discoverEvidenceTests = (files) => files
  .filter((file) => file.endsWith(".test.mjs"))
  .filter((file) => !file.endsWith(PUBLIC_SOURCE_EVIDENCE_SUFFIX))
  .filter((file) => !file.endsWith(RECIPE_IDENTITY_EVIDENCE_SUFFIX))
  .filter((file) => !file.endsWith(RECIPE_RARITY_EVIDENCE_SUFFIX));

export const discoverPublicSourceEvidenceTests = (files) => files
  .filter((file) => file.endsWith(PUBLIC_SOURCE_EVIDENCE_SUFFIX));

export const discoverRecipeIdentityEvidenceTests = (files) => files
  .filter((file) => file.endsWith(RECIPE_IDENTITY_EVIDENCE_SUFFIX));

export const discoverRecipeRarityEvidenceTests = (files) => files
  .filter((file) => file.endsWith(RECIPE_RARITY_EVIDENCE_SUFFIX));
