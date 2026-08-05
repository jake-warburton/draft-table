import {
  readOmensCollationLayoutWeightTableForTicketSelection,
  readOmensCollationPoolWeightTableForTicketSelection,
  type OmensCollationWeightTables
} from "./collation-weight-tables.ts";
import type {
  OmensRecipeLayoutOfficialIdentityPoolResolution
} from "./recipe-layout-pool-resolution.ts";
import type {
  OmensRecipePoolOfficialIdentityResolution
} from "./recipe-pool-identity-resolution.ts";

/** Stable, source-secret failure for deterministic collation ticket selection. */
export class OmensCollationWeightTicketSelectionError extends Error {
  readonly code = "OMENS_COLLATION_WEIGHT_TICKET_SELECTION_FAILED";

  constructor() {
    super("Omens collation weight ticket selection failed.");
    this.name = "OmensCollationWeightTicketSelectionError";
    this.stack = `${this.name}: ${this.message}`;
  }
}

const arrayIsArray: typeof Array.isArray = Array.isArray;
const isFrozen: typeof Object.isFrozen = Object.isFrozen;
const isSafeInteger: typeof Number.isSafeInteger = Number.isSafeInteger;
const floor: typeof Math.floor = Math.floor;
const fail = (): never => { throw new OmensCollationWeightTicketSelectionError(); };

type LayoutChoice = OmensCollationWeightTables["layoutChoices"][number];
type PoolChoice = OmensCollationWeightTables["poolTables"][number]["officialIdentityChoices"][number];

const validTicket = (ticket: unknown, total: unknown): ticket is number =>
  typeof ticket === "number" && isSafeInteger(ticket) && ticket >= 0 &&
  typeof total === "number" && isSafeInteger(total) && total > 0 && ticket < total;

const validateChoices = <Choice extends Readonly<{ weight: number; cumulativeExclusiveEnd: number }>>(
  choices: unknown,
  total: unknown
): choices is ReadonlyArray<Choice> => {
  if (!arrayIsArray(choices) || choices.length === 0 || !isFrozen(choices) ||
    typeof total !== "number" || !isSafeInteger(total) || total <= 0) return false;
  let priorEnd = 0;
  for (let index = 0; index < choices.length; index++) {
    const choice = choices[index];
    if (typeof choice !== "object" || choice === null || !isFrozen(choice) ||
      !isSafeInteger(choice.weight) || choice.weight <= 0 ||
      !isSafeInteger(choice.cumulativeExclusiveEnd) || choice.cumulativeExclusiveEnd <= priorEnd ||
      choice.cumulativeExclusiveEnd !== priorEnd + choice.weight) return false;
    priorEnd = choice.cumulativeExclusiveEnd;
  }
  return priorEnd === total;
};

/** Finds the first exclusive cumulative end strictly greater than an exact bounded ticket. */
const choiceForTicket = <Choice extends Readonly<{ weight: number; cumulativeExclusiveEnd: number }>>(
  choices: ReadonlyArray<Choice>,
  total: number,
  ticket: unknown
): Choice => {
  if (!validateChoices<Choice>(choices, total)) return fail();
  if (typeof ticket !== "number") return fail();
  if (!validTicket(ticket, total)) return fail();
  const boundedTicket = ticket;
  let lower = 0;
  let upper = choices.length;
  while (lower < upper) {
    const middle = lower + floor((upper - lower) / 2);
    if (choices[middle].cumulativeExclusiveEnd > boundedTicket) upper = middle;
    else lower = middle + 1;
  }
  if (lower >= choices.length) fail();
  return choices[lower];
};

/** Selects one exact immutable layout reference from the registered layout-table scope only. */
export const selectOmensCollationLayoutByTicket = (
  ...inputs: [OmensCollationWeightTables, number]
): OmensRecipeLayoutOfficialIdentityPoolResolution["layouts"][number] => {
  if (inputs.length !== 2) return fail();
  try {
    const table = readOmensCollationLayoutWeightTableForTicketSelection(inputs[0]);
    const choice = choiceForTicket<LayoutChoice>(table.choices, table.scopedTotal, inputs[1]);
    if (!isFrozen(choice.layoutReference)) return fail();
    return choice.layoutReference;
  } catch (error) {
    if (error instanceof OmensCollationWeightTicketSelectionError) throw error;
    return fail();
  }
};

/** Selects one exact immutable official-identity reference from one named pool-table scope only. */
export const selectOmensCollationPoolOfficialIdentityByTicket = (
  ...inputs: [OmensCollationWeightTables, OmensRecipePoolOfficialIdentityResolution[number], number]
): OmensRecipePoolOfficialIdentityResolution[number]["entries"][number]["officialIdentity"] => {
  if (inputs.length !== 3) return fail();
  try {
    const table = readOmensCollationPoolWeightTableForTicketSelection(inputs[0], inputs[1]);
    const choice = choiceForTicket<PoolChoice>(table.choices, table.scopedTotal, inputs[2]);
    if (!isFrozen(choice.officialIdentityReference)) return fail();
    return choice.officialIdentityReference;
  } catch (error) {
    if (error instanceof OmensCollationWeightTicketSelectionError) throw error;
    return fail();
  }
};
