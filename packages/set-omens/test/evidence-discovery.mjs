export const PUBLIC_SOURCE_EVIDENCE_SUFFIX = ".public-source-evidence.test.mjs";
export const RECIPE_IDENTITY_EVIDENCE_SUFFIX = ".recipe-identity-evidence.test.mjs";
export const RECIPE_RARITY_EVIDENCE_SUFFIX = ".recipe-rarity-evidence.test.mjs";
export const DRAFT_ELIGIBILITY_EVIDENCE_SUFFIX = ".draft-eligibility-evidence.test.mjs";
export const RECIPE_POOL_IDENTITY_EVIDENCE_SUFFIX = ".recipe-pool-identity-evidence.test.mjs";
export const RECIPE_LAYOUT_POOL_RESOLUTION_EVIDENCE_SUFFIX = ".recipe-layout-pool-resolution-evidence.test.mjs";
export const COLLATION_WEIGHT_TABLES_EVIDENCE_SUFFIX = ".collation-weight-tables-evidence.test.mjs";
export const COLLATION_WEIGHTED_SELECTION_EVIDENCE_SUFFIX = ".collation-weight-ticket-selection-evidence.test.mjs";
export const COLLATION_SAMPLE_SELECTION_EVIDENCE_SUFFIX = ".collation-sample-selection-evidence.test.mjs";
export const PACK_LOCAL_POOL_DRAW_STATE_EVIDENCE_SUFFIX = ".pack-local-pool-draw-state-evidence.test.mjs";
export const PACK_LOCAL_POOL_TICKET_SELECTION_EVIDENCE_SUFFIX = ".pack-local-pool-ticket-selection-evidence.test.mjs";
export const PACK_LOCAL_POOL_SAMPLE_SELECTION_EVIDENCE_SUFFIX = ".pack-local-pool-sample-selection-evidence.test.mjs";

export const discoverEvidenceTests = (files) => files
  .filter((file) => file.endsWith(".test.mjs"))
  .filter((file) => !file.endsWith(PUBLIC_SOURCE_EVIDENCE_SUFFIX))
  .filter((file) => !file.endsWith(RECIPE_IDENTITY_EVIDENCE_SUFFIX))
  .filter((file) => !file.endsWith(RECIPE_RARITY_EVIDENCE_SUFFIX))
  .filter((file) => !file.endsWith(DRAFT_ELIGIBILITY_EVIDENCE_SUFFIX))
  .filter((file) => !file.endsWith(RECIPE_POOL_IDENTITY_EVIDENCE_SUFFIX))
  .filter((file) => !file.endsWith(RECIPE_LAYOUT_POOL_RESOLUTION_EVIDENCE_SUFFIX))
  .filter((file) => !file.endsWith(COLLATION_WEIGHT_TABLES_EVIDENCE_SUFFIX))
  .filter((file) => !file.endsWith(COLLATION_WEIGHTED_SELECTION_EVIDENCE_SUFFIX))
  .filter((file) => !file.endsWith(COLLATION_SAMPLE_SELECTION_EVIDENCE_SUFFIX))
  .filter((file) => !file.endsWith(PACK_LOCAL_POOL_DRAW_STATE_EVIDENCE_SUFFIX))
  .filter((file) => !file.endsWith(PACK_LOCAL_POOL_TICKET_SELECTION_EVIDENCE_SUFFIX))
  .filter((file) => !file.endsWith(PACK_LOCAL_POOL_SAMPLE_SELECTION_EVIDENCE_SUFFIX));

export const discoverPublicSourceEvidenceTests = (files) => files
  .filter((file) => file.endsWith(PUBLIC_SOURCE_EVIDENCE_SUFFIX));

export const discoverRecipeIdentityEvidenceTests = (files) => files
  .filter((file) => file.endsWith(RECIPE_IDENTITY_EVIDENCE_SUFFIX));

export const discoverRecipeRarityEvidenceTests = (files) => files
  .filter((file) => file.endsWith(RECIPE_RARITY_EVIDENCE_SUFFIX));

export const discoverDraftEligibilityEvidenceTests = (files) => files
  .filter((file) => file.endsWith(DRAFT_ELIGIBILITY_EVIDENCE_SUFFIX));

export const discoverRecipePoolIdentityEvidenceTests = (files) => files
  .filter((file) => file.endsWith(RECIPE_POOL_IDENTITY_EVIDENCE_SUFFIX));

export const discoverRecipeLayoutPoolResolutionEvidenceTests = (files) => files
  .filter((file) => file.endsWith(RECIPE_LAYOUT_POOL_RESOLUTION_EVIDENCE_SUFFIX));

export const discoverCollationWeightTablesEvidenceTests = (files) => files
  .filter((file) => file.endsWith(COLLATION_WEIGHT_TABLES_EVIDENCE_SUFFIX));

export const discoverCollationWeightedSelectionEvidenceTests = (files) => files
  .filter((file) => file.endsWith(COLLATION_WEIGHTED_SELECTION_EVIDENCE_SUFFIX));

export const discoverCollationSampleSelectionEvidenceTests = (files) => files
  .filter((file) => file.endsWith(COLLATION_SAMPLE_SELECTION_EVIDENCE_SUFFIX));

export const discoverPackLocalPoolDrawStateEvidenceTests = (files) => files
  .filter((file) => file.endsWith(PACK_LOCAL_POOL_DRAW_STATE_EVIDENCE_SUFFIX));

export const discoverPackLocalPoolTicketSelectionEvidenceTests = (files) => files
  .filter((file) => file.endsWith(PACK_LOCAL_POOL_TICKET_SELECTION_EVIDENCE_SUFFIX));

export const discoverPackLocalPoolSampleSelectionEvidenceTests = (files) => files
  .filter((file) => file.endsWith(PACK_LOCAL_POOL_SAMPLE_SELECTION_EVIDENCE_SUFFIX));
