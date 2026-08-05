import {
  assertVerifiedValidatedFabCardSchemaDocument,
  assertVerifiedValidatedFabEnglishCardDocument,
  type ValidatedFabCardSchemaDocument,
  type ValidatedFabEnglishCardDocument
} from "./public-source-document.ts";
import {
  FabCardSourceSchemaValidationError,
  validateFabCardDataDocumentsForSchema,
  readSchemaValidatedFabEnglishCardDataForParser,
  type SchemaValidatedFabEnglishCardData
} from "./public-source-schema-validation.ts";
import {
  OmnSourceProjectionError,
  projectOmnSourceRecords,
  type OmnSourceProjection
} from "./omn-source-projection.ts";
import {
  OfficialUpstreamIdReconciliationError,
  reconcileOfficialCardVaultMembershipWithSchemaValidatedFabSource,
  type OfficialUpstreamIdReconciliation
} from "./official-upstream-id-reconciliation.ts";
import type { OfficialCardVaultMembership } from "./card-vault-official-membership.ts";
import {
  OfficialSuffixFoilingClassificationError,
  classifyOfficialCardVaultSuffixFoiling as classifySuffixFoiling,
  type OfficialSuffixFoilingClassification
} from "./official-suffix-foiling-classification.ts";
import {
  CardVaultFaceProjectionError,
  projectCardVaultOfficialFaceMetadata as projectFaces,
  type OfficialCardVaultFaceProjection
} from "./card-vault-face-projection.ts";
import {
  OfficialFacePrintingMultiplicityReconciliationError,
  reconcileOfficialCardVaultFacePrintingMultiplicity as reconcileFacePrintingMultiplicity,
  type OfficialFacePrintingMultiplicityReconciliation
} from "./official-face-printing-multiplicity-reconciliation.ts";
import {
  OmensRecipeOfficialIdentityReconciliationError,
  reconcileOmensRecipeCustomCardsWithOfficialUpstreamIdentities as reconcileRecipeIdentities,
  type OmensRecipeOfficialIdentityReconciliation
} from "./recipe-official-identity-reconciliation.ts";
import type { OmensRecipeCardReference } from "./custom-cards.ts";
import {
  DraftEligibilityClassificationError,
  classifyOmensOfficialDraftEligibility as classifyDraftEligibility,
  type OmensDraftEligibilityClassification
} from "./draft-eligibility-classification.ts";
import {
  OmensRecipePoolIdentityResolutionError,
  resolveOmensRecipePoolsToDraftableOfficialIdentities as resolveRecipePools,
  type OmensRecipePoolOfficialIdentityResolution
} from "./recipe-pool-identity-resolution.ts";
import type { OmensPools } from "./pools.ts";
import type { OmensLayouts } from "./layouts.ts";
import {
  OmensRecipeLayoutPoolResolutionError,
  resolveOmensRecipeLayoutsToOfficialIdentityPools as resolveRecipeLayouts,
  type OmensRecipeLayoutOfficialIdentityPoolResolution
} from "./recipe-layout-pool-resolution.ts";
import {
  OmensRecipeRarityCorrespondenceError,
  reconcileOmensRecipeRaritiesWithOfficialUpstreamPrintings as reconcileRecipeRarities,
  type OmensRecipeRarityCorrespondence
} from "./recipe-rarity-correspondence.ts";
import {
  OmensCollationWeightTablesError,
  compileOmensCollationWeightTables as compileCollationWeightTables,
  type OmensCollationWeightTables
} from "./collation-weight-tables.ts";

export {
  FabCardSourceSchemaValidationError,
  OmnSourceProjectionError,
  OfficialUpstreamIdReconciliationError,
  OfficialSuffixFoilingClassificationError,
  CardVaultFaceProjectionError,
  OfficialFacePrintingMultiplicityReconciliationError,
  OmensRecipeOfficialIdentityReconciliationError,
  OmensRecipeRarityCorrespondenceError,
  DraftEligibilityClassificationError,
  OmensRecipePoolIdentityResolutionError,
  OmensRecipeLayoutPoolResolutionError,
  OmensCollationWeightTablesError,
  type OmnSourceProjection,
  type OfficialUpstreamIdReconciliation,
  type OfficialSuffixFoilingClassification,
  type OfficialCardVaultFaceProjection,
  type OfficialFacePrintingMultiplicityReconciliation,
  type OmensRecipeOfficialIdentityReconciliation,
  type OmensRecipeRarityCorrespondence,
  type OmensDraftEligibilityClassification,
  type OmensRecipePoolOfficialIdentityResolution,
  type OmensRecipeLayoutOfficialIdentityPoolResolution,
  type OmensCollationWeightTables,
  type SchemaValidatedFabEnglishCardData
};

/** Validates the complete pinned card document against the complete pinned Draft-04 schema. */
export const validateFabEnglishCardDataAgainstSchema = (
  card: ValidatedFabEnglishCardDocument,
  schema: ValidatedFabCardSchemaDocument
): SchemaValidatedFabEnglishCardData => {
  try {
    assertVerifiedValidatedFabEnglishCardDocument(card);
    assertVerifiedValidatedFabCardSchemaDocument(schema);
    return validateFabCardDataDocumentsForSchema(card, schema);
  } catch (error) {
    if (error instanceof FabCardSourceSchemaValidationError) throw error;
    throw new FabCardSourceSchemaValidationError();
  }
};

/** Build-time-only OMN source projection from the opaque schema-validated capability. */
export const projectSchemaValidatedFabEnglishCardDataForOmn = (
  data: SchemaValidatedFabEnglishCardData
): OmnSourceProjection => {
  try {
    return projectOmnSourceRecords(readSchemaValidatedFabEnglishCardDataForParser(data));
  } catch (error) {
    if (error instanceof OmnSourceProjectionError) throw error;
    throw new OmnSourceProjectionError();
  }
};

/** Build-time-only identity/base reconciliation retaining uninterpreted art-variation metadata. */
export const reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData = (
  membership: OfficialCardVaultMembership,
  data: SchemaValidatedFabEnglishCardData
): OfficialUpstreamIdReconciliation =>
  reconcileOfficialCardVaultMembershipWithSchemaValidatedFabSource(membership, data);

/** Build-time-only exact community-recipe to official identity membership reconciliation. */
export const reconcileOmensRecipeCustomCardsWithOfficialUpstreamIdentities = (
  recipe: ReadonlyArray<OmensRecipeCardReference>,
  official: OfficialUpstreamIdReconciliation
): OmensRecipeOfficialIdentityReconciliation => reconcileRecipeIdentities(recipe, official);

/** Build-time-only observed recipe-label/upstream-row rarity correspondence for mapped identities only. */
export const reconcileOmensRecipeRaritiesWithOfficialUpstreamPrintings = (
  identities: OmensRecipeOfficialIdentityReconciliation,
  official: OfficialUpstreamIdReconciliation
): OmensRecipeRarityCorrespondence => reconcileRecipeRarities(identities, official);

/** Build-time-only Omens product-policy facts; no runtime pool or treatment behavior is implied. */
export const classifyOmensOfficialDraftEligibility = (
  ...inputs: [OmensRecipeOfficialIdentityReconciliation, OfficialUpstreamIdReconciliation]
): OmensDraftEligibilityClassification => classifyDraftEligibility(...inputs);

/** Build-time-only staged recipe-pool ownership to draftable official identity resolution; no treatment is selected. */
export const resolveOmensRecipePoolsToDraftableOfficialIdentities = (
  ...inputs: [OmensPools, OmensRecipeOfficialIdentityReconciliation, OmensDraftEligibilityClassification]
): OmensRecipePoolOfficialIdentityResolution => resolveRecipePools(...inputs);

/** Build-time-only resolution of every completed weighted layout slot through its exact capability-owned pool. */
export const resolveOmensRecipeLayoutsToOfficialIdentityPools = (
  ...inputs: [OmensLayouts, OmensRecipePoolOfficialIdentityResolution]
): OmensRecipeLayoutOfficialIdentityPoolResolution => resolveRecipeLayouts(...inputs);

/** Build-time-only compilation of exact integer cumulative weights; no selector, randomness, or draw is performed. */
export const compileOmensCollationWeightTables = (
  ...inputs: [OmensRecipeLayoutOfficialIdentityPoolResolution, OmensRecipePoolOfficialIdentityResolution]
): OmensCollationWeightTables => compileCollationWeightTables(...inputs);

/** Build-time-only observed suffix-to-upstream-foiling correspondence from reconciliation only. */
export const classifyOfficialCardVaultSuffixFoiling = (
  reconciliation: OfficialUpstreamIdReconciliation
): OfficialSuffixFoilingClassification => classifySuffixFoiling(reconciliation);

/** Build-time-only canonical-membership-order projection retaining source-order face positions and exact image-rendition text. */
export const projectOfficialCardVaultFaceMetadata = (
  membership: OfficialCardVaultMembership,
  responseBytes: Uint8Array
): OfficialCardVaultFaceProjection => {
  try {
    return projectFaces(membership, responseBytes);
  } catch (error) {
    if (error instanceof CardVaultFaceProjectionError) throw error;
    throw new CardVaultFaceProjectionError();
  }
};

/** Build-time-only MV face-to-upstream-row multiplicity fact; it has no face or printing semantics. */
export const reconcileOfficialCardVaultFacePrintingMultiplicity = (
  faces: OfficialCardVaultFaceProjection,
  reconciliation: OfficialUpstreamIdReconciliation
): OfficialFacePrintingMultiplicityReconciliation => {
  try {
    return reconcileFacePrintingMultiplicity(faces, reconciliation);
  } catch (error) {
    if (error instanceof OfficialFacePrintingMultiplicityReconciliationError) throw error;
    throw new OfficialFacePrintingMultiplicityReconciliationError();
  }
};
