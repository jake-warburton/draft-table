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

export {
  FabCardSourceSchemaValidationError,
  OmnSourceProjectionError,
  OfficialUpstreamIdReconciliationError,
  OfficialSuffixFoilingClassificationError,
  CardVaultFaceProjectionError,
  type OmnSourceProjection,
  type OfficialUpstreamIdReconciliation,
  type OfficialSuffixFoilingClassification,
  type OfficialCardVaultFaceProjection,
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

/** Build-time-only observed suffix-to-upstream-foiling correspondence from reconciliation only. */
export const classifyOfficialCardVaultSuffixFoiling = (
  reconciliation: OfficialUpstreamIdReconciliation
): OfficialSuffixFoilingClassification => classifySuffixFoiling(reconciliation);

/** Build-time-only exact source-order face-position and image-rendition projection. */
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
