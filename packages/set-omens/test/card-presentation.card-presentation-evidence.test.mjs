import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateCardVaultOmensOfficialMembership, validateVerifiedFabCardSourceDocuments, verifyFabCardSchemaBytes, verifyFabEnglishCardBytes } from "../src/index.ts";
import { projectOmensOfficialCardPresentation } from "../src/card-presentation.ts";
import { projectOfficialCardVaultFaceMetadata, reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData, validateFabEnglishCardDataAgainstSchema } from "../src/schema-validation.ts";

const variables = ["FAB_CARD_SOURCE_EVIDENCE_PATH", "FAB_CARD_SCHEMA_EVIDENCE_PATH", "FAB_CARD_VAULT_EVIDENCE_PATH"];
const available = variables.every((key) => Boolean(process.env[key]));
const contractName = "checksum-verified public card and Card Vault evidence establish an exact Omens display projection";
const marker = "CARD_PRESENTATION_CONTRACT_EXECUTED";

test(contractName, { skip: !available ? "public presentation acceptance did not run; use npm run test:card-presentation-evidence" : false }, () => {
  console.log(marker);
  const cardBytes = readFileSync(process.env.FAB_CARD_SOURCE_EVIDENCE_PATH);
  const schemaBytes = readFileSync(process.env.FAB_CARD_SCHEMA_EVIDENCE_PATH);
  const vaultBytes = readFileSync(process.env.FAB_CARD_VAULT_EVIDENCE_PATH);
  const documents = validateVerifiedFabCardSourceDocuments(verifyFabEnglishCardBytes(cardBytes), verifyFabCardSchemaBytes(schemaBytes));
  const membership = validateCardVaultOmensOfficialMembership(vaultBytes);
  const reconciliation = reconcileOfficialCardVaultMembershipWithSchemaValidatedFabCardData(membership, validateFabEnglishCardDataAgainstSchema(documents.card, documents.schema));
  const faces = projectOfficialCardVaultFaceMetadata(membership, vaultBytes);
  const identity = reconciliation[0]; const result = projectOmensOfficialCardPresentation(reconciliation, faces, identity, identity.printings[0], 10);
  assert.equal(result.officialPrintId, identity.officialPrintId); assert.equal(result.imageUrl, faces[0].faces[0].image.normal);
});
