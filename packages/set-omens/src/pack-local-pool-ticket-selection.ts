import {
  readOmensPackLocalPoolDrawStatePoolForTicketSelection,
  type OmensPackLocalPoolDrawState
} from "./pack-local-pool-draw-state.ts";
import type { OmensRecipePoolOfficialIdentityResolution } from "./recipe-pool-identity-resolution.ts";

/** Stable, source-secret failure for one dynamic pack-local bounded-ticket lookup. */
export class OmensPackLocalPoolTicketSelectionError extends Error {
  readonly code = "OMENS_PACK_LOCAL_POOL_TICKET_SELECTION_FAILED";

  constructor() {
    super("Omens pack local pool ticket selection failed.");
    this.name = "OmensPackLocalPoolTicketSelectionError";
    this.stack = `${this.name}: ${this.message}`;
  }
}

type PoolReference = OmensRecipePoolOfficialIdentityResolution[number];
type OfficialIdentityReference = PoolReference["entries"][number]["officialIdentity"];
type PoolChoice = Readonly<{
  officialIdentityReference: OfficialIdentityReference;
  weight: number;
  cumulativeExclusiveEnd: number;
}>;

const fail = (): never => { throw new OmensPackLocalPoolTicketSelectionError(); };

const validTicket = (ticket: unknown, total: unknown): ticket is number =>
  typeof ticket === "number" && Number.isSafeInteger(ticket) && ticket >= 0 &&
  typeof total === "number" && Number.isSafeInteger(total) && total > 0 && ticket < total;

const validateChoices = (choices: unknown, total: unknown): choices is ReadonlyArray<PoolChoice> => {
  if (!Array.isArray(choices) || choices.length === 0 || !Object.isFrozen(choices) ||
    typeof total !== "number" || !Number.isSafeInteger(total) || total <= 0) return false;
  let priorEnd = 0;
  for (const choice of choices) {
    if (typeof choice !== "object" || choice === null || !Object.isFrozen(choice) ||
      !Object.isFrozen(choice.officialIdentityReference) || !Number.isSafeInteger(choice.weight) || choice.weight <= 0 ||
      !Number.isSafeInteger(choice.cumulativeExclusiveEnd) || choice.cumulativeExclusiveEnd !== priorEnd + choice.weight) return false;
    priorEnd = choice.cumulativeExclusiveEnd;
  }
  return priorEnd === total;
};

/** Finds the first recomputed exclusive cumulative end strictly greater than the exact bounded ticket. */
const choiceForTicket = (choices: ReadonlyArray<PoolChoice>, total: number, ticket: unknown): PoolChoice => {
  if (!validateChoices(choices, total) || !validTicket(ticket, total)) return fail();
  let lower = 0;
  let upper = choices.length;
  while (lower < upper) {
    const middle = lower + Math.floor((upper - lower) / 2);
    if (choices[middle].cumulativeExclusiveEnd > ticket) upper = middle;
    else lower = middle + 1;
  }
  if (lower >= choices.length) fail();
  return choices[lower];
};

/** Selects one remaining exact capability-owned official identity from one dynamic pack-local pool state. */
export const selectOmensPackLocalPoolOfficialIdentityByTicket = (
  ...inputs: [OmensPackLocalPoolDrawState, PoolReference, number]
): OfficialIdentityReference => {
  if (inputs.length !== 3) return fail();
  try {
    const scope = readOmensPackLocalPoolDrawStatePoolForTicketSelection(inputs[0], inputs[1]);
    const choice = choiceForTicket(scope.choices, scope.scopedTotal, inputs[2]);
    if (!Object.isFrozen(choice.officialIdentityReference)) return fail();
    return choice.officialIdentityReference;
  } catch (error) {
    if (error instanceof OmensPackLocalPoolTicketSelectionError) throw error;
    return fail();
  }
};
