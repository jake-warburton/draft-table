export {
  UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END,
  UnbiasedUint32TicketMappingError,
  mapUnsigned32SampleToBoundedTicket,
  type AcceptedBoundedTicketMapping,
  type BoundedTicketMapping,
  type RetryBoundedTicketMapping
} from "./unbiased-uint32-ticket.ts";
export {
  mapUnsigned32SampleBatchToBoundedTicket,
  type Unsigned32SampleBatchTicketResult
} from "./uint32-sample-batch.ts";
