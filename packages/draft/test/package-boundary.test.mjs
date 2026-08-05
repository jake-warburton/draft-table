import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const packageRoot = new URL("../", import.meta.url);

test("draft package is dependency-free and exports only its local runtime", async () => {
  const manifest = JSON.parse(await readFile(new URL("package.json", packageRoot), "utf8"));
  assert.equal(manifest.name, "@draft-table/draft");
  assert.equal(manifest.exports["."], "./src/index.ts");
  assert.equal(manifest.dependencies, undefined);
  assert.equal(manifest.devDependencies, undefined);

  const sourceNames = await readdir(new URL("src/", packageRoot));
  assert.deepEqual(sourceNames, ["index.ts"]);
  const source = await readFile(new URL("src/index.ts", packageRoot), "utf8");
  assert.doesNotMatch(source, /(?:from\s+|import\s*\()["']@draft-table\//);
  assert.doesNotMatch(source, /(?:from\s+|import\s*\()["'](?:node:|[^./])/);
});

test("all product drafting seat counts are accepted", async () => {
  const { createDraft, MIN_DRAFT_SEATS, MAX_DRAFT_SEATS } = await import("../src/index.ts");
  for (let seatCount = MIN_DRAFT_SEATS; seatCount <= MAX_DRAFT_SEATS; seatCount += 1) {
    const seats = Array.from({ length: seatCount }, (_, index) => ({
      id: `seat-${index}`,
      controller: "human",
    }));
    const packsByRound = Array.from({ length: 3 }, (_, roundIndex) =>
      Array.from({ length: seatCount }, (_, packIndex) => ({
        id: `pack-${roundIndex}-${packIndex}`,
        cards: [{
          instanceId: `instance-${roundIndex}-${packIndex}`,
          cardId: "abstract-card",
        }],
      }))
    );
    const state = createDraft({ seats, packsByRound });
    assert.equal(state.seats.length, seatCount);
    assert.equal(state.packsInFlight.length, seatCount);
  }
});
