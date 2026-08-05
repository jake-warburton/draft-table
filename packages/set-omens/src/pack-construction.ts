import { UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END } from "@draft-table/engine";
import {
  transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatch,
  type OmensFiniteBatchCollationPlanPositionTransition
} from "./finite-batch-plan-position-transition.ts";
import {
  readOmensPackCollationPlanLayoutForTransition,
  readOmensPackCollationPlanNextPositionForTransition,
  readOmensPackCollationPlanPoolDrawStateForTransition,
  type OmensPackCollationPlan
} from "./pack-collation-plan.ts";
import type { OmensRecipeLayoutOfficialIdentityPoolResolution } from "./recipe-layout-pool-resolution.ts";
import type { OmensRecipePoolOfficialIdentityResolution } from "./recipe-pool-identity-resolution.ts";

const defineOwnDataProperty: typeof Object.defineProperty = Object.defineProperty;
const freeze: typeof Object.freeze = Object.freeze;
const isFrozen: typeof Object.isFrozen = Object.isFrozen;
const getOwnPropertyDescriptor: typeof Object.getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const ownKeys: typeof Reflect.ownKeys = Reflect.ownKeys;
const isArray: typeof Array.isArray = Array.isArray;
const isSafeInteger: typeof Number.isSafeInteger = Number.isSafeInteger;
const maximumSafeInteger = Number.MAX_SAFE_INTEGER;
const mapConstructor: typeof Map = Map;
const mapGet = Function.prototype.call.bind(Map.prototype.get) as <Key, Value>(map: Map<Key, Value>, key: Key) => Value | undefined;
const mapSet = Function.prototype.call.bind(Map.prototype.set) as <Key, Value>(map: Map<Key, Value>, key: Key, value: Value) => Map<Key, Value>;
const weakMapGet = Function.prototype.call.bind(WeakMap.prototype.get) as <Value>(map: WeakMap<object, Value>, key: object) => Value | undefined;
const weakMapSet = Function.prototype.call.bind(WeakMap.prototype.set) as <Value>(map: WeakMap<object, Value>, key: object, value: Value) => WeakMap<object, Value>;
const arraySome = Function.prototype.call.bind(Array.prototype.some) as <Value>(array: readonly Value[], predicate: (value: Value) => boolean) => boolean;

/** Stable, source-secret failure for finite-batch complete Omens pack construction. */
export class OmensPackConstructionError extends Error {
  declare readonly code: "OMENS_PACK_CONSTRUCTION_FAILED";

  constructor() {
    super("Omens pack construction failed.");
    defineOwnDataProperty(this, "name", { value: "OmensPackConstructionError", writable: true, enumerable: true, configurable: true });
    defineOwnDataProperty(this, "code", { value: "OMENS_PACK_CONSTRUCTION_FAILED", writable: true, enumerable: true, configurable: true });
    defineOwnDataProperty(this, "stack", { value: "OmensPackConstructionError: Omens pack construction failed.", writable: true, enumerable: false, configurable: true });
  }
}

freeze(OmensPackConstructionError.prototype);
freeze(OmensPackConstructionError);

type LayoutReference = OmensRecipeLayoutOfficialIdentityPoolResolution["layouts"][number];
type PositionReference = LayoutReference["slots"][number];
type OfficialIdentityReference = OmensRecipePoolOfficialIdentityResolution[number]["entries"][number]["officialIdentity"];
type PositionSelection = Readonly<{
  positionReference: PositionReference;
  officialIdentityReference: OfficialIdentityReference;
}>;
type ConstructionParts = Readonly<{
  layoutReference: LayoutReference;
  currentPlan: OmensPackCollationPlan;
  positionSelections: ReadonlyArray<PositionSelection>;
  totalConsumedBatches: number;
  totalConsumedSamples: number;
}>;

/** Opaque immutable continuation for an explicitly incomplete pack construction. */
export type OmensPackConstructionContinuation = Readonly<Record<never, never>>;

/** Complete immutable identity-reference projection for the fourteen recipe positions. */
export type OmensConstructedPackProjection = Readonly<{
  layoutReference: LayoutReference;
  positions: ReadonlyArray<PositionSelection>;
  terminalPlan: OmensPackCollationPlan;
}>;

/** One finite outer batch list either returns an explicit continuation or exactly one complete pack. */
export type OmensPackConstructionResult = Readonly<{
  state: "needs-samples";
  consumedBatches: number;
  consumedSamples: number;
  totalConsumedBatches: number;
  totalConsumedSamples: number;
  selectedPositionCount: number;
  continuation: OmensPackConstructionContinuation;
}> | Readonly<{
  state: "complete";
  consumedBatches: number;
  consumedSamples: number;
  totalConsumedBatches: number;
  totalConsumedSamples: number;
  pack: OmensConstructedPackProjection;
}>;

const EXPECTED_POSITION_COUNT = 14;
const continuationCapabilities = new WeakMap<object, ConstructionParts>();
const fail = (): never => { throw new OmensPackConstructionError(); };
const frozen = <Value>(value: Value): Readonly<Value> => freeze(value);

const defineFrozenData = (target: object, property: PropertyKey, value: unknown): void => {
  defineOwnDataProperty(target, property, { value, writable: false, enumerable: true, configurable: false });
};

const ownFrozenDataValue = (value: object, property: string): unknown => {
  const descriptor = getOwnPropertyDescriptor(value, property);
  if (descriptor === undefined || descriptor.enumerable !== true || descriptor.configurable !== false ||
    descriptor.writable !== false) return fail();
  return descriptor.value;
};

const safeSum = (left: number, right: number): number => {
  if (!isSafeInteger(left) || left < 0 || !isSafeInteger(right) || right < 0 ||
    left > maximumSafeInteger - right) return fail();
  return left + right;
};

const immutableArrayWith = <Value>(prior: readonly Value[], value: Value): ReadonlyArray<Value> => {
  const next: Value[] = [];
  for (let index = 0; index < prior.length; index++) defineOwnDataProperty(next, index, {
    value: prior[index], writable: false, enumerable: true, configurable: false
  });
  defineOwnDataProperty(next, prior.length, { value, writable: false, enumerable: true, configurable: false });
  return frozen(next);
};

const snapshotSampleBatch = (batchInput: unknown): readonly number[] => {
  if (!isArray(batchInput)) return fail();
  const sampleCount = batchInput.length;
  if (!isSafeInteger(sampleCount) || sampleCount < 0 ||
    sampleCount >= UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END) return fail();
  const samples: number[] = [];
  for (let index = 0; index < sampleCount; index++) {
    const sample = batchInput[index];
    if (typeof sample !== "number" || !isSafeInteger(sample) || sample < 0 ||
      sample >= UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END) return fail();
    defineOwnDataProperty(samples, index, { value: sample, writable: false, enumerable: true, configurable: false });
  }
  if (samples.length !== sampleCount) return fail();
  return frozen(samples);
};

const snapshotOuterBatches = (batchInputs: unknown): ReadonlyArray<readonly number[]> => {
  if (!isArray(batchInputs)) return fail();
  const batchCount = batchInputs.length;
  if (!isSafeInteger(batchCount) || batchCount < 0 ||
    batchCount >= UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END) return fail();
  const callerBatchReferences: unknown[] = [];
  for (let index = 0; index < batchCount; index++) defineOwnDataProperty(callerBatchReferences, index, {
    value: batchInputs[index], writable: false, enumerable: true, configurable: false
  });
  if (callerBatchReferences.length !== batchCount) return fail();
  freeze(callerBatchReferences);

  const snapshotsByCallerBatch = new mapConstructor<object, readonly number[]>();
  const snapshots: (readonly number[])[] = [];
  for (let index = 0; index < batchCount; index++) {
    const callerBatch = callerBatchReferences[index];
    if (!isArray(callerBatch)) return fail();
    let snapshot = mapGet(snapshotsByCallerBatch, callerBatch);
    if (snapshot === undefined) {
      snapshot = snapshotSampleBatch(callerBatch);
      mapSet(snapshotsByCallerBatch, callerBatch, snapshot);
    }
    defineOwnDataProperty(snapshots, index, { value: snapshot, writable: false, enumerable: true, configurable: false });
  }
  if (snapshots.length !== batchCount) return fail();
  return frozen(snapshots);
};

const validatePlanParts = (parts: ConstructionParts, requireEmpty: boolean): ConstructionParts => {
  const cursor = readOmensPackCollationPlanNextPositionForTransition(parts.currentPlan);
  const layoutReference = readOmensPackCollationPlanLayoutForTransition(parts.currentPlan);
  readOmensPackCollationPlanPoolDrawStateForTransition(parts.currentPlan);
  if (layoutReference !== parts.layoutReference || !isFrozen(layoutReference) ||
    !isFrozen(layoutReference.slots) || layoutReference.slots.length !== EXPECTED_POSITION_COUNT ||
    !isFrozen(parts.positionSelections) || cursor !== parts.positionSelections.length ||
    cursor < 0 || cursor >= EXPECTED_POSITION_COUNT ||
    (requireEmpty && cursor !== 0) || !isSafeInteger(parts.totalConsumedBatches) ||
    parts.totalConsumedBatches < 0 || !isSafeInteger(parts.totalConsumedSamples) ||
    parts.totalConsumedSamples < 0) return fail();
  for (let index = 0; index < parts.positionSelections.length; index++) {
    const selection = parts.positionSelections[index];
    if (!isFrozen(selection) || selection.positionReference !== layoutReference.slots[index] ||
      !isFrozen(selection.officialIdentityReference) || !arraySome(
        selection.positionReference.resolvedPool.entries,
        (entry) => entry.officialIdentity === selection.officialIdentityReference
      )) return fail();
  }
  return parts;
};

const initialParts = (plan: OmensPackCollationPlan): ConstructionParts => validatePlanParts(frozen({
  layoutReference: readOmensPackCollationPlanLayoutForTransition(plan),
  currentPlan: plan,
  positionSelections: frozen([] as PositionSelection[]),
  totalConsumedBatches: 0,
  totalConsumedSamples: 0
}), true);

const continuationParts = (continuation: OmensPackConstructionContinuation): ConstructionParts => {
  if (typeof continuation !== "object" || continuation === null || !isFrozen(continuation) ||
    ownKeys(continuation).length !== 0) return fail();
  const parts = weakMapGet(continuationCapabilities, continuation);
  return parts === undefined ? fail() : validatePlanParts(parts, false);
};

const validateTransition = (
  value: unknown,
  expectedPosition: PositionReference,
  sampleCount: number
): OmensFiniteBatchCollationPlanPositionTransition => {
  if (typeof value !== "object" || value === null || !isFrozen(value)) return fail();
  const state = ownFrozenDataValue(value, "state");
  if (state !== "needs-sample" && state !== "selected") return fail();
  if (ownKeys(value).length !== (state === "selected" ? 5 : 2)) return fail();
  const consumedSamples = ownFrozenDataValue(value, "consumedSamples");
  if (typeof consumedSamples !== "number" || !isSafeInteger(consumedSamples) ||
    consumedSamples < 0 || consumedSamples > sampleCount) return fail();
  if (state === "needs-sample") {
    if (consumedSamples !== sampleCount) return fail();
    return value as OmensFiniteBatchCollationPlanPositionTransition;
  }
  if (consumedSamples < 1 || ownFrozenDataValue(value, "positionReference") !== expectedPosition) return fail();
  const officialIdentityReference = ownFrozenDataValue(value, "officialIdentityReference");
  const nextPlan = ownFrozenDataValue(value, "nextPlan");
  if (typeof officialIdentityReference !== "object" || officialIdentityReference === null ||
    !isFrozen(officialIdentityReference) || typeof nextPlan !== "object" || nextPlan === null ||
    !isFrozen(nextPlan)) return fail();
  return value as OmensFiniteBatchCollationPlanPositionTransition;
};

const mintContinuation = (parts: ConstructionParts): OmensPackConstructionContinuation => {
  const continuation: OmensPackConstructionContinuation = frozen({});
  weakMapSet(continuationCapabilities, continuation, parts);
  return continuation;
};

const needsSamples = (
  parts: ConstructionParts,
  consumedBatches: number,
  consumedSamples: number
): OmensPackConstructionResult => {
  const continuation = mintContinuation(parts);
  const result = {} as {
    state: "needs-samples";
    consumedBatches: number;
    consumedSamples: number;
    totalConsumedBatches: number;
    totalConsumedSamples: number;
    selectedPositionCount: number;
    continuation: OmensPackConstructionContinuation;
  };
  defineFrozenData(result, "state", "needs-samples");
  defineFrozenData(result, "consumedBatches", consumedBatches);
  defineFrozenData(result, "consumedSamples", consumedSamples);
  defineFrozenData(result, "totalConsumedBatches", parts.totalConsumedBatches);
  defineFrozenData(result, "totalConsumedSamples", parts.totalConsumedSamples);
  defineFrozenData(result, "selectedPositionCount", parts.positionSelections.length);
  defineFrozenData(result, "continuation", continuation);
  return frozen(result);
};

const completed = (
  parts: ConstructionParts,
  consumedBatches: number,
  consumedSamples: number
): OmensPackConstructionResult => {
  if (parts.positionSelections.length !== EXPECTED_POSITION_COUNT ||
    readOmensPackCollationPlanNextPositionForTransition(parts.currentPlan) !== EXPECTED_POSITION_COUNT ||
    readOmensPackCollationPlanLayoutForTransition(parts.currentPlan) !== parts.layoutReference) return fail();
  const pack = {} as {
    layoutReference: LayoutReference;
    positions: ReadonlyArray<PositionSelection>;
    terminalPlan: OmensPackCollationPlan;
  };
  defineFrozenData(pack, "layoutReference", parts.layoutReference);
  defineFrozenData(pack, "positions", parts.positionSelections);
  defineFrozenData(pack, "terminalPlan", parts.currentPlan);
  freeze(pack);

  const result = {} as {
    state: "complete";
    consumedBatches: number;
    consumedSamples: number;
    totalConsumedBatches: number;
    totalConsumedSamples: number;
    pack: OmensConstructedPackProjection;
  };
  defineFrozenData(result, "state", "complete");
  defineFrozenData(result, "consumedBatches", consumedBatches);
  defineFrozenData(result, "consumedSamples", consumedSamples);
  defineFrozenData(result, "totalConsumedBatches", parts.totalConsumedBatches);
  defineFrozenData(result, "totalConsumedSamples", parts.totalConsumedSamples);
  defineFrozenData(result, "pack", pack);
  return frozen(result);
};

const compose = (
  initial: ConstructionParts,
  batches: ReadonlyArray<readonly number[]>
): OmensPackConstructionResult => {
  let parts = initial, consumedBatches = 0, consumedSamples = 0;
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const expectedPosition = parts.layoutReference.slots[parts.positionSelections.length];
    if (expectedPosition === undefined) return fail();
    const transition = validateTransition(
      transitionOmensPackCollationPlanCurrentPositionFromUnsigned32SampleBatch(parts.currentPlan, batch),
      expectedPosition,
      batch.length
    );
    consumedBatches = safeSum(consumedBatches, 1);
    consumedSamples = safeSum(consumedSamples, transition.consumedSamples);
    const totalConsumedBatches = safeSum(parts.totalConsumedBatches, 1);
    const totalConsumedSamples = safeSum(parts.totalConsumedSamples, transition.consumedSamples);
    if (transition.state === "needs-sample") {
      parts = frozen({ ...parts, totalConsumedBatches, totalConsumedSamples });
      continue;
    }
    const selection = {} as { positionReference: PositionReference; officialIdentityReference: OfficialIdentityReference };
    defineFrozenData(selection, "positionReference", transition.positionReference);
    defineFrozenData(selection, "officialIdentityReference", transition.officialIdentityReference);
    freeze(selection);
    const positionSelections = immutableArrayWith(parts.positionSelections, selection);
    if (readOmensPackCollationPlanLayoutForTransition(transition.nextPlan) !== parts.layoutReference ||
      readOmensPackCollationPlanNextPositionForTransition(transition.nextPlan) !== positionSelections.length ||
      !arraySome(expectedPosition.resolvedPool.entries, (entry) => entry.officialIdentity === transition.officialIdentityReference)) return fail();
    readOmensPackCollationPlanPoolDrawStateForTransition(transition.nextPlan);
    parts = frozen({
      layoutReference: parts.layoutReference,
      currentPlan: transition.nextPlan,
      positionSelections,
      totalConsumedBatches,
      totalConsumedSamples
    });
    if (positionSelections.length === EXPECTED_POSITION_COUNT) return completed(parts, consumedBatches, consumedSamples);
  }
  return needsSamples(parts, consumedBatches, consumedSamples);
};

/**
 * Sequences only a cursor-zero initialized opaque plan through a finite caller-owned list of
 * uint32 batches. It returns an explicit continuation until all fourteen positions are selected.
 */
export const constructOmensPackFromInitializedPlanAndUnsigned32SampleBatches = (
  ...inputs: [OmensPackCollationPlan, readonly (readonly number[])[]]
): OmensPackConstructionResult => {
  try {
    if (inputs.length !== 2) return fail();
    const batches = snapshotOuterBatches(inputs[1]);
    return compose(initialParts(inputs[0]), batches);
  } catch { return fail(); }
};

/** Continues one exact immutable incomplete construction using only another finite caller batch list. */
export const continueOmensPackConstructionFromUnsigned32SampleBatches = (
  ...inputs: [OmensPackConstructionContinuation, readonly (readonly number[])[]]
): OmensPackConstructionResult => {
  try {
    if (inputs.length !== 2) return fail();
    const batches = snapshotOuterBatches(inputs[1]);
    return compose(continuationParts(inputs[0]), batches);
  } catch { return fail(); }
};
