import { mapUnsigned32SampleBatchToBoundedTicket } from "./uint32-sample-batch.ts";

/** Stable replay format and algorithm identifier for this exact PCG XSH RR 64/32 contract. */
export const DETERMINISTIC_UINT32_SOURCE_ALGORITHM_VERSION = "pcg-xsh-rr-64-32-v1";

const defineOwnProperty: typeof Object.defineProperty = Object.defineProperty;
const freeze: typeof Object.freeze = Object.freeze;
const isSafeInteger: typeof Number.isSafeInteger = Number.isSafeInteger;
const toBigInt: typeof BigInt = BigInt;
const toNumber: typeof Number = Number;
const apply: typeof Reflect.apply = Reflect.apply;
const regularExpressionExec: typeof RegExp.prototype.exec = RegExp.prototype.exec;
const bigIntToString: typeof BigInt.prototype.toString = BigInt.prototype.toString;
const numberToString: typeof Number.prototype.toString = Number.prototype.toString;
const stringPadStart: typeof String.prototype.padStart = String.prototype.padStart;

/** Stable, value-free failure for deterministic source initialization, restoration, or drawing. */
export class DeterministicUint32SourceError extends Error {
  declare readonly code: "DETERMINISTIC_UINT32_SOURCE_FAILED";

  constructor() {
    super("Deterministic uint32 source operation failed.");
    defineOwnProperty(this, "code", {
      value: "DETERMINISTIC_UINT32_SOURCE_FAILED", writable: true, enumerable: true, configurable: true
    });
    defineOwnProperty(this, "name", {
      value: "DeterministicUint32SourceError", writable: true, enumerable: true, configurable: true
    });
    defineOwnProperty(this, "stack", {
      value: `${this.name}: ${this.message}`, writable: true, enumerable: false, configurable: true
    });
  }
}

freeze(DeterministicUint32SourceError.prototype);
freeze(DeterministicUint32SourceError);

/** Canonical, JSON-safe replay state: algorithm version, 64-bit state word, and uint32 domain. */
export type DeterministicUint32SourceState = string;

/** One immutable sample and the explicit source state after exactly one transition. */
export type DeterministicUint32SampleTransition = Readonly<{
  sample: number;
  sourceState: DeterministicUint32SourceState;
}>;

/** One accepted unbiased ticket plus every consumed source sample and the exact following state. */
export type DeterministicBoundedTicket = Readonly<{
  state: "accepted";
  ticketBound: number;
  samples: readonly number[];
  consumedSamples: number;
  retryCount: number;
  ticket: number;
  sourceState: DeterministicUint32SourceState;
}>;

const UINT32_MAXIMUM = 4_294_967_295;
const UINT32_DOMAIN_EXCLUSIVE_END = 4_294_967_296;
const UINT64_MASK = 0xffff_ffff_ffff_ffffn;
const UINT32_MASK = 0xffff_ffffn;
const PCG_MULTIPLIER = 6_364_136_223_846_793_005n;
const serializedStatePattern = /^pcg-xsh-rr-64-32-v1:([0-9a-f]{16}):([0-9a-f]{8})$/u;

const fail = (): never => { throw new DeterministicUint32SourceError(); };
const frozen = <Value>(value: Value): Readonly<Value> => freeze(value);
const isUint32 = (value: unknown): value is number =>
  typeof value === "number" && isSafeInteger(value) && value >= 0 && value <= UINT32_MAXIMUM;
const isTicketBound = (value: unknown): value is number =>
  typeof value === "number" && isSafeInteger(value) && value >= 1 && value <= UINT32_DOMAIN_EXCLUSIVE_END;

const toPaddedHex = (value: bigint | number, width: number): string => {
  const hexadecimal = typeof value === "bigint"
    ? apply(bigIntToString, value, [16]) as string
    : apply(numberToString, value, [16]) as string;
  return apply(stringPadStart, hexadecimal, [width, "0"]) as string;
};

const serializeState = (stateWord: bigint, domain: number): DeterministicUint32SourceState =>
  `${DETERMINISTIC_UINT32_SOURCE_ALGORITHM_VERSION}:${toPaddedHex(stateWord, 16)}:${toPaddedHex(domain, 8)}`;

type ParsedState = Readonly<{ stateWord: bigint; domain: number }>;
const parseState = (value: unknown): ParsedState => {
  if (typeof value !== "string") return fail();
  const match = apply(regularExpressionExec, serializedStatePattern, [value]) as RegExpExecArray | null;
  if (match === null) return fail();
  const stateWord = toBigInt(`0x${match[1]}`);
  const domain = toNumber(`0x${match[2]}`);
  if (stateWord < 0n || stateWord > UINT64_MASK || !isUint32(domain) || serializeState(stateWord, domain) !== value) {
    return fail();
  }
  return { stateWord, domain };
};

const incrementForDomain = (domain: number): bigint => (toBigInt(domain) << 1n) | 1n;
const advanceStateWord = (stateWord: bigint, increment: bigint): bigint =>
  (stateWord * PCG_MULTIPLIER + increment) & UINT64_MASK;

const sampleFromStateWord = (stateWord: bigint): number => {
  const xorshifted = toNumber((((stateWord >> 18n) ^ stateWord) >> 27n) & UINT32_MASK);
  const rotation = toNumber(stateWord >> 59n);
  return ((xorshifted >>> rotation) | (xorshifted << ((-rotation) & 31))) >>> 0;
};

/**
 * Canonically seeds PCG XSH RR 64/32 from exact uint32 seed and domain values.
 * The domain selects an independent odd PCG stream increment; zero is valid for both inputs.
 */
export const initializeDeterministicUint32Source = (
  ...inputs: [seed: number, domain: number]
): DeterministicUint32SourceState => {
  try {
    if (inputs.length !== 2 || !isUint32(inputs[0]) || !isUint32(inputs[1])) return fail();
    const increment = incrementForDomain(inputs[1]);
    let stateWord = advanceStateWord(0n, increment);
    stateWord = (stateWord + toBigInt(inputs[0])) & UINT64_MASK;
    stateWord = advanceStateWord(stateWord, increment);
    return serializeState(stateWord, inputs[1]);
  } catch {
    return fail();
  }
};

/** Generates exactly one uint32 sample and returns, rather than mutating, the following source state. */
export const generateDeterministicUint32Sample = (
  ...inputs: [sourceState: DeterministicUint32SourceState]
): DeterministicUint32SampleTransition => {
  try {
    if (inputs.length !== 1) return fail();
    const parsed = parseState(inputs[0]);
    const sample = sampleFromStateWord(parsed.stateWord);
    const nextStateWord = advanceStateWord(parsed.stateWord, incrementForDomain(parsed.domain));
    return frozen({ sample, sourceState: serializeState(nextStateWord, parsed.domain) });
  } catch {
    return fail();
  }
};

/**
 * Generates one sample at a time until the public finite-batch mapper accepts its unbiased ticket.
 * This loop has no retry cap and returns immediately on the mapper's first acceptance.
 */
export const drawDeterministicBoundedTicket = (
  ...inputs: [sourceState: DeterministicUint32SourceState, ticketBound: number]
): DeterministicBoundedTicket => {
  try {
    if (inputs.length !== 2 || !isTicketBound(inputs[1])) return fail();
    parseState(inputs[0]);
    let sourceState = inputs[0];
    const ticketBound = inputs[1];
    const samples: number[] = [];
    let consumedSamples = 0;

    for (;;) {
      const transition = generateDeterministicUint32Sample(sourceState);
      const sample = transition.sample;
      defineOwnProperty(samples, consumedSamples, {
        value: sample, writable: false, enumerable: true, configurable: false
      });
      consumedSamples++;
      sourceState = transition.sourceState;

      const mapping = mapUnsigned32SampleBatchToBoundedTicket([sample], ticketBound);
      if (mapping.state === "accepted") {
        if (mapping.consumedSamples !== 1) return fail();
        freeze(samples);
        return frozen({
          state: "accepted",
          ticketBound,
          samples,
          consumedSamples,
          retryCount: consumedSamples - 1,
          ticket: mapping.ticket,
          sourceState
        });
      }
      if (mapping.state !== "needs-sample" || mapping.consumedSamples !== 1) return fail();
    }
  } catch {
    return fail();
  }
};
