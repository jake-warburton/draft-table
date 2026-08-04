import type { OfficialUpstreamPrinting } from "./official-upstream-id-reconciliation.ts";

/** Package-internal defensive owner for retained opaque source metadata. */
export const copyOfficialUpstreamPrinting = (printing: OfficialUpstreamPrinting): OfficialUpstreamPrinting =>
  Object.freeze({ ...printing, art_variations: Object.freeze([...printing.art_variations]) });
