import assert from "node:assert/strict";
import test from "node:test";

import { OMENS_SET_SNAPSHOT } from "../src/set-snapshot.generated.ts";
import {
  OMENS_SNAPSHOT_IMAGE_ORIGIN,
  OMENS_SNAPSHOT_PACK_SIZE,
  OMENS_SNAPSHOT_SLOT_ROLES,
  OmensSetSnapshotError,
  totalOmensLayoutWeight,
  totalOmensPoolWeight,
  validateOmensSetSnapshot
} from "../src/set-snapshot.ts";

/** The aggregates the captain accepted from the real four-source evidence. */
const ACCEPTED = Object.freeze({
  identities: 209,
  pools: 11,
  normalPools: 8,
  rainbowFoilPools: 3,
  rainbowFoilIdentities: 171,
  layouts: 228,
  layoutTotalWeight: 460_800
});

const image = (id) => `${OMENS_SNAPSHOT_IMAGE_ORIGIN}/media/cards/normal/${id}.webp`;

const minimal = () => ({
  schemaVersion: 2,
  set: "OMN",
  provenance: {
    recipe: { id: "recipe", sha256: "a".repeat(64), provenance: "community-not-official" },
    cardSource: { id: "card", sha256: "b".repeat(64), provenance: "public-upstream" },
    cardSchema: { id: "schema", sha256: "c".repeat(64), provenance: "public-upstream" },
    cardVault: { id: "vault", sha256: "d".repeat(64), provenance: "official-observed" }
  },
  identities: [
    { id: "OMN001", name: "Common One", pitch: 1, rarity: "common", image: image("OMN001") },
    { id: "OMN002", name: "Common Two", pitch: 0, rarity: "common", image: image("OMN002") },
    { id: "OMN003", name: "Rare One", pitch: 2, rarity: "rare", image: image("OMN003") },
    { id: "OMN004", name: "Majestic One", pitch: 3, rarity: "majestic", image: image("OMN004") }
  ],
  pools: [
    { label: "Common", rarity: "common", category: "normal", entries: [{ identity: 0, weight: 3 }, { identity: 1, weight: 1 }] },
    { label: "Rare", rarity: "rare", category: "normal", entries: [{ identity: 2, weight: 1 }] },
    { label: "Majestic", rarity: "majestic", category: "normal", entries: [{ identity: 3, weight: 1 }] },
    { label: "RFCommon", rarity: "common", category: "rainbow-foil", entries: [{ identity: 0, weight: 1 }] }
  ],
  layouts: [{ weight: 7, pools: [...Array(11).fill(0), 1, 2, 3] }]
});

const rejects = (mutate, reason) => {
  const candidate = minimal();
  mutate(candidate);
  assert.throws(() => validateOmensSetSnapshot(candidate), OmensSetSnapshotError, reason);
};

test("the committed snapshot carries the accepted four-source aggregates", () => {
  const normal = OMENS_SET_SNAPSHOT.pools.filter((pool) => pool.category === "normal");
  const rainbowFoil = OMENS_SET_SNAPSHOT.pools.filter((pool) => pool.category === "rainbow-foil");
  assert.equal(OMENS_SET_SNAPSHOT.identities.length, ACCEPTED.identities);
  assert.equal(OMENS_SET_SNAPSHOT.pools.length, ACCEPTED.pools);
  assert.equal(normal.length, ACCEPTED.normalPools);
  assert.equal(rainbowFoil.length, ACCEPTED.rainbowFoilPools);
  assert.equal(OMENS_SET_SNAPSHOT.layouts.length, ACCEPTED.layouts);
  assert.equal(totalOmensLayoutWeight(OMENS_SET_SNAPSHOT), ACCEPTED.layoutTotalWeight);
});

test("the eight normal pools are pairwise disjoint and cover every identity once", () => {
  const seen = new Set();
  for (const pool of OMENS_SET_SNAPSHOT.pools.filter((entry) => entry.category === "normal")) {
    for (const entry of pool.entries) {
      assert.equal(seen.has(entry.identity), false, `identity ${entry.identity} appears in two normal pools`);
      seen.add(entry.identity);
    }
  }
  assert.equal(seen.size, ACCEPTED.identities);
});

test("the three Rainbow Foil pools are a strict subset of the normal identities", () => {
  const normal = new Set(OMENS_SET_SNAPSHOT.pools
    .filter((pool) => pool.category === "normal")
    .flatMap((pool) => pool.entries.map((entry) => entry.identity)));
  const foil = new Set(OMENS_SET_SNAPSHOT.pools
    .filter((pool) => pool.category === "rainbow-foil")
    .flatMap((pool) => pool.entries.map((entry) => entry.identity)));
  assert.equal(foil.size, ACCEPTED.rainbowFoilIdentities);
  assert.ok(foil.size < normal.size, "the Rainbow Foil scope must stay a strict subset");
  for (const identity of foil) assert.ok(normal.has(identity), `foil identity ${identity} is in no normal pool`);
});

test("every identity agrees with the rarity of the normal pool that owns it", () => {
  for (const pool of OMENS_SET_SNAPSHOT.pools.filter((entry) => entry.category === "normal")) {
    for (const entry of pool.entries) {
      assert.equal(OMENS_SET_SNAPSHOT.identities[entry.identity].rarity, pool.rarity);
    }
  }
});

test("every layout fills the reviewed fourteen-position role sequence from a compatible pool", () => {
  assert.equal(OMENS_SNAPSHOT_PACK_SIZE, 14);
  assert.equal(OMENS_SNAPSHOT_SLOT_ROLES.filter((role) => role === "common-rarity").length, 11);
  for (const layout of OMENS_SET_SNAPSHOT.layouts) {
    assert.equal(layout.pools.length, OMENS_SNAPSHOT_PACK_SIZE);
    layout.pools.forEach((index, position) => {
      const pool = OMENS_SET_SNAPSHOT.pools[index];
      const role = OMENS_SNAPSHOT_SLOT_ROLES[position];
      assert.equal(pool.category === "rainbow-foil", role === "rainbow-foil");
      if (role === "common-rarity") assert.equal(pool.rarity, "common");
      if (role === "fixed-rare") assert.equal(pool.rarity, "rare");
      if (role === "rare-or-majestic") assert.ok(pool.rarity === "rare" || pool.rarity === "majestic");
    });
  }
});

test("every pool holds a positive weight for each distinct identity it lists", () => {
  for (const pool of OMENS_SET_SNAPSHOT.pools) {
    assert.ok(pool.entries.length > 0, pool.label);
    assert.equal(new Set(pool.entries.map((entry) => entry.identity)).size, pool.entries.length, pool.label);
    for (const entry of pool.entries) assert.ok(Number.isSafeInteger(entry.weight) && entry.weight > 0, pool.label);
    assert.ok(totalOmensPoolWeight(pool) > 0, pool.label);
  }
});

test("the snapshot records the exact digest of every source it was generated from", () => {
  const { recipe, cardSource, cardSchema, cardVault } = OMENS_SET_SNAPSHOT.provenance;
  assert.equal(recipe.sha256, "97a964c8c5b6a962404398ca2b57c9ceeeb2dfb714512e61ff22e07ea1ec2328");
  assert.equal(cardSource.sha256, "243162c827dc9becc3dad46894b15e6ed4dfb7ceb63eee10efb3568f6730219e");
  assert.equal(cardSchema.sha256, "4fd114d85ab416854e84d298f468d1bc390075997d9d8886378b699586b886c1");
  assert.equal(cardVault.sha256, "59f26e3071ef50a0515c99ce568110934290aad698b3669b45e224e52fc1a83f");
  assert.equal(recipe.provenance, "community-not-official");
});

test("every identity carries the official card image for its own collector identifier", () => {
  assert.equal(OMENS_SNAPSHOT_IMAGE_ORIGIN, "https://legendstory-production-s3-public.s3.amazonaws.com");
  for (const identity of OMENS_SET_SNAPSHOT.identities) {
    assert.equal(identity.image, image(identity.id), identity.id);
  }
});

test("the only external origin the snapshot names is the pinned official image host", () => {
  const serialized = JSON.stringify(OMENS_SET_SNAPSHOT);
  const origins = new Set([...serialized.matchAll(/https?:\/\/[^/"]+/gu)].map((match) => match[0]));
  assert.deepEqual([...origins], [OMENS_SNAPSHOT_IMAGE_ORIGIN]);
});

test("the snapshot carries no recipe text or other upstream byte", () => {
  const serialized = JSON.stringify(OMENS_SET_SNAPSHOT);
  assert.doesNotMatch(serialized, /image_url|unique_id|tcgplayer|mana_cost|image_uris/i);
});

test("the handed-out snapshot is deeply immutable", () => {
  assert.ok(Object.isFrozen(OMENS_SET_SNAPSHOT));
  assert.ok(Object.isFrozen(OMENS_SET_SNAPSHOT.identities));
  assert.ok(Object.isFrozen(OMENS_SET_SNAPSHOT.identities[0]));
  assert.ok(Object.isFrozen(OMENS_SET_SNAPSHOT.pools[0].entries));
  assert.ok(Object.isFrozen(OMENS_SET_SNAPSHOT.layouts[0].pools));
});

test("a well-formed minimal snapshot is accepted", () => {
  const validated = validateOmensSetSnapshot(minimal());
  assert.equal(validated.identities.length, 4);
  assert.equal(totalOmensLayoutWeight(validated), 7);
});

test("the validator refuses every image that is not this identity's own official rendition", () => {
  const other = `${OMENS_SNAPSHOT_IMAGE_ORIGIN}/media/cards/normal/OMN002.webp`;
  rejects((s) => { delete s.identities[0].image; }, "missing image");
  rejects((s) => { s.identities[0].image = other; }, "another identity's art");
  rejects((s) => { s.identities[0].image = image("OMN001").replace("https:", "http:"); }, "cleartext scheme");
  rejects(
    (s) => { s.identities[0].image = image("OMN001").replace(".amazonaws.com", ".amazonaws.com.example.test"); },
    "a host that merely starts with the pinned origin"
  );
  rejects((s) => { s.identities[0].image = image("OMN001").replace("normal", "large"); }, "an unreviewed rendition");
  rejects((s) => { s.identities[0].image = `${image("OMN001")}?tracking=1`; }, "an appended query");
  rejects((s) => { s.identities[0].image = image("OMN001").replace(".webp", ".svg"); }, "a scriptable image format");
});

test("the validator refuses every way a snapshot can contradict itself", () => {
  rejects((s) => { s.schemaVersion = 3; }, "unsupported schema version");
  rejects((s) => { s.set = "IAR"; }, "unsupported set");
  rejects((s) => { s.provenance.recipe.sha256 = "not-a-digest"; }, "malformed digest");
  rejects((s) => { delete s.provenance.cardVault; }, "missing source record");
  rejects((s) => { s.identities[1].id = "OMN001"; }, "duplicate identity");
  rejects((s) => { s.identities[0].pitch = 4; }, "unsupported pitch");
  rejects((s) => { s.identities[0].rarity = "legendary"; }, "unsupported rarity");
  rejects((s) => { s.identities[0].name = "   "; }, "blank name");
  rejects((s) => { s.pools[0].entries[0].identity = 99; }, "identity index out of range");
  rejects((s) => { s.pools[0].entries[1].identity = 0; }, "repeated identity in one pool");
  rejects((s) => { s.pools[0].entries[0].weight = 0; }, "non-positive weight");
  rejects((s) => { s.pools[0].entries[0].weight = 1.5; }, "fractional weight");
  rejects((s) => { s.pools[1].label = "Common"; }, "duplicate pool label");
  rejects((s) => { s.pools[3].category = "normal"; }, "a foil position filled from a normal pool");
  rejects((s) => { s.layouts[0].pools = s.layouts[0].pools.slice(1); }, "wrong position count");
  rejects((s) => { s.layouts[0].pools[0] = 1; }, "common position filled from a rare pool");
  rejects((s) => { s.layouts[0].pools[11] = 2; }, "fixed rare position filled from a majestic pool");
  rejects((s) => { s.layouts[0].pools[13] = 0; }, "foil position filled from a normal pool");
  rejects((s) => { s.layouts[0].weight = -1; }, "negative layout weight");
  rejects((s) => { s.pools = s.pools.filter((pool) => pool.label !== "Majestic"); }, "an identity in no pool");
});

test("the validator copies rather than adopting the caller's mutable input", () => {
  const candidate = minimal();
  const validated = validateOmensSetSnapshot(candidate);
  candidate.identities[0].name = "Mutated After Validation";
  candidate.pools[0].entries.push({ identity: 3, weight: 9 });
  assert.equal(validated.identities[0].name, "Common One");
  assert.equal(validated.pools[0].entries.length, 2);
});
