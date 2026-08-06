/**
 * The reviewed, versioned Omens set snapshot contract.
 *
 * A snapshot is the only card material the runtime ever sees. It is generated at build time from
 * the four checksum-pinned evidence sources and committed, so neither CI nor the browser needs the
 * captain-held recipe. This module owns the shape and the validator; `set-snapshot.generated.ts`
 * owns the data, and `scripts/build-set-snapshot.mjs` owns how that data is produced.
 *
 * The validator is the reviewer's tool: it re-proves every structural fact a reader would
 * otherwise have to take on trust, without needing any evidence file.
 */

const defineOwnDataProperty: typeof Object.defineProperty = Object.defineProperty;
const freeze: typeof Object.freeze = Object.freeze;
const isArray: typeof Array.isArray = Array.isArray;
const isSafeInteger: typeof Number.isSafeInteger = Number.isSafeInteger;

export type OmensSnapshotRarity = "common" | "rare" | "majestic";
export type OmensSnapshotPoolCategory = "normal" | "rainbow-foil";
export type OmensSnapshotSlotRole = "common-rarity" | "fixed-rare" | "rare-or-majestic" | "rainbow-foil";

/** The reviewed fourteen-position recipe layout shape, identical for every layout. */
export const OMENS_SNAPSHOT_SLOT_ROLES: readonly OmensSnapshotSlotRole[] = freeze([
  "common-rarity", "common-rarity", "common-rarity", "common-rarity", "common-rarity", "common-rarity",
  "common-rarity", "common-rarity", "common-rarity", "common-rarity", "common-rarity",
  "fixed-rare", "rare-or-majestic", "rainbow-foil"
] as const) as readonly OmensSnapshotSlotRole[];

export const OMENS_SNAPSHOT_PACK_SIZE = OMENS_SNAPSHOT_SLOT_ROLES.length;

/**
 * The single origin any snapshot image may be served from, so a viewer's browser can only ever be
 * sent to Legend Story Studios' own public host. Consumers reuse this to pin their own `img-src`.
 */
export const OMENS_SNAPSHOT_IMAGE_ORIGIN = "https://legendstory-production-s3-public.s3.amazonaws.com";

/** The exact reviewed rendition path. `normal` is the rendition the accepted evidence projects. */
const IMAGE_PREFIX = `${OMENS_SNAPSHOT_IMAGE_ORIGIN}/media/cards/normal/`;
const IMAGE_SUFFIX = ".webp";

export interface OmensSnapshotIdentity {
  /** Official base collector identifier, for example `OMN004`. */
  readonly id: string;
  /** Official bare card name from the pinned public card source. */
  readonly name: string;
  /** 0 marks a card with no pitch value; 1, 2, and 3 are red, yellow, and blue. */
  readonly pitch: 0 | 1 | 2 | 3;
  readonly rarity: OmensSnapshotRarity;
  /**
   * The exact official card image copied from the Card Vault face this identity resolves to. It is
   * a remote URL: no image byte is ever copied into this repository, and nothing fetches it here.
   */
  readonly image: string;
}

export interface OmensSnapshotPoolEntry {
  /** Index into `identities`. */
  readonly identity: number;
  readonly weight: number;
}

export interface OmensSnapshotPool {
  readonly label: string;
  readonly rarity: OmensSnapshotRarity;
  readonly category: OmensSnapshotPoolCategory;
  readonly entries: readonly OmensSnapshotPoolEntry[];
}

/**
 * One weighted layout. Every layout carries the same role sequence, so the role belongs to the
 * position rather than the layout and lives in `OMENS_SNAPSHOT_SLOT_ROLES`. A layout therefore
 * stores only which pool fills each position, and cannot disagree with itself about roles.
 */
export interface OmensSnapshotLayout {
  readonly weight: number;
  /** Exactly fourteen indices into `pools`, one per position. */
  readonly pools: readonly number[];
}

export interface OmensSnapshotSourceRecord {
  readonly id: string;
  readonly sha256: string;
  readonly provenance: string;
}

export interface OmensSnapshotProvenance {
  readonly recipe: OmensSnapshotSourceRecord;
  readonly cardSource: OmensSnapshotSourceRecord;
  readonly cardSchema: OmensSnapshotSourceRecord;
  readonly cardVault: OmensSnapshotSourceRecord;
}

export interface OmensSetSnapshot {
  readonly schemaVersion: 2;
  readonly set: "OMN";
  readonly provenance: OmensSnapshotProvenance;
  readonly identities: readonly OmensSnapshotIdentity[];
  readonly pools: readonly OmensSnapshotPool[];
  readonly layouts: readonly OmensSnapshotLayout[];
}

/** Stable, structural failure for an invalid set snapshot. */
export class OmensSetSnapshotError extends Error {
  declare readonly code: "OMENS_SET_SNAPSHOT_INVALID";
  declare readonly reason: string;

  constructor(reason: string) {
    super(`Omens set snapshot is invalid: ${reason}`);
    defineOwnDataProperty(this, "name", { value: "OmensSetSnapshotError", writable: true, enumerable: true, configurable: true });
    defineOwnDataProperty(this, "code", { value: "OMENS_SET_SNAPSHOT_INVALID", writable: true, enumerable: true, configurable: true });
    defineOwnDataProperty(this, "reason", { value: reason, writable: true, enumerable: true, configurable: true });
  }
}

freeze(OmensSetSnapshotError.prototype);
freeze(OmensSetSnapshotError);

const fail = (reason: string): never => { throw new OmensSetSnapshotError(reason); };
const RARITIES = freeze(["common", "rare", "majestic"]) as readonly string[];
const CATEGORIES = freeze(["normal", "rainbow-foil"]) as readonly string[];

const record = (value: unknown, reason: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || isArray(value)) fail(reason);
  return value as Record<string, unknown>;
};

const nonEmptyText = (value: unknown, reason: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) fail(reason);
  return value as string;
};

const positiveInteger = (value: unknown, reason: string): number => {
  if (typeof value !== "number" || !isSafeInteger(value) || value < 1) fail(reason);
  return value as number;
};

const arrayOf = (value: unknown, reason: string): readonly unknown[] => {
  if (!isArray(value) || value.length === 0) fail(reason);
  return value as readonly unknown[];
};

const sourceRecord = (value: unknown, reason: string): OmensSnapshotSourceRecord => {
  const source = record(value, reason);
  const sha256 = nonEmptyText(source.sha256, `${reason} sha256`);
  if (!/^[0-9a-f]{64}$/u.test(sha256)) fail(`${reason} sha256 is not a lowercase hex digest`);
  return freeze({
    id: nonEmptyText(source.id, `${reason} id`),
    sha256,
    provenance: nonEmptyText(source.provenance, `${reason} provenance`)
  });
};

const identity = (value: unknown, index: number, seen: Set<string>): OmensSnapshotIdentity => {
  const candidate = record(value, `identity ${index}`);
  const id = nonEmptyText(candidate.id, `identity ${index} id`);
  if (seen.has(id)) fail(`identity ${id} appears more than once`);
  seen.add(id);
  const pitch = candidate.pitch;
  if (pitch !== 0 && pitch !== 1 && pitch !== 2 && pitch !== 3) fail(`identity ${id} has an unsupported pitch`);
  const rarity = nonEmptyText(candidate.rarity, `identity ${id} rarity`);
  if (!RARITIES.includes(rarity)) fail(`identity ${id} has an unsupported rarity`);
  const image = nonEmptyText(candidate.image, `identity ${id} image`);
  if (image !== `${IMAGE_PREFIX}${id}${IMAGE_SUFFIX}`) {
    fail(`identity ${id} does not carry its own official card image on the pinned origin`);
  }
  return freeze({
    id,
    name: nonEmptyText(candidate.name, `identity ${id} name`),
    pitch: pitch as 0 | 1 | 2 | 3,
    rarity: rarity as OmensSnapshotRarity,
    image
  });
};

const pool = (value: unknown, index: number, identityCount: number, labels: Set<string>): OmensSnapshotPool => {
  const candidate = record(value, `pool ${index}`);
  const label = nonEmptyText(candidate.label, `pool ${index} label`);
  if (labels.has(label)) fail(`pool ${label} appears more than once`);
  labels.add(label);
  const rarity = nonEmptyText(candidate.rarity, `pool ${label} rarity`);
  if (!RARITIES.includes(rarity)) fail(`pool ${label} has an unsupported rarity`);
  const category = nonEmptyText(candidate.category, `pool ${label} category`);
  if (!CATEGORIES.includes(category)) fail(`pool ${label} has an unsupported category`);

  const referenced = new Set<number>();
  const entries = arrayOf(candidate.entries, `pool ${label} entries`).map((entryValue, entryIndex) => {
    const entry = record(entryValue, `pool ${label} entry ${entryIndex}`);
    const target = entry.identity;
    if (typeof target !== "number" || !isSafeInteger(target) || target < 0 || target >= identityCount) {
      fail(`pool ${label} entry ${entryIndex} references no identity`);
    }
    if (referenced.has(target as number)) fail(`pool ${label} repeats one identity`);
    referenced.add(target as number);
    return freeze({ identity: target as number, weight: positiveInteger(entry.weight, `pool ${label} entry ${entryIndex} weight`) });
  });

  return freeze({ label, rarity: rarity as OmensSnapshotRarity, category: category as OmensSnapshotPoolCategory, entries: freeze(entries) });
};

const slotAgreesWithPool = (role: OmensSnapshotSlotRole, target: OmensSnapshotPool): boolean => {
  if ((role === "rainbow-foil") !== (target.category === "rainbow-foil")) return false;
  if (role === "common-rarity") return target.rarity === "common";
  if (role === "fixed-rare") return target.rarity === "rare";
  return true;
};

const layout = (value: unknown, index: number, pools: readonly OmensSnapshotPool[]): OmensSnapshotLayout => {
  const candidate = record(value, `layout ${index}`);
  const positions = arrayOf(candidate.pools, `layout ${index} pools`);
  if (positions.length !== OMENS_SNAPSHOT_PACK_SIZE) fail(`layout ${index} does not have ${OMENS_SNAPSHOT_PACK_SIZE} positions`);

  const resolved = positions.map((target, position) => {
    if (typeof target !== "number" || !isSafeInteger(target) || target < 0 || target >= pools.length) {
      fail(`layout ${index} position ${position} references no pool`);
    }
    const role = OMENS_SNAPSHOT_SLOT_ROLES[position];
    if (!slotAgreesWithPool(role, pools[target as number])) {
      fail(`layout ${index} position ${position} draws a ${role} position from an incompatible pool`);
    }
    return target as number;
  });

  return freeze({ weight: positiveInteger(candidate.weight, `layout ${index} weight`), pools: freeze(resolved) });
};

/**
 * Validates one candidate snapshot completely and returns a deeply frozen copy. Every reference is
 * checked against the material it points at, so a reviewer never has to assume the indices line up.
 */
export const validateOmensSetSnapshot = (candidate: unknown): OmensSetSnapshot => {
  const source = record(candidate, "snapshot");
  if (source.schemaVersion !== 2) fail("only schema version 2 is supported");
  if (source.set !== "OMN") fail("only the Omens set is supported");

  const provenanceSource = record(source.provenance, "provenance");
  const provenance = freeze({
    recipe: sourceRecord(provenanceSource.recipe, "recipe provenance"),
    cardSource: sourceRecord(provenanceSource.cardSource, "card source provenance"),
    cardSchema: sourceRecord(provenanceSource.cardSchema, "card schema provenance"),
    cardVault: sourceRecord(provenanceSource.cardVault, "card vault provenance")
  });

  const seenIdentities = new Set<string>();
  const identities = freeze(arrayOf(source.identities, "identities")
    .map((value, index) => identity(value, index, seenIdentities)));

  const labels = new Set<string>();
  const pools = freeze(arrayOf(source.pools, "pools")
    .map((value, index) => pool(value, index, identities.length, labels)));

  const layouts = freeze(arrayOf(source.layouts, "layouts").map((value, index) => layout(value, index, pools)));

  let totalLayoutWeight = 0;
  for (const entry of layouts) totalLayoutWeight += entry.weight;
  if (!isSafeInteger(totalLayoutWeight) || totalLayoutWeight < 1) fail("layout weights do not sum to a usable total");

  const covered = new Set<number>();
  for (const entry of pools) for (const poolEntry of entry.entries) covered.add(poolEntry.identity);
  if (covered.size !== identities.length) fail("some identity belongs to no pool");

  return freeze({ schemaVersion: 2, set: "OMN", provenance, identities, pools, layouts });
};

/** The exact total layout weight, recomputed rather than trusted from the snapshot. */
export const totalOmensLayoutWeight = (snapshot: OmensSetSnapshot): number => {
  let total = 0;
  for (const entry of snapshot.layouts) total += entry.weight;
  return total;
};

/** The exact total weight of one pool, recomputed rather than trusted from the snapshot. */
export const totalOmensPoolWeight = (target: OmensSnapshotPool): number => {
  let total = 0;
  for (const entry of target.entries) total += entry.weight;
  return total;
};
