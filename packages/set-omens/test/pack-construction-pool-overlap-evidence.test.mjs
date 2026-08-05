import assert from "node:assert/strict";
import test from "node:test";
import { fictionalCollationCapabilities } from "./fictional-collation-capabilities.mjs";
import {
  OmensPackConstructionPoolOverlapEvidenceError,
  validateOmensPackConstructionPoolOverlapEvidence,
  validateOmensPackConstructionPoolOverlapFactsForTest
} from "../src/pack-construction-pool-overlap-evidence.ts";

const frozen = (value) => Object.freeze(value);
const identity = (index) => frozen({ baseCollectorId: `SYN${String(index).padStart(3, "0")}`, cardUniqueId: `synthetic-card-${index}` });
const acceptedFacts = () => {
  const normalIdentities = Array.from({ length: 209 }, (_, index) => identity(index));
  const normal = Array.from({ length: 8 }, (_, poolIndex) => frozen({
    recipePoolCategory: "normal",
    officialIdentities: frozen(normalIdentities.filter((_, index) => index % 8 === poolIndex))
  }));
  const rainbowFoil = Array.from({ length: 3 }, (_, poolIndex) => frozen({
    recipePoolCategory: "rainbow-foil",
    officialIdentities: frozen(normalIdentities.slice(0, 171).filter((_, index) => index % 3 === poolIndex))
  }));
  return frozen([...normal, ...rainbowFoil]);
};
const safe = (action) => assert.throws(action, (error) => {
  assert.ok(error instanceof OmensPackConstructionPoolOverlapEvidenceError);
  assert.equal(error.name, "OmensPackConstructionPoolOverlapEvidenceError");
  assert.equal(error.code, "OMENS_PACK_CONSTRUCTION_POOL_OVERLAP_EVIDENCE_FAILED");
  assert.equal(error.message, "Omens pack construction pool-overlap evidence failed.");
  assert.equal(error.stack, "OmensPackConstructionPoolOverlapEvidenceError: Omens pack construction pool-overlap evidence failed.");
  assert.deepEqual(JSON.parse(JSON.stringify(error)), {
    name: "OmensPackConstructionPoolOverlapEvidenceError",
    code: "OMENS_PACK_CONSTRUCTION_POOL_OVERLAP_EVIDENCE_FAILED"
  });
  assert.doesNotMatch(`${error.message}${error.stack}${JSON.stringify(error)}`, /SYN|OMN|IAR|synthetic-card|[0-9]{3}|https?:|\\|\//iu);
  return true;
});

// RED contract: exact real aggregates are guarded before private pack acceptance can run.
test("eight pairwise-disjoint normal pools and three pairwise-disjoint RF pools pin the 209 and strict-subset 171 facts", () => {
  const facts = acceptedFacts(), result = validateOmensPackConstructionPoolOverlapFactsForTest(facts);
  assert.deepEqual(result, {
    normalPoolCount: 8,
    normalUniqueIdentityCount: 209,
    rainbowFoilPoolCount: 3,
    rainbowFoilUniqueIdentityCount: 171
  });
  assert.ok(Object.isFrozen(result));
  assert.deepEqual(Object.keys(result), ["normalPoolCount", "normalUniqueIdentityCount", "rainbowFoilPoolCount", "rainbowFoilUniqueIdentityCount"]);
});

test("every normal and RF pool count union pairwise-disjoint and strict-subset drift fails safely", () => {
  const facts = acceptedFacts(), normals = facts.slice(0, 8), rainbow = facts.slice(8);
  safe(() => validateOmensPackConstructionPoolOverlapFactsForTest(facts.slice(1)));
  safe(() => validateOmensPackConstructionPoolOverlapFactsForTest(frozen([...normals, ...rainbow.slice(1)])));

  const missingNormal = frozen(normals.map((pool, index) => index === 7 ? frozen({ ...pool, officialIdentities: frozen(pool.officialIdentities.slice(1)) }) : pool));
  safe(() => validateOmensPackConstructionPoolOverlapFactsForTest(frozen([...missingNormal, ...rainbow])));
  const extraNormalIdentity = identity(209);
  const extraNormal = frozen(normals.map((pool, index) => index === 7 ? frozen({ ...pool, officialIdentities: frozen([...pool.officialIdentities, extraNormalIdentity]) }) : pool));
  safe(() => validateOmensPackConstructionPoolOverlapFactsForTest(frozen([...extraNormal, ...rainbow])));

  const normalOverlapIdentity = normals[0].officialIdentities[0];
  const overlappingNormal = frozen(normals.map((pool, index) => index === 1 ? frozen({ ...pool, officialIdentities: frozen([...pool.officialIdentities, normalOverlapIdentity]) }) : pool));
  safe(() => validateOmensPackConstructionPoolOverlapFactsForTest(frozen([...overlappingNormal, ...rainbow])));
  const rfOverlapIdentity = rainbow[0].officialIdentities[0];
  const overlappingRf = frozen(rainbow.map((pool, index) => index === 1 ? frozen({ ...pool, officialIdentities: frozen([...pool.officialIdentities, rfOverlapIdentity]) }) : pool));
  safe(() => validateOmensPackConstructionPoolOverlapFactsForTest(frozen([...normals, ...overlappingRf])));

  const outsideNormal = identity(999);
  const nonSubsetRf = frozen(rainbow.map((pool, index) => index === 0 ? frozen({ ...pool, officialIdentities: frozen([outsideNormal, ...pool.officialIdentities.slice(1)]) }) : pool));
  safe(() => validateOmensPackConstructionPoolOverlapFactsForTest(frozen([...normals, ...nonSubsetRf])));
  const equalUnion = frozen(normals.map((pool) => frozen({ recipePoolCategory: "rainbow-foil", officialIdentities: pool.officialIdentities })));
  safe(() => validateOmensPackConstructionPoolOverlapFactsForTest(frozen([...normals, ...equalUnion])));
});

test("malformed identity and category facts fail without names or identities in the stable error", () => {
  const facts = acceptedFacts();
  for (const malformed of [null, undefined, {}, [], structuredClone(facts), frozen([...facts, frozen({ recipePoolCategory: "other", officialIdentities: frozen([]) })])]) safe(() => validateOmensPackConstructionPoolOverlapFactsForTest(malformed));
  const malformedIdentity = frozen(facts.map((pool, poolIndex) => poolIndex === 0 ? frozen({ ...pool, officialIdentities: frozen([frozen({ baseCollectorId: "", cardUniqueId: "synthetic-card" }), ...pool.officialIdentities.slice(1)]) }) : pool));
  safe(() => validateOmensPackConstructionPoolOverlapFactsForTest(malformedIdentity));
  safe(() => validateOmensPackConstructionPoolOverlapFactsForTest(facts, "extra"));
});

test("the public guard accepts only an exact prior pool-resolution capability and fictional non-real counts cannot waive evidence", () => {
  const { tables } = fictionalCollationCapabilities();
  safe(() => validateOmensPackConstructionPoolOverlapEvidence(tables.poolTables.map((table) => table.poolReference)));
  safe(() => validateOmensPackConstructionPoolOverlapEvidence(structuredClone(tables.poolTables.map((table) => table.poolReference))));
  safe(() => validateOmensPackConstructionPoolOverlapEvidence());
  safe(() => validateOmensPackConstructionPoolOverlapEvidence(tables.poolTables.map((table) => table.poolReference), "extra"));
});

test("guard error constructor prototype and returned aggregate descriptors are hardened", () => {
  assert.ok(Object.isFrozen(OmensPackConstructionPoolOverlapEvidenceError));
  assert.ok(Object.isFrozen(OmensPackConstructionPoolOverlapEvidenceError.prototype));
  const result = validateOmensPackConstructionPoolOverlapFactsForTest(acceptedFacts());
  for (const key of Object.keys(result)) {
    const descriptor = Object.getOwnPropertyDescriptor(result, key);
    assert.equal(descriptor.writable, false);
    assert.equal(descriptor.enumerable, true);
    assert.equal(descriptor.configurable, false);
  }
});
