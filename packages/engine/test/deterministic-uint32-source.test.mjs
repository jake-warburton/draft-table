import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DETERMINISTIC_UINT32_SOURCE_ALGORITHM_VERSION,
  DeterministicUint32SourceError,
  drawDeterministicBoundedTicket,
  generateDeterministicUint32Sample,
  initializeDeterministicUint32Source
} from "../src/deterministic-uint32-source.ts";

const algorithm = "pcg-xsh-rr-64-32-v1";
const state = (word, domain = "00000000") => `${algorithm}:${word}:${domain}`;

const safe = (action) => assert.throws(action, (error) => {
  assert.ok(error instanceof DeterministicUint32SourceError);
  assert.equal(error.code, "DETERMINISTIC_UINT32_SOURCE_FAILED");
  assert.equal(error.name, "DeterministicUint32SourceError");
  assert.equal(error.message, "Deterministic uint32 source operation failed.");
  assert.equal(error.stack, "DeterministicUint32SourceError: Deterministic uint32 source operation failed.");
  assert.deepEqual(JSON.parse(JSON.stringify(error)), {
    name: "DeterministicUint32SourceError",
    code: "DETERMINISTIC_UINT32_SOURCE_FAILED"
  });
  assert.doesNotMatch(error.message, /NaN|Infinity|4294967296|https?:|\\|\//iu);
  return true;
});

const assertDraw = (result, expected) => {
  assert.deepEqual(result, expected);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.samples));
  assert.equal(result.state, "accepted");
  assert.equal(result.consumedSamples, result.samples.length);
  assert.equal(result.retryCount, result.consumedSamples - 1);
  assert.equal(result.samples.at(-1) % result.ticketBound, result.ticket);
};

test("PCG XSH RR 64/32 v1 has a pinned canonical seed/domain state and published known-answer samples", () => {
  assert.equal(DETERMINISTIC_UINT32_SOURCE_ALGORITHM_VERSION, algorithm);
  let sourceState = initializeDeterministicUint32Source(42, 54);
  assert.equal(sourceState, state("185706b82c2e03f8", "00000036"));

  const expected = [
    [0xa15c02b7, "2b47fed88766bb05"],
    [0x7b47f409, "8b33296d19bf5b4e"],
    [0xba1d3330, "f7079824c154bf23"],
    [0x83d2f293, "ebbf9e97aa16f694"],
    [0xbfa4784b, "8303569fbe80c471"],
    [0xcbed606e, "beb6d0b73fdb974a"]
  ];
  for (const [sample, word] of expected) {
    const transition = generateDeterministicUint32Sample(sourceState);
    assert.deepEqual(transition, { sample, sourceState: state(word, "00000036") });
    assert.ok(Object.isFrozen(transition));
    sourceState = transition.sourceState;
  }
});

test("the source reaches and preserves uint32 seed, domain, and sample boundaries without signed coercion", () => {
  assert.equal(initializeDeterministicUint32Source(0, 0), state("5851f42d4c957f2e"));
  assert.equal(
    initializeDeterministicUint32Source(4_294_967_295, 4_294_967_295),
    state("351c952e66d501a5", "ffffffff")
  );
  assert.deepEqual(generateDeterministicUint32Sample(state("0000000000000000")), {
    sample: 0,
    sourceState: state("0000000000000001")
  });
  assert.deepEqual(generateDeterministicUint32Sample(state("07fffe0000000000")), {
    sample: 4_294_967_295,
    sourceState: state("3d01a60000000001")
  });
  assertDraw(drawDeterministicBoundedTicket(state("0000000000000000"), 4_294_967_296), {
    state: "accepted",
    ticketBound: 4_294_967_296,
    samples: [0],
    consumedSamples: 1,
    retryCount: 0,
    ticket: 0,
    sourceState: state("0000000000000001")
  });
  assertDraw(drawDeterministicBoundedTicket(state("07fffe0000000000"), 4_294_967_296), {
    state: "accepted",
    ticketBound: 4_294_967_296,
    samples: [4_294_967_295],
    consumedSamples: 1,
    retryCount: 0,
    ticket: 4_294_967_295,
    sourceState: state("3d01a60000000001")
  });
});

test("the caller-side loop retries through the existing unbiased batch mapper and stops at its first acceptance", () => {
  const initial = initializeDeterministicUint32Source(42, 54);
  assertDraw(drawDeterministicBoundedTicket(initial, 2_147_483_649), {
    state: "accepted",
    ticketBound: 2_147_483_649,
    samples: [2_707_161_783, 2_068_313_097],
    consumedSamples: 2,
    retryCount: 1,
    ticket: 2_068_313_097,
    sourceState: state("8b33296d19bf5b4e", "00000036")
  });

  const longRetry = drawDeterministicBoundedTicket(state("a63c4e0e77c48205"), 2_147_483_649);
  assert.equal(longRetry.consumedSamples, 22);
  assert.equal(longRetry.retryCount, 21);
  assert.equal(longRetry.samples.length, 22);
  assert.ok(longRetry.samples.slice(0, -1).every((sample) => sample >= 2_147_483_649));
  assert.equal(longRetry.samples.at(-1), 934_602_681);
  assert.equal(longRetry.ticket, 934_602_681);
  assert.equal(longRetry.sourceState, state("8101eca05991aee7"));
});

test("accepted tickets cover the first, middle, and last positions exactly", () => {
  assertDraw(drawDeterministicBoundedTicket(state("f7079824c154bf23", "00000036"), 7), {
    state: "accepted", ticketBound: 7, samples: [2_211_639_955], consumedSamples: 1,
    retryCount: 0, ticket: 0, sourceState: state("ebbf9e97aa16f694", "00000036")
  });
  assertDraw(drawDeterministicBoundedTicket(state("ebbf9e97aa16f694", "00000036"), 7), {
    state: "accepted", ticketBound: 7, samples: [3_215_226_955], consumedSamples: 1,
    retryCount: 0, ticket: 3, sourceState: state("8303569fbe80c471", "00000036")
  });
  assertDraw(drawDeterministicBoundedTicket(state("8b33296d19bf5b4e", "00000036"), 7), {
    state: "accepted", ticketBound: 7, samples: [3_122_475_824], consumedSamples: 1,
    retryCount: 0, ticket: 6, sourceState: state("f7079824c154bf23", "00000036")
  });
});

test("immutable explicit states branch independently and repeated calls advance only the returned state", () => {
  const initialA = initializeDeterministicUint32Source(42, 54);
  const initialB = initializeDeterministicUint32Source(42, 54);
  assert.equal(initialA, initialB);

  const branchA = generateDeterministicUint32Sample(initialA);
  const branchB = generateDeterministicUint32Sample(initialB);
  assert.notEqual(branchA, branchB);
  assert.deepEqual(branchA, branchB);
  assert.equal(initialA, state("185706b82c2e03f8", "00000036"));
  assert.deepEqual(generateDeterministicUint32Sample(initialA), branchA);

  const second = generateDeterministicUint32Sample(branchA.sourceState);
  assert.equal(second.sample, 0x7b47f409);
  assert.notEqual(second.sourceState, branchA.sourceState);
  assert.equal(generateDeterministicUint32Sample(initializeDeterministicUint32Source(42, 55)).sample, 0xadd2c78f);
  assert.notEqual(initializeDeterministicUint32Source(42, 54), initializeDeterministicUint32Source(42, 55));
});

test("the same seed and ordered multi-bound calls replay an identical transcript byte-for-byte", () => {
  const replay = () => {
    let sourceState = initializeDeterministicUint32Source(42, 54);
    const calls = [];
    for (const ticketBound of [2_147_483_649, 7, 1, 4_294_967_296, 2_147_483_649]) {
      const result = drawDeterministicBoundedTicket(sourceState, ticketBound);
      calls.push(result);
      sourceState = result.sourceState;
    }
    return JSON.stringify({ algorithm: DETERMINISTIC_UINT32_SOURCE_ALGORITHM_VERSION, calls, sourceState });
  };

  const expected = JSON.stringify({
    algorithm,
    calls: [
      { state: "accepted", ticketBound: 2_147_483_649, samples: [2_707_161_783, 2_068_313_097], consumedSamples: 2, retryCount: 1, ticket: 2_068_313_097, sourceState: state("8b33296d19bf5b4e", "00000036") },
      { state: "accepted", ticketBound: 7, samples: [3_122_475_824], consumedSamples: 1, retryCount: 0, ticket: 6, sourceState: state("f7079824c154bf23", "00000036") },
      { state: "accepted", ticketBound: 1, samples: [2_211_639_955], consumedSamples: 1, retryCount: 0, ticket: 0, sourceState: state("ebbf9e97aa16f694", "00000036") },
      { state: "accepted", ticketBound: 4_294_967_296, samples: [3_215_226_955], consumedSamples: 1, retryCount: 0, ticket: 3_215_226_955, sourceState: state("8303569fbe80c471", "00000036") },
      { state: "accepted", ticketBound: 2_147_483_649, samples: [3_421_331_566, 3_217_466_285, 2_167_406_445, 3_860_803_674, 4_181_216_144, 853_247_742], consumedSamples: 6, retryCount: 5, ticket: 853_247_742, sourceState: state("00ee01944e993a7b", "00000036") }
    ],
    sourceState: state("00ee01944e993a7b", "00000036")
  });
  assert.equal(replay(), expected);
  assert.equal(replay(), expected);
});

test("seed, domain, bound, state, and arity failures use one stable safe error", () => {
  assert.ok(Object.isFrozen(DeterministicUint32SourceError));
  assert.ok(Object.isFrozen(DeterministicUint32SourceError.prototype));
  const ownError = new DeterministicUint32SourceError();
  for (const property of ["name", "message", "stack", "code"]) {
    assert.equal(Object.hasOwn(ownError, property), true);
  }

  const invalidUint32 = [-1, 0.5, NaN, Infinity, -Infinity, 4_294_967_296, Number.MAX_SAFE_INTEGER + 1, "0", null, undefined, {}];
  for (const seed of invalidUint32) safe(() => initializeDeterministicUint32Source(seed, 0));
  for (const domain of invalidUint32) safe(() => initializeDeterministicUint32Source(0, domain));
  safe(() => initializeDeterministicUint32Source());
  safe(() => initializeDeterministicUint32Source(0));
  safe(() => initializeDeterministicUint32Source(0, 0, "extra"));

  const valid = initializeDeterministicUint32Source(0, 0);
  const invalidStates = [
    "", 0, null, undefined, {}, Symbol("state"),
    `${algorithm}:000000000000000:00000000`,
    `${algorithm}:00000000000000000:00000000`,
    `${algorithm}:0000000000000000:0000000`,
    `${algorithm}:0000000000000000:000000000`,
    `${algorithm}:000000000000000G:00000000`,
    `${algorithm}:000000000000000a:0000000A`,
    `PCG-XSH-RR-64-32-V1:0000000000000000:00000000`,
    `${algorithm}:0000000000000000:00000000:extra`
  ];
  for (const invalidState of invalidStates) {
    safe(() => generateDeterministicUint32Sample(invalidState));
    safe(() => drawDeterministicBoundedTicket(invalidState, 1));
  }
  safe(() => generateDeterministicUint32Sample());
  safe(() => generateDeterministicUint32Sample(valid, "extra"));

  for (const bound of [0, -1, 0.5, NaN, Infinity, -Infinity, 4_294_967_297, Number.MAX_SAFE_INTEGER + 1, "1", null, undefined]) {
    safe(() => drawDeterministicBoundedTicket(valid, bound));
  }
  safe(() => drawDeterministicBoundedTicket());
  safe(() => drawDeterministicBoundedTicket(valid));
  safe(() => drawDeterministicBoundedTicket(valid, 1, "extra"));
});

test("results and sampled transcripts are fresh and deeply immutable", () => {
  const sourceState = initializeDeterministicUint32Source(42, 54);
  const first = drawDeterministicBoundedTicket(sourceState, 2_147_483_649);
  const second = drawDeterministicBoundedTicket(sourceState, 2_147_483_649);
  assert.notEqual(first, second);
  assert.notEqual(first.samples, second.samples);
  assert.deepEqual(first, second);
  assert.throws(() => { first.ticket = 0; }, TypeError);
  assert.throws(() => { first.samples[0] = 0; }, TypeError);
  assert.throws(() => { first.samples.push(0); }, TypeError);
});

test("the deterministic source owns no ambient entropy or alternate bounded mapper", () => {
  const source = readFileSync(new URL("../src/deterministic-uint32-source.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Math\.random|crypto|randomBytes|randomUUID|Date\.|performance\.|process\.|fetch\s*\(/u);
  assert.match(source, /import\s*\{\s*mapUnsigned32SampleBatchToBoundedTicket\s*\}\s*from\s*"\.\/uint32-sample-batch\.ts"/u);
  assert.match(source, /mapUnsigned32SampleBatchToBoundedTicket\(\[sample\],\s*ticketBound\)/u);
  assert.doesNotMatch(source, /sample\s*%\s*ticketBound|mapUnsigned32SampleToBoundedTicket/u);
});
