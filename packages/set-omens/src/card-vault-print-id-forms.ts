import {
  CardVaultOfficialMembershipError,
  readOfficialCardVaultMembershipPrintIdsForReconciliation,
  type OfficialCardVaultMembership
} from "./card-vault-official-membership.ts";

/** Stable, deliberately non-semantic failure for the validated Card Vault ID forms. */
export class CardVaultPrintIdFormsError extends Error {
  readonly code = "CARD_VAULT_PRINT_ID_FORMS_INVALID";

  constructor() {
    super("Official Card Vault print-ID forms are invalid.");
    this.name = "CardVaultPrintIdFormsError";
    this.stack = `${this.name}: ${this.message}`;
  }
}

export type CardVaultPrintIdForm = Readonly<{
  officialPrintId: string;
  baseCollectorId: string;
  sourceSet: "OMN" | "IAR";
  suffixMarker: "RF" | "CF" | "MV" | null;
}>;

const FORM = /^(OMN|IAR)([0-9]{3})(?:-(RF|CF|MV))?$/;

/** Classifies only an already validated membership capability; no response data is accepted. */
export const readOfficialCardVaultPrintIdForms = (
  membership: OfficialCardVaultMembership
): readonly CardVaultPrintIdForm[] => {
  let ids: readonly string[];
  try {
    ids = readOfficialCardVaultMembershipPrintIdsForReconciliation(membership);
  } catch (error) {
    if (error instanceof CardVaultOfficialMembershipError) throw new CardVaultPrintIdFormsError();
    throw error;
  }

  const bases = new Set<string>();
  const forms: CardVaultPrintIdForm[] = [];
  let omn = 0, rf = 0, cf = 0, mv = 0;
  for (const officialPrintId of ids) {
    const match = FORM.exec(officialPrintId);
    if (!match) throw new CardVaultPrintIdFormsError();
    const sourceSet = match[1] as "OMN" | "IAR";
    const suffixMarker = (match[3] ?? null) as "RF" | "CF" | "MV" | null;
    const baseCollectorId = `${sourceSet}${match[2]}`;
    if (bases.has(baseCollectorId)) throw new CardVaultPrintIdFormsError();
    bases.add(baseCollectorId);
    if (sourceSet === "OMN" && suffixMarker === null) omn++;
    else if (sourceSet === "OMN" && suffixMarker === "RF") rf++;
    else if (sourceSet === "OMN" && suffixMarker === "CF") cf++;
    else if (sourceSet === "IAR" && suffixMarker === "MV") mv++;
    else throw new CardVaultPrintIdFormsError();
    forms.push(Object.freeze({ officialPrintId, baseCollectorId, sourceSet, suffixMarker }));
  }
  if (ids.length !== 260 || bases.size !== 260 || omn !== 242 || rf !== 6 || cf !== 3 || mv !== 9) {
    throw new CardVaultPrintIdFormsError();
  }
  return Object.freeze(forms);
};

/** Package-internal reconciliation-slice name retained for build-time callers. */
export const readOfficialCardVaultPrintIdFormsForReconciliation = readOfficialCardVaultPrintIdForms;
