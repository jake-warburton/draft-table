import {
  UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END,
  mapUnsigned32SampleBatchToBoundedTicket
} from "@draft-table/engine";
import {
  isOmensPackCollationPlanExactPositionTransition,
  readOmensPackCollationPlanCurrentPositionForTransition,
  registerOmensPackCollationPlanPositionTransition,
  type OmensPackCollationPlan
} from "./pack-collation-plan.ts";
import {
  readOmensPackLocalPoolDrawStatePoolForTicketSelection,
  removeOmensPackLocalPoolOfficialIdentity,
  type OmensPackLocalPoolDrawState
} from "./pack-local-pool-draw-state.ts";
import { selectOmensPackLocalPoolOfficialIdentityByTicket } from "./pack-local-pool-ticket-selection.ts";
import type { OmensRecipeLayoutOfficialIdentityPoolResolution } from "./recipe-layout-pool-resolution.ts";
import type { OmensRecipePoolOfficialIdentityResolution } from "./recipe-pool-identity-resolution.ts";

const isArray: typeof Array.isArray = Array.isArray;
const defineOwnDataProperty: typeof Object.defineProperty = Object.defineProperty;
const freeze: typeof Object.freeze = Object.freeze;
const getOwnPropertyDescriptor: typeof Object.getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const ownKeys: typeof Reflect.ownKeys = Reflect.ownKeys;
const isFrozen: typeof Object.isFrozen = Object.isFrozen;
const isSafeInteger: typeof Number.isSafeInteger = Number.isSafeInteger;
const handedOutTransitionPlans = new WeakSet<object>();
const handedOutTransitionPoolDrawStates = new WeakSet<object>();
const weakSetHas = Function.prototype.call.bind(WeakSet.prototype.has) as (
  set: WeakSet<object>, value: object
) => boolean;
const weakSetAdd = Function.prototype.call.bind(WeakSet.prototype.add) as (
  set: WeakSet<object>, value: object
) => WeakSet<object>;

/** Stable, source-secret failure for exactly one finite-batch plan-position transition. */
export class OmensPackCollationPlanPositionTransitionError extends Error {
  declare readonly code: "OMENS_PACK_COLLATION_PLAN_POSITION_TRANSITION_FAILED";

  constructor() {
    super("Omens pack collation plan position transition failed.");
    defineOwnDataProperty(this, "name", { value: "OmensPackCollationPlanPositionTransitionError", writable: true, enumerable: true, configurable: true });
    defineOwnDataProperty(this, "code", { value: "OMENS_PACK_COLLATION_PLAN_POSITION_TRANSITION_FAILED", writable: true, enumerable: true, configurable: true });
    defineOwnDataProperty(this, "stack", { value: "OmensPackCollationPlanPositionTransitionError: Omens pack collation plan position transition failed.", writable: true, enumerable: false, configurable: true });
  }
}

freeze(OmensPackCollationPlanPositionTransitionError.prototype);
freeze(OmensPackCollationPlanPositionTransitionError);

type PositionReference = OmensRecipeLayoutOfficialIdentityPoolResolution["layouts"][number]["slots"][number];
type PoolReference = OmensRecipePoolOfficialIdentityResolution[number];
type OfficialIdentityReference = PoolReference["entries"][number]["officialIdentity"];
type BatchMapping = Readonly<{
  state: "accepted";
  ticket: number;
  consumedSamples: number;
}> | Readonly<{
  state: "needs-sample";
  consumedSamples: number;
}>;
type BatchMapper = (samples: readonly number[], ticketBound: number) => unknown;
type TicketSelector = (
  state: OmensPackLocalPoolDrawState,
  poolReference: PoolReference,
  ticket: number
) => unknown;
type IdentityRemover = (
  state: OmensPackLocalPoolDrawState,
  poolReference: PoolReference,
  officialIdentityReference: OfficialIdentityReference
) => unknown;
type PlanRegistrar = (
  priorPlan: OmensPackCollationPlan,
  positionReference: PositionReference,
  officialIdentityReference: OfficialIdentityReference,
  nextState: OmensPackLocalPoolDrawState
) => unknown;

/** One finite batch either requests another sample or atomically advances exactly one recipe position. */
export type OmensFiniteBatchCollationPlanPositionTransition = Readonly<{
  state: "selected";
  consumedSamples: number;
  positionReference: PositionReference;
  officialIdentityReference: OfficialIdentityReference;
  nextPlan: OmensPackCollationPlan;
}> | Readonly<{
  state: "needs-sample";
  consumedSamples: number;
}>;

const fail = (): never => { throw new OmensPackCollationPlanPositionTransitionError(); };
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
  if (ownKeys(mapping).length !== (state === "accepted" ? 3 : 2)) return fail();
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

const snapshotFiniteBatch = (batchInput: unknown): Readonly<{
  samples: readonly number[];
  sampleCount: number;
}> => {
  if (!isArray(batchInput)) return fail();
  const sampleCount = batchInput.length;
  if (!isSafeInteger(sampleCount) || sampleCount < 0 ||
    sampleCount >= UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END) return fail();
  const sampleSnapshot: unknown[] = [];
  for (let index = 0; index < sampleCount; index++) {
    defineOwnDataProperty(sampleSnapshot, index, {
      value: batchInput[index], writable: false, enumerable: true, configurable: false
    });
  }
  // Captured prototype-safe numeric own writes make this mismatch unreachable today;
  // retain it to convert a capture-regression empty snapshot into stable rejection.
  if (sampleSnapshot.length !== sampleCount) return fail();
  return { samples: frozen(sampleSnapshot) as readonly number[], sampleCount };
};

const exactSelectedIdentity = (
  choices: ReadonlyArray<Readonly<{
    officialIdentityReference: OfficialIdentityReference;
    cumulativeExclusiveEnd: number;
  }>>,
  ticket: number,
  selectedIdentity: unknown
): OfficialIdentityReference => {
  let priorEnd = 0, expected: OfficialIdentityReference | undefined;
  for (let index = 0; index < choices.length; index++) {
    const choice = choices[index];
    if (ticket >= priorEnd && ticket < choice.cumulativeExclusiveEnd) expected = choice.officialIdentityReference;
    priorEnd = choice.cumulativeExclusiveEnd;
  }
  if (expected === undefined || selectedIdentity !== expected || !isFrozen(expected)) return fail();
  return expected;
};

const needsSample = (consumedSamples: number): OmensFiniteBatchCollationPlanPositionTransition => {
  const result = {} as { state: "needs-sample"; consumedSamples: number };
  defineOwnDataProperty(result, "state", { value: "needs-sample", writable: false, enumerable: true, configurable: false });
  defineOwnDataProperty(result, "consumedSamples", { value: consumedSamples, writable: false, enumerable: true, configurable: false });
  return frozen(result);
};

const selected = (
  consumedSamples: number,
  positionReference: PositionReference,
  officialIdentityReference: OfficialIdentityReference,
  nextPlan: OmensPackCollationPlan
): OmensFiniteBatchCollationPlanPositionTransition => {
  const result = {} as {
    state: "selected";
    consumedSamples: number;
    positionReference: PositionReference;
    officialIdentityReference: OfficialIdentityReference;
    nextPlan: OmensPackCollationPlan;
  };
  defineOwnDataProperty(result, "state", { value: "selected", writable: false, enumerable: true, configurable: false });
  defineOwnDataProperty(result, "consumedSamples", { value: consumedSamples, writable: false, enumerable: true, configurable: false });
  defineOwnDataProperty(result, "positionReference", { value: positionReference, writable: false, enumerable: true, configurable: false });
  defineOwnDataProperty(result, "officialIdentityReference", { value: officialIdentityReference, writable: false, enumerable: true, configurable: false });
  defineOwnDataProperty(result, "nextPlan", { value: nextPlan, writable: false, enumerable: true, configurable: false });
  return frozen(result);
};

const transitionCapturedBatch = (
  plan: OmensPackCollationPlan,
  batchInput: unknown,
  mapBatch: BatchMapper,
  selectIdentity: TicketSelector,
  removeIdentity: IdentityRemover,
  registerPlan: PlanRegistrar
): OmensFiniteBatchCollationPlanPositionTransition => {
  const batch = snapshotFiniteBatch(batchInput);
  return compose(
    plan, batch.samples, batch.sampleCount, mapBatch, selectIdentity, removeIdentity, registerPlan
  );
};

const compose = (
  plan: OmensPackCollationPlan,
  samples: readonly number[],
  sampleCount: number,
  mapBatch: BatchMapper,
  selectIdentity: TicketSelector,
  removeIdentity: IdentityRemover,
  registerPlan: PlanRegistrar
): OmensFiniteBatchCollationPlanPositionTransition => {
  const current = readOmensPackCollationPlanCurrentPositionForTransition(plan);
  const positionReference = current.positionReference;
  const poolReference = positionReference.resolvedPool;
  const scope = readOmensPackLocalPoolDrawStatePoolForTicketSelection(current.poolDrawState, poolReference);
  const mapping = validateMapping(mapBatch(samples, scope.scopedTotal), scope.scopedTotal, sampleCount);
  if (mapping.state === "needs-sample") return needsSample(mapping.consumedSamples);
  const officialIdentityReference = exactSelectedIdentity(
    scope.choices, mapping.ticket,
    selectIdentity(current.poolDrawState, poolReference, mapping.ticket)
  );
  const nextPoolDrawState = removeIdentity(
    current.poolDrawState, poolReference, officialIdentityReference
  ) as OmensPackLocalPoolDrawState;
  const nextPlan = registerPlan(
    plan, positionReference, officialIdentityReference, nextPoolDrawState
  ) as OmensPackCollationPlan;
  if (!isOmensPackCollationPlanExactPositionTransition(
    plan, nextPlan, positionReference, officialIdentityReference, nextPoolDrawState
  ) || weakSetHas(handedOutTransitionPlans, nextPlan) ||
    weakSetHas(handedOutTransitionPoolDrawStates, nextPoolDrawState)) return fail();
  weakSetAdd(handedOutTransitionPlans, nextPlan);
  weakSetAdd(handedOutTransitionPoolDrawStates, nextPoolDrawState);
  return selected(
    mapping.consumedSamples, positionReference, officialIdentityReference, nextPlan
  );
};

/**
 * Uses one finite caller-supplied uint32 batch to transition exactly the current recipe position.
 * It owns no entropy source, retry loop, pack assembly, or cross-pool duplicate policy.
 */
export const transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatch = (
  ...inputs: [OmensPackCollationPlan, readonly number[]]
): OmensFiniteBatchCollationPlanPositionTransition => {
  try {
    if (inputs.length !== 2) return fail();
    return transitionCapturedBatch(
      inputs[0], inputs[1], mapUnsigned32SampleBatchToBoundedTicket,
      selectOmensPackLocalPoolOfficialIdentityByTicket,
      removeOmensPackLocalPoolOfficialIdentity,
      registerOmensPackCollationPlanPositionTransition
    );
  } catch { return fail(); }
};

/** Package-internal seam for malformed dependency-result and no-op contracts. */
export const transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatchForTest = (
  ...inputs: [OmensPackCollationPlan, readonly number[], BatchMapper, TicketSelector, IdentityRemover, PlanRegistrar]
): OmensFiniteBatchCollationPlanPositionTransition => {
  try {
    if (inputs.length !== 6 || typeof inputs[2] !== "function" || typeof inputs[3] !== "function" ||
      typeof inputs[4] !== "function" || typeof inputs[5] !== "function") return fail();
    return transitionCapturedBatch(
      inputs[0], inputs[1], inputs[2], inputs[3], inputs[4], inputs[5]
    );
  } catch { return fail(); }
};
