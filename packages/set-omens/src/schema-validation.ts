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
import {
  OmensCollationWeightTicketSelectionError,
  selectOmensCollationLayoutByTicket as selectLayoutByTicket,
  selectOmensCollationPoolOfficialIdentityByTicket as selectPoolOfficialIdentityByTicket
} from "./collation-weight-ticket-selection.ts";
import {
  OmensCollationSampleSelectionError,
  selectOmensCollationLayoutFromOneUnsigned32Sample as selectLayoutFromOneSample,
  selectOmensCollationPoolOfficialIdentityFromOneUnsigned32Sample as selectPoolOfficialIdentityFromOneSample,
  type OmensCollationLayoutSampleSelection,
  type OmensCollationPoolSampleSelection
} from "./collation-sample-selection.ts";
import {
  OmensPackLocalPoolDrawStateError,
  initializeOmensPackLocalPoolDrawState as initializePackLocalPoolDrawState,
  removeOmensPackLocalPoolOfficialIdentity as removePackLocalPoolOfficialIdentity,
  type OmensPackLocalPoolDrawState
} from "./pack-local-pool-draw-state.ts";
import {
  OmensPackLocalPoolTicketSelectionError,
  selectOmensPackLocalPoolOfficialIdentityByTicket as selectPackLocalPoolOfficialIdentityByTicket
} from "./pack-local-pool-ticket-selection.ts";
import {
  OmensPackLocalPoolSampleSelectionError,
  selectOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample as selectPackLocalPoolOfficialIdentityFromOneSample,
  type OmensPackLocalPoolSampleSelection
} from "./pack-local-pool-sample-selection.ts";
import {
  OmensPackLocalPoolSampleDrawTransitionError,
  drawOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample as drawPackLocalPoolOfficialIdentityFromOneSample,
  type OmensPackLocalPoolSampleDrawTransition
} from "./pack-local-pool-sample-draw-transition.ts";
import {
  OmensPackCollationPlanInitializationError,
  initializeOmensPackCollationPlanFromOneUnsigned32Sample as initializePackCollationPlanFromOneSample,
  readOmensPackCollationPlanLayoutForTransition,
  readOmensPackCollationPlanNextPositionForTransition,
  readOmensPackCollationPlanPoolDrawStateForTransition,
  type OmensPackCollationPlan,
  type OmensPackCollationPlanInitialization
} from "./pack-collation-plan.ts";
import {
  initializeOmensPackCollationPlanFromUnsigned32SampleBatch as initializePackCollationPlanFromBatch,
  type OmensFiniteBatchCollationPlanInitialization
} from "./finite-batch-collation-plan.ts";

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
  OmensCollationWeightTicketSelectionError,
  OmensCollationSampleSelectionError,
  OmensPackLocalPoolDrawStateError,
  OmensPackLocalPoolTicketSelectionError,
  OmensPackLocalPoolSampleSelectionError,
  OmensPackLocalPoolSampleDrawTransitionError,
  OmensPackCollationPlanInitializationError,
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
  type OmensCollationLayoutSampleSelection,
  type OmensCollationPoolSampleSelection,
  type OmensPackLocalPoolDrawState,
  type OmensPackLocalPoolSampleSelection,
  type OmensPackLocalPoolSampleDrawTransition,
  type OmensPackCollationPlan,
  type OmensPackCollationPlanInitialization,
  type OmensFiniteBatchCollationPlanInitialization,
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

/** Deterministically selects one capability-owned layout reference from an exact bounded layout ticket. */
export const selectOmensCollationLayoutByTicket = (
  ...inputs: [OmensCollationWeightTables, number]
): OmensRecipeLayoutOfficialIdentityPoolResolution["layouts"][number] => selectLayoutByTicket(...inputs);

/** Deterministically selects one capability-owned identity reference from one exact bounded pool ticket. */
export const selectOmensCollationPoolOfficialIdentityByTicket = (
  ...inputs: [OmensCollationWeightTables, OmensRecipePoolOfficialIdentityResolution[number], number]
): OmensRecipePoolOfficialIdentityResolution[number]["entries"][number]["officialIdentity"] => selectPoolOfficialIdentityByTicket(...inputs);

/** Composes exactly one uint32 sample to a capability-owned layout selection or explicit retry; it never retries. */
export const selectOmensCollationLayoutFromOneUnsigned32Sample = (
  ...inputs: [OmensCollationWeightTables, number]
): OmensCollationLayoutSampleSelection => selectLayoutFromOneSample(...inputs);

/** Composes exactly one uint32 sample to one capability-owned pool identity selection or explicit retry; it never retries. */
export const selectOmensCollationPoolOfficialIdentityFromOneUnsigned32Sample = (
  ...inputs: [OmensCollationWeightTables, OmensRecipePoolOfficialIdentityResolution[number], number]
): OmensCollationPoolSampleSelection => selectPoolOfficialIdentityFromOneSample(...inputs);

/** Creates one fresh immutable pack-local same-pool no-replacement state from registered pool tables. */
export const initializeOmensPackLocalPoolDrawState = (
  ...inputs: [OmensCollationWeightTables]
): OmensPackLocalPoolDrawState => initializePackLocalPoolDrawState(...inputs);

/** Removes one exact capability-owned identity from one exact pool in a registered pack-local state. */
export const removeOmensPackLocalPoolOfficialIdentity = (
  ...inputs: [
    OmensPackLocalPoolDrawState,
    OmensRecipePoolOfficialIdentityResolution[number],
    OmensRecipePoolOfficialIdentityResolution[number]["entries"][number]["officialIdentity"]
  ]
): OmensPackLocalPoolDrawState => removePackLocalPoolOfficialIdentity(...inputs);

/** Deterministically selects one remaining capability-owned identity from a dynamic pack-local bounded ticket. */
export const selectOmensPackLocalPoolOfficialIdentityByTicket = (
  ...inputs: [
    OmensPackLocalPoolDrawState,
    OmensRecipePoolOfficialIdentityResolution[number],
    number
  ]
): OmensRecipePoolOfficialIdentityResolution[number]["entries"][number]["officialIdentity"] => selectPackLocalPoolOfficialIdentityByTicket(...inputs);

/** Composes exactly one uint32 sample to a current pack-local pool identity selection or explicit retry; it never removes or retries. */
export const selectOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample = (
  ...inputs: [
    OmensPackLocalPoolDrawState,
    OmensRecipePoolOfficialIdentityResolution[number],
    number
  ]
): OmensPackLocalPoolSampleSelection => selectPackLocalPoolOfficialIdentityFromOneSample(...inputs);

/** Composes exactly one uint32 sample to an atomic current-pool selection and same-pool removal, or explicit retry. */
export const drawOmensPackLocalPoolOfficialIdentityFromOneUnsigned32Sample = (
  ...inputs: [
    OmensPackLocalPoolDrawState,
    OmensRecipePoolOfficialIdentityResolution[number],
    number
  ]
): OmensPackLocalPoolSampleDrawTransition => drawPackLocalPoolOfficialIdentityFromOneSample(...inputs);

/** Initializes one selected-layout fresh all-pool plan or explicit retry; it draws neither position nor card. */
export const initializeOmensPackCollationPlanFromOneUnsigned32Sample = (
  ...inputs: [OmensCollationWeightTables, number]
): OmensPackCollationPlanInitialization => initializePackCollationPlanFromOneSample(...inputs);

/** Initializes one fresh layout-bound plan from only one finite caller-supplied batch; it is not a pack and draws no card. */
export const initializeOmensPackCollationPlanFromUnsigned32SampleBatch = (
  ...inputs: [OmensCollationWeightTables, readonly number[]]
): OmensFiniteBatchCollationPlanInitialization => initializePackCollationPlanFromBatch(...inputs);

/** Narrow future-transition reader for the exact selected layout bound to a plan. */
export { readOmensPackCollationPlanLayoutForTransition, readOmensPackCollationPlanNextPositionForTransition, readOmensPackCollationPlanPoolDrawStateForTransition };

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
