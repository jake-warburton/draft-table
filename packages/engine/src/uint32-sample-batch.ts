import {
  UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END,
  UnbiasedUint32TicketMappingError,
  mapUnsigned32SampleToBoundedTicket
} from "./unbiased-uint32-ticket.ts";

/** A finite caller-supplied batch either yields its first accepted ticket or explicit exhaustion. */
export type Unsigned32SampleBatchTicketResult = Readonly<
  | { state: "accepted"; ticket: number; consumedSamples: number }
  | { state: "needs-sample"; consumedSamples: number }
>;

const defineOwnDataProperty: typeof Object.defineProperty = Object.defineProperty;
const freeze: typeof Object.freeze = Object.freeze;
const isArray: typeof Array.isArray = Array.isArray;
const isFiniteNumber: typeof Number.isFinite = Number.isFinite;
const isSafeInteger: typeof Number.isSafeInteger = Number.isSafeInteger;
const fail = (): never => { throw new UnbiasedUint32TicketMappingError(); };
const frozen = <Value>(value: Value): Readonly<Value> => freeze(value);
const isUint32Sample = (value: unknown): value is number =>
  typeof value === "number" && isFiniteNumber(value) && isSafeInteger(value) && value >= 0 &&
  value < UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END;
const isAcceptedTicketBound = (value: unknown): value is number =>
  typeof value === "number" && isFiniteNumber(value) && isSafeInteger(value) && value >= 1 &&
  value <= UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END;

/**
 * Consumes one finite batch of caller-owned uint32 samples in source order.
 * It owns no entropy source and makes no attempt beyond the supplied batch.
 */
export const mapUnsigned32SampleBatchToBoundedTicket = (
  ...inputs: [samples: readonly number[], ticketBound: number]
): Unsigned32SampleBatchTicketResult => {
  try {
    if (inputs.length !== 2 || !isArray(inputs[0]) || !isAcceptedTicketBound(inputs[1])) return fail();
    const suppliedSamples = inputs[0] as readonly unknown[];
    const sampleCount = suppliedSamples.length;
    if (!isSafeInteger(sampleCount) || sampleCount < 0 || sampleCount >= UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END) return fail();

    const sampleSnapshot: unknown[] = [];
    for (let index = 0; index < sampleCount; index++) {
      defineOwnDataProperty(sampleSnapshot, index, {
        value: suppliedSamples[index], writable: false, enumerable: true, configurable: false
      });
    }
    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++) {
      if (!isUint32Sample(sampleSnapshot[sampleIndex])) return fail();
    }
    const samples = sampleSnapshot as number[];

    for (let index = 0; index < sampleCount; index++) {
      const mapping: unknown = mapUnsigned32SampleToBoundedTicket(samples[index], inputs[1]);
      if (typeof mapping !== "object" || mapping === null) return fail();
      const state: unknown = (mapping as { readonly state?: unknown }).state;
      if (state === "accepted") {
        const ticket: unknown = (mapping as { readonly ticket?: unknown }).ticket;
        if (typeof ticket !== "number" || !isFiniteNumber(ticket) || !isSafeInteger(ticket) ||
          ticket < 0 || ticket >= inputs[1]) return fail();
        return frozen({ state: "accepted", ticket, consumedSamples: index + 1 });
      }
      if (state === "retry") continue;
      return fail();
    }
    return frozen({ state: "needs-sample", consumedSamples: sampleCount });
  } catch {
    return fail();
  }
};
