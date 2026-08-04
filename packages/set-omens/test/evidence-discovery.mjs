export const PUBLIC_SOURCE_EVIDENCE_SUFFIX = ".public-source-evidence.test.mjs";

export const discoverEvidenceTests = (files) => files
  .filter((file) => file.endsWith(".test.mjs"))
  .filter((file) => !file.endsWith(PUBLIC_SOURCE_EVIDENCE_SUFFIX));

export const discoverPublicSourceEvidenceTests = (files) => files
  .filter((file) => file.endsWith(PUBLIC_SOURCE_EVIDENCE_SUFFIX));
