import {
  UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END,
  mapUnsigned32SampleBatchToBoundedTicket
} from "@draft-table/engine";
import {
  readOmensCollationLayoutWeightTotalForSampleSelection,
  type OmensCollationWeightTables
} from "./collation-weight-tables.ts";
import { selectOmensCollationLayoutByTicket } from "./collation-weight-ticket-selection.ts";
import {
  OmensPackCollationPlanInitializationError,
  registerOmensPackCollationPlanForExactSelectedLayout,
  type OmensPackCollationPlan
} from "./pack-collation-plan.ts";
import type { OmensRecipeLayoutOfficialIdentityPoolResolution } from "./recipe-layout-pool-resolution.ts";

/** A finite caller batch either needs another caller-supplied sample or binds one fresh plan. */
export type OmensFiniteBatchCollationPlanInitialization = Readonly<{
  state: "selected";
  consumedSamples: number;
  layoutReference: OmensRecipeLayoutOfficialIdentityPoolResolution["layouts"][number];
  plan: OmensPackCollationPlan;
}> | Readonly<{
  state: "needs-sample";
  consumedSamples: number;
}>;

type BatchMapping = Readonly<{
  state: "accepted";
  ticket: number;
  consumedSamples: number;
}> | Readonly<{
  state: "needs-sample";
  consumedSamples: number;
}>;
type LayoutSelector = (
  tables: OmensCollationWeightTables,
  ticket: number
) => OmensRecipeLayoutOfficialIdentityPoolResolution["layouts"][number];
type BatchMapper = (samples: readonly number[], ticketBound: number) => unknown;

const isArray: typeof Array.isArray = Array.isArray;
const defineOwnDataProperty: typeof Object.defineProperty = Object.defineProperty;
const freeze: typeof Object.freeze = Object.freeze;
const getOwnPropertyDescriptor: typeof Object.getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const ownKeys: typeof Reflect.ownKeys = Reflect.ownKeys;
const isFrozen: typeof Object.isFrozen = Object.isFrozen;
const isSafeInteger: typeof Number.isSafeInteger = Number.isSafeInteger;
const fail = (): never => { throw new OmensPackCollationPlanInitializationError(); };
const frozen = <Value>(value: Value): Readonly<Value> => freeze(value);

const ownFrozenDataValue = (value: object, property: string): unknown => {
  const descriptor = getOwnPropertyDescriptor(value, property);
  if (descriptor === undefined || descriptor.enumerable !== true || descriptor.configurable !== false ||
    descriptor.writable !== false) return fail();
  return descriptor.value;
};

const validateMapping = (mapping: unknown, ticketBound: number, sampleCount: number): BatchMapping => {
  if (typeof mapping !== "object" || mapping === null || !isFrozen(mapping)) return fail();
  const state = ownFrozenDataValue(mapping, "state");
  if (state !== "accepted" && state !== "needs-sample") return fail();
  const expectedPropertyCount = state === "accepted" ? 3 : 2;
  if (ownKeys(mapping).length !== expectedPropertyCount) return fail();
  const consumedSamples = ownFrozenDataValue(mapping, "consumedSamples");
  if (typeof consumedSamples !== "number" || !isSafeInteger(consumedSamples)) return fail();
  if (state === "needs-sample") {
    if (consumedSamples !== sampleCount) return fail();
    return { state, consumedSamples };
  }
  const ticket = ownFrozenDataValue(mapping, "ticket");
  if (typeof ticket !== "number" || !isSafeInteger(ticket) || ticket < 0 || ticket >= ticketBound ||
    consumedSamples < 1 || consumedSamples > sampleCount) return fail();
  return { state, ticket, consumedSamples };
};

const needsSample = (consumedSamples: number): OmensFiniteBatchCollationPlanInitialization => {
  const result = {} as { state: "needs-sample"; consumedSamples: number };
  defineOwnDataProperty(result, "state", { value: "needs-sample", writable: false, enumerable: true, configurable: false });
  defineOwnDataProperty(result, "consumedSamples", { value: consumedSamples, writable: false, enumerable: true, configurable: false });
  return frozen(result);
};

const selected = (
  consumedSamples: number,
  layoutReference: OmensRecipeLayoutOfficialIdentityPoolResolution["layouts"][number],
  plan: OmensPackCollationPlan
): OmensFiniteBatchCollationPlanInitialization => {
  const result = {} as {
    state: "selected";
    consumedSamples: number;
    layoutReference: OmensRecipeLayoutOfficialIdentityPoolResolution["layouts"][number];
    plan: OmensPackCollationPlan;
  };
  defineOwnDataProperty(result, "state", { value: "selected", writable: false, enumerable: true, configurable: false });
  defineOwnDataProperty(result, "consumedSamples", { value: consumedSamples, writable: false, enumerable: true, configurable: false });
  defineOwnDataProperty(result, "layoutReference", { value: layoutReference, writable: false, enumerable: true, configurable: false });
  defineOwnDataProperty(result, "plan", { value: plan, writable: false, enumerable: true, configurable: false });
  return frozen(result);
};

const compose = (
  tables: OmensCollationWeightTables,
  samples: readonly number[],
  sampleCount: number,
  mapBatch: BatchMapper,
  selectLayout: LayoutSelector
): OmensFiniteBatchCollationPlanInitialization => {
  const layoutTotal = readOmensCollationLayoutWeightTotalForSampleSelection(tables);
  const mapping = validateMapping(mapBatch(samples, layoutTotal), layoutTotal, sampleCount);
  if (mapping.state === "needs-sample") return needsSample(mapping.consumedSamples);
  const layoutReference = selectLayout(tables, mapping.ticket);
  const plan = registerOmensPackCollationPlanForExactSelectedLayout(tables, layoutReference);
  return selected(mapping.consumedSamples, layoutReference, plan);
};

/**
 * Consumes only one finite caller-owned uint32 batch to initialize one exact fresh collation plan.
 * It owns no entropy, retry policy, card draw, position transition, or pack construction.
 */
export const initializeOmensPackCollationPlanFromUnsigned32SampleBatch = (
  ...inputs: [OmensCollationWeightTables, readonly number[]]
): OmensFiniteBatchCollationPlanInitialization => {
  try {
    if (inputs.length !== 2 || !isArray(inputs[1])) return fail();
    const samples = inputs[1], sampleCount = samples.length;
    if (!isSafeInteger(sampleCount) || sampleCount < 0 ||
      sampleCount >= UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END) return fail();
    return compose(
      inputs[0], samples, sampleCount,
      mapUnsigned32SampleBatchToBoundedTicket, selectOmensCollationLayoutByTicket
    );
  } catch { return fail(); }
};

/** Package-internal seam for malformed mapper-result contracts. */
export const initializeOmensPackCollationPlanFromUnsigned32SampleBatchForTest = (
  ...inputs: [OmensCollationWeightTables, readonly number[], BatchMapper]
): OmensFiniteBatchCollationPlanInitialization => {
  try {
    if (inputs.length !== 3 || !isArray(inputs[1]) || typeof inputs[2] !== "function") return fail();
    const samples = inputs[1], sampleCount = samples.length;
    if (!isSafeInteger(sampleCount) || sampleCount < 0 ||
      sampleCount >= UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END) return fail();
    return compose(inputs[0], samples, sampleCount, inputs[2], selectOmensCollationLayoutByTicket);
  } catch { return fail(); }
};
