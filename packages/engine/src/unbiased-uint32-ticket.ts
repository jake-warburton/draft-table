/** The exclusive end of the exact unsigned-32-bit sample domain: [0, 2^32). */
export const UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END = 4_294_967_296;

/** Stable, value-free failure for one-sample unsigned-32-bit ticket mapping. */
export class UnbiasedUint32TicketMappingError extends Error {
  readonly code = "UNBIASED_UINT_TICKET_MAPPING_FAILED";

  constructor() {
    super("Unbiased uint32 ticket mapping failed.");
    this.name = "UnbiasedUint32TicketMappingError";
    this.stack = `${this.name}: ${this.message}`;
  }
}

/** One accepted result maps a sample in [0, acceptedSampleExclusiveEnd) to a ticket in [0, ticketBound). */
export type AcceptedBoundedTicketMapping = Readonly<{
  state: "accepted";
  /** Caller-provided exact sample in [0, sampleDomainExclusiveEnd). */
  sample: number;
  /** Requested exact ticket bound; tickets are in [0, ticketBound). */
  ticketBound: number;
  /** Exclusive end of the complete sample domain, 2^32 for the public mapper. */
  sampleDomainExclusiveEnd: number;
  /** Exclusive end of the largest divisible accepted prefix: [0, acceptedSampleExclusiveEnd). */
  acceptedSampleExclusiveEnd: number;
  /** Exact remainder sample % ticketBound, only after acceptance. */
  ticket: number;
}>;

/** One retry result identifies a sample in [acceptedSampleExclusiveEnd, sampleDomainExclusiveEnd). */
export type RetryBoundedTicketMapping = Readonly<{
  state: "retry";
  sample: number;
  ticketBound: number;
  sampleDomainExclusiveEnd: number;
  acceptedSampleExclusiveEnd: number;
}>;

/** One deeply immutable result for a caller-controlled one-sample bounded-ticket attempt. */
export type BoundedTicketMapping = AcceptedBoundedTicketMapping | RetryBoundedTicketMapping;

const freeze: typeof Object.freeze = Object.freeze;
const isSafeInteger: typeof Number.isSafeInteger = Number.isSafeInteger;
const maximumSafeInteger = Number.MAX_SAFE_INTEGER;
const fail = (): never => { throw new UnbiasedUint32TicketMappingError(); };
const frozen = <Value>(value: Value): Readonly<Value> => freeze(value);

const isExactIntegerInHalfOpenRange = (value: unknown, exclusiveEnd: unknown): value is number =>
  typeof value === "number" && isSafeInteger(value) && value >= 0 &&
  typeof exclusiveEnd === "number" && isSafeInteger(exclusiveEnd) && value < exclusiveEnd;

const isExactPositiveIntegerAtMost = (value: unknown, maximum: unknown): value is number =>
  typeof value === "number" && isSafeInteger(value) && value >= 1 &&
  typeof maximum === "number" && isSafeInteger(maximum) && value <= maximum;

const mapExactIntegerSampleToBoundedTicket = (
  sample: unknown,
  ticketBound: unknown,
  sampleDomainExclusiveEnd: unknown
): BoundedTicketMapping => {
  if (!isExactPositiveIntegerAtMost(sampleDomainExclusiveEnd, maximumSafeInteger) ||
    !isExactIntegerInHalfOpenRange(sample, sampleDomainExclusiveEnd) ||
    !isExactPositiveIntegerAtMost(ticketBound, sampleDomainExclusiveEnd)) return fail();

  const acceptedSampleExclusiveEnd = sampleDomainExclusiveEnd - sampleDomainExclusiveEnd % ticketBound;
  if (!isSafeInteger(acceptedSampleExclusiveEnd) || acceptedSampleExclusiveEnd < 0 ||
    acceptedSampleExclusiveEnd > sampleDomainExclusiveEnd || acceptedSampleExclusiveEnd % ticketBound !== 0) return fail();

  if (sample < acceptedSampleExclusiveEnd) return frozen({
    state: "accepted", sample, ticketBound, sampleDomainExclusiveEnd, acceptedSampleExclusiveEnd, ticket: sample % ticketBound
  });
  return frozen({ state: "retry", sample, ticketBound, sampleDomainExclusiveEnd, acceptedSampleExclusiveEnd });
};

/**
 * Maps exactly one validated sample in the unsigned-32-bit half-open domain [0, 2^32) to an unbiased ticket.
 * It neither creates another sample nor retries; callers own both random-source and retry-loop policy.
 */
export const mapUnsigned32SampleToBoundedTicket = (
  ...inputs: [sample: number, ticketBound: number]
): BoundedTicketMapping => {
  if (inputs.length !== 2) return fail();
  try {
    return mapExactIntegerSampleToBoundedTicket(inputs[0], inputs[1], UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END);
  } catch {
    return fail();
  }
};

/** Test-only generic seam for exhaustive analogous exact-integer domains; production callers use the uint32 mapper. */
export const mapExactIntegerSampleToBoundedTicketForTest = (
  ...inputs: [sample: number, ticketBound: number, sampleDomainExclusiveEnd: number]
): BoundedTicketMapping => {
  if (inputs.length !== 3) return fail();
  try {
    return mapExactIntegerSampleToBoundedTicket(inputs[0], inputs[1], inputs[2]);
  } catch {
    return fail();
  }
};
