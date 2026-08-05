import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import {
  UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END,
  UnbiasedUint32TicketMappingError,
  mapUnsigned32SampleBatchToBoundedTicket,
  mapUnsigned32SampleToBoundedTicket
} from "../src/index.ts";

const safe = (action) => assert.throws(action, (error) => {
  assert.ok(error instanceof UnbiasedUint32TicketMappingError);
  assert.equal(error.code, "UNBIASED_UINT_TICKET_MAPPING_FAILED");
  assert.equal(error.message, "Unbiased uint32 ticket mapping failed.");
  assert.equal(error.stack, "UnbiasedUint32TicketMappingError: Unbiased uint32 ticket mapping failed.");
  assert.doesNotMatch(error.message, /0\.5|NaN|Infinity|4294967296|https?:|\\|\//iu);
  return true;
});

const retrySample = (bound) => cutoff(bound);
const cutoff = (bound) => UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END % bound;

const assertAccepted = (result, ticket, consumedSamples) => {
  assert.deepEqual(result, { state: "accepted", ticket, consumedSamples });
  assert.ok(Object.isFrozen(result));
};

const assertNeedsSample = (result, consumedSamples) => {
  assert.deepEqual(result, { state: "needs-sample", consumedSamples });
  assert.ok(Object.isFrozen(result));
};

test("finite uint32 batches validate before mapping and return the first accepted ticket in source order", () => {
  for (const bound of [1, 2, 3, 7, 460_800, UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END]) {
    const acceptedCutoff = cutoff(bound);
    if (acceptedCutoff < UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END) {
      const samples = [acceptedCutoff, acceptedCutoff, acceptedCutoff - 1, UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - 1];
      assertAccepted(
        mapUnsigned32SampleBatchToBoundedTicket(samples, bound),
        (acceptedCutoff - 1) % bound,
        3
      );
      assertNeedsSample(mapUnsigned32SampleBatchToBoundedTicket([acceptedCutoff], bound), 1);
    } else {
      assertAccepted(mapUnsigned32SampleBatchToBoundedTicket([0, 1], bound), 0, 1);
    }
  }
  assertAccepted(mapUnsigned32SampleBatchToBoundedTicket([0], 1), 0, 1);
  assertAccepted(mapUnsigned32SampleBatchToBoundedTicket([UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - 1], UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END), UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - 1, 1);
  assertNeedsSample(mapUnsigned32SampleBatchToBoundedTicket([], 460_800), 0);
  assertAccepted(mapUnsigned32SampleBatchToBoundedTicket([retrySample(7), 12], 7), 5, 2);
});

test("finite uint32 batches preserve exact mapper results and explicit exhaustion", () => {
  const batches = [
    { samples: [], bound: 1 },
    { samples: [0], bound: 7 },
    { samples: [UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - 1, UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - 2, 10], bound: 7 },
    { samples: [UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - 1, UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - 1], bound: 460_800 }
  ];
  for (const { samples, bound } of batches) {
    let expected = { state: "needs-sample", consumedSamples: samples.length };
    for (let index = 0; index < samples.length; index++) {
      const mapping = mapUnsigned32SampleToBoundedTicket(samples[index], bound);
      if (mapping.state === "accepted") {
        expected = { state: "accepted", ticket: mapping.ticket, consumedSamples: index + 1 };
        break;
      }
    }
    assert.deepEqual(mapUnsigned32SampleBatchToBoundedTicket(samples, bound), expected);
  }
});

test("finite uint32 batches match a sequential public-mapper oracle for small bounds and batches", () => {
  for (let bound = 1; bound <= 12; bound++) {
    const cutoffForBound = cutoff(bound);
    for (let length = 0; length <= 7; length++) {
      for (let offset = 0; offset < 5; offset++) {
        const samples = Array.from({ length }, (_, index) => (cutoffForBound + index + offset) % UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END);
        const oracle = samples.reduce((result, sample, index) => {
          if (result.state === "accepted") return result;
          const mapping = mapUnsigned32SampleToBoundedTicket(sample, bound);
          return mapping.state === "accepted"
            ? { state: "accepted", ticket: mapping.ticket, consumedSamples: index + 1 }
            : { state: "needs-sample", consumedSamples: index + 1 };
        }, { state: "needs-sample", consumedSamples: 0 });
        const expected = oracle.state === "accepted" ? oracle : { state: "needs-sample", consumedSamples: length };
        assert.deepEqual(mapUnsigned32SampleBatchToBoundedTicket(samples, bound), expected);
      }
    }
  }
});

test("finite uint32 batches reject invalid, foreign, and extra inputs before any acceptance", () => {
  const invalidSamples = [-1, 0.5, NaN, Infinity, -Infinity, UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END, "0", null, undefined, {}];
  for (const sample of invalidSamples) safe(() => mapUnsigned32SampleBatchToBoundedTicket([0, sample], 1));
  for (const samples of [null, undefined, {}, "0", new Uint32Array([0]), { 0: 0, length: 1 }]) safe(() => mapUnsigned32SampleBatchToBoundedTicket(samples, 1));
  for (const bound of [0, -1, 0.5, NaN, Infinity, UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END + 1, "1", null, undefined]) safe(() => mapUnsigned32SampleBatchToBoundedTicket([], bound));
  safe(() => mapUnsigned32SampleBatchToBoundedTicket());
  safe(() => mapUnsigned32SampleBatchToBoundedTicket([], 1, "extra"));
  safe(() => mapUnsigned32SampleBatchToBoundedTicket([0], 1, undefined));
  const invalidTrailing = [0, UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END];
  safe(() => mapUnsigned32SampleBatchToBoundedTicket(invalidTrailing, 1));
});

test("finite uint32 batches snapshot hostile array length and elements exactly once", () => {
  let shrinkingLengthReads = 0;
  const shrinkingElementReads = [0, 0];
  const shrinkingTarget = [0, UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END];
  let shrinkingFirstReads = 0;
  Object.defineProperty(shrinkingTarget, 0, {
    configurable: true,
    get() {
      shrinkingFirstReads++;
      shrinkingTarget.length = 1;
      return 0;
    }
  });
  const shrinking = new Proxy(shrinkingTarget, {
    get(target, property, receiver) {
      if (property === "length") shrinkingLengthReads++;
      if (property === "0" || property === "1") shrinkingElementReads[Number(property)]++;
      return Reflect.get(target, property, receiver);
    }
  });
  safe(() => mapUnsigned32SampleBatchToBoundedTicket(shrinking, 1));
  assert.equal(shrinkingLengthReads, 1);
  assert.deepEqual(shrinkingElementReads, [1, 1]);
  assert.equal(shrinkingFirstReads, 1);

  const originalPush = Array.prototype.push;
  const corrupting = [0, UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END];
  Object.defineProperty(corrupting, 0, {
    configurable: true,
    get() {
      Array.prototype.push = () => 0;
      return 0;
    }
  });
  Object.defineProperty(corrupting, 1, {
    configurable: true,
    get() {
      Array.prototype.push = originalPush;
      return UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END;
    }
  });
  try {
    safe(() => mapUnsigned32SampleBatchToBoundedTicket(corrupting, 1));
  } finally {
    Array.prototype.push = originalPush;
  }

  const inheritedIndexDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, "1");
  const inheritedIndexCorrupting = [0, UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END];
  Object.defineProperty(inheritedIndexCorrupting, 0, {
    configurable: true,
    get() {
      Object.defineProperty(Array.prototype, "1", {
        configurable: true,
        get() { return 0; },
        set() {}
      });
      return 0;
    }
  });
  try {
    safe(() => mapUnsigned32SampleBatchToBoundedTicket(inheritedIndexCorrupting, 1));
  } finally {
    if (inheritedIndexDescriptor === undefined) delete Array.prototype[1];
    else Object.defineProperty(Array.prototype, "1", inheritedIndexDescriptor);
  }

  const getterReads = [0, 0];
  const mutating = [12, 13];
  Object.defineProperty(mutating, 0, {
    configurable: true,
    get() {
      getterReads[0]++;
      return 12;
    }
  });
  Object.defineProperty(mutating, 1, {
    configurable: true,
    get() {
      getterReads[1]++;
      Object.defineProperty(mutating, 0, { configurable: true, value: retrySample(7), writable: true });
      return 13;
    }
  });
  assertAccepted(mapUnsigned32SampleBatchToBoundedTicket(mutating, 7), 5, 1);
  assert.deepEqual(getterReads, [1, 1]);

  let dynamicLengthReads = 0;
  const dynamicElementReads = [0, 0];
  const dynamic = new Proxy([retrySample(7), 12], {
    get(target, property, receiver) {
      if (property === "length") {
        dynamicLengthReads++;
        return dynamicLengthReads === 1 ? 2 : UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - 1;
      }
      if (property === "0" || property === "1") dynamicElementReads[Number(property)]++;
      return Reflect.get(target, property, receiver);
    }
  });
  assertAccepted(mapUnsigned32SampleBatchToBoundedTicket(dynamic, 7), 5, 2);
  assert.equal(dynamicLengthReads, 1);
  assert.deepEqual(dynamicElementReads, [1, 1]);

  const invalidLength = new Proxy([], {
    get(target, property, receiver) {
      if (property === "length") return UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END;
      return Reflect.get(target, property, receiver);
    }
  });
  safe(() => mapUnsigned32SampleBatchToBoundedTicket(invalidLength, 1));
  safe(() => mapUnsigned32SampleBatchToBoundedTicket(new Proxy([], {
    get() { throw new Error("length trap"); }
  }), 1));
  const throwingElement = [0];
  Object.defineProperty(throwingElement, 0, { get() { throw new Error("element trap"); } });
  safe(() => mapUnsigned32SampleBatchToBoundedTicket(throwingElement, 1));

  const hostileError = new UnbiasedUint32TicketMappingError();
  hostileError.message = "attacker-controlled";
  hostileError.stack = "attacker-controlled";
  const throwingEngineError = [0];
  Object.defineProperty(throwingEngineError, 0, { get() { throw hostileError; } });
  safe(() => mapUnsigned32SampleBatchToBoundedTicket(throwingEngineError, 1));

  const { proxy: revoked, revoke } = Proxy.revocable([], {});
  revoke();
  safe(() => mapUnsigned32SampleBatchToBoundedTicket(revoked, 1));
});

test("finite uint32 batch results are deeply immutable, deterministic, and independent of caller copies", () => {
  const samples = [UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - 1, 12];
  const first = mapUnsigned32SampleBatchToBoundedTicket(samples, 7);
  const second = mapUnsigned32SampleBatchToBoundedTicket([...samples], 7);
  assert.notEqual(first, second);
  assert.deepEqual(first, second);
  assert.ok(Object.isFrozen(first));
  assert.throws(() => { first.ticket = 1; }, TypeError);
  assert.throws(() => { first.consumedSamples = 1; }, TypeError);
  samples[1] = 13;
  assert.deepEqual(first, { state: "accepted", ticket: 5, consumedSamples: 2 });
  assert.deepEqual(mapUnsigned32SampleBatchToBoundedTicket(samples, 7), { state: "accepted", ticket: 6, consumedSamples: 2 });
  const retry = mapUnsigned32SampleBatchToBoundedTicket([UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - 1], UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - 1);
  assertNeedsSample(retry, 1);
  assert.throws(() => { retry.state = "accepted"; }, TypeError);

  const inheritedDescriptors = Object.fromEntries(
    ["state", "ticket", "consumedSamples"].map((property) => [property, Object.getOwnPropertyDescriptor(Object.prototype, property)])
  );
  let accepted;
  let exhausted;
  try {
    for (const property of ["state", "ticket", "consumedSamples"]) {
      Object.defineProperty(Object.prototype, property, {
        configurable: true,
        get() { return property === "state" ? "hostile" : 99; },
        set() {}
      });
    }
    accepted = mapUnsigned32SampleBatchToBoundedTicket([12], 7);
    exhausted = mapUnsigned32SampleBatchToBoundedTicket([UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - 1], UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - 1);
  } finally {
    for (const property of ["state", "ticket", "consumedSamples"]) {
      const descriptor = inheritedDescriptors[property];
      if (descriptor === undefined) delete Object.prototype[property];
      else Object.defineProperty(Object.prototype, property, descriptor);
    }
  }
  assertAccepted(accepted, 5, 1);
  assertNeedsSample(exhausted, 1);
  for (const [result, properties] of [[accepted, ["state", "ticket", "consumedSamples"]], [exhausted, ["state", "consumedSamples"]]]) {
    for (const property of properties) assert.equal(Object.hasOwn(result, property), true);
  }
});

const mutationModuleKey = "DRAFT_TABLE_TEST_UINT32_SAMPLE_BATCH_MODULE";
const sourcePath = new URL("../src/uint32-sample-batch.ts", import.meta.url);

const capturedDefinePropertyContract = "finite batch uses captured defineProperty against hostile caller getters";
test(capturedDefinePropertyContract, async () => {
  console.log("FINITE_BATCH_CAPTURED_DEFINE_PROPERTY_CONTRACT_EXECUTED");
  const mapping = await import(process.env[mutationModuleKey] ?? sourcePath.href);
  const originalDefineProperty = Object.defineProperty;
  const samples = [7];
  originalDefineProperty(samples, 0, {
    configurable: true,
    get() {
      Object.defineProperty = () => { throw new Error("hostile defineProperty"); };
      return 7;
    }
  });
  let result;
  try {
    result = mapping.mapUnsigned32SampleBatchToBoundedTicket(samples, 10);
  } finally {
    Object.defineProperty = originalDefineProperty;
  }
  assert.deepEqual(result, { state: "accepted", ticket: 7, consumedSamples: 1 }, "CAPTURED_DEFINE_PROPERTY_MUST_PRESERVE_EXACT_TICKET");
});

const capturedFreezeContract = "finite batch rejects forged mapper output and uses captured freeze";
test(capturedFreezeContract, async () => {
  console.log("FINITE_BATCH_CAPTURED_FREEZE_CONTRACT_EXECUTED");
  const mapping = await import(process.env[mutationModuleKey] ?? sourcePath.href);
  const originalFreeze = Object.freeze;
  const forgedSamples = [7];
  Object.defineProperty(forgedSamples, 0, {
    configurable: true,
    get() {
      let calls = 0;
      Object.freeze = (value) => ++calls === 1 ? { state: "accepted", ticket: 999 } : value;
      return 7;
    }
  });
  let forgedResult;
  try {
    forgedResult = mapping.mapUnsigned32SampleBatchToBoundedTicket(forgedSamples, 10);
  } finally {
    Object.freeze = originalFreeze;
  }
  assert.deepEqual(
    forgedResult,
    { state: "accepted", ticket: 7, consumedSamples: 1 },
    "FORGED_MAPPER_TICKET_MUST_BE_REJECTED"
  );
  assert.equal(Object.isFrozen(forgedResult), true);

  const unfrozenMapperSamples = [7];
  Object.defineProperty(unfrozenMapperSamples, 0, {
    configurable: true,
    get() {
      Object.freeze = (value) => value;
      return 7;
    }
  });
  let result;
  try {
    result = mapping.mapUnsigned32SampleBatchToBoundedTicket(unfrozenMapperSamples, 10);
  } finally {
    Object.freeze = originalFreeze;
  }
  assert.deepEqual(result, { state: "accepted", ticket: 7, consumedSamples: 1 });
  assert.equal(Object.isFrozen(result), true, "BATCH_RESULT_MUST_USE_CAPTURED_FREEZE");
});

const hostileProxyContract = "finite batch snapshots hostile Proxy length for bounded consumption";
test(hostileProxyContract, async () => {
  console.log("FINITE_BATCH_HOSTILE_PROXY_CONTRACT_EXECUTED");
  const mapping = await import(process.env[mutationModuleKey] ?? sourcePath.href);
  let lengthReads = 0;
  const elementReads = new Map();
  const samples = new Proxy([], {
    get(target, property, receiver) {
      if (property === "length") {
        lengthReads++;
        return Math.min(lengthReads + 1, 3);
      }
      if (typeof property === "string" && /^\d+$/u.test(property)) {
        elementReads.set(property, (elementReads.get(property) ?? 0) + 1);
        return property === "0" ? retrySample(7) : 12;
      }
      return Reflect.get(target, property, receiver);
    }
  });
  assert.equal(Array.isArray(samples), true);
  assert.deepEqual(mapping.mapUnsigned32SampleBatchToBoundedTicket(samples, 7), { state: "accepted", ticket: 5, consumedSamples: 2 });
  assert.equal(lengthReads, 1, "HOSTILE_PROXY_LENGTH_MUST_BE_READ_ONCE");
  assert.deepEqual(Object.fromEntries(elementReads), { 0: 1, 1: 1 }, "HOSTILE_PROXY_MUST_READ_ONLY_CAPTURED_ELEMENTS");
});
test("hostile-Proxy length semantic mutation fails its exact named contract", () => {
  const before = "for (let index = 0; index < sampleCount; index++) {\n      defineOwnDataProperty";
  const after = "for (let index = 0; index < suppliedSamples.length; index++) {\n      defineOwnDataProperty";
  const original = readFileSync(sourcePath, "utf8");
  assert.equal(original.split(before).length - 1, 1);
  const mutated = original.replace(before, after);
  assert.equal(mutated.split(after).length - 1, 1);
  assert.equal(Buffer.byteLength(mutated) - Buffer.byteLength(original), Buffer.byteLength(after) - Buffer.byteLength(before));
  let directory;
  let testError;
  try {
    directory = mkdtempSync(join(tmpdir(), "draft-table-uint32-sample-batch-hostile-proxy-"));
    const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url));
    for (const file of readdirSync(sourceDirectory).filter((file) => file.endsWith(".ts"))) copyFileSync(join(sourceDirectory, file), join(directory, file));
    const mutationPath = join(directory, "uint32-sample-batch.ts");
    writeFileSync(mutationPath, mutated);
    writeFileSync(join(directory, "tsconfig.json"), JSON.stringify({
      compilerOptions: { target: "ES2022", module: "ES2022", moduleResolution: "bundler", strict: true, noEmit: true, allowImportingTsExtensions: true }, include: ["*.ts"]
    }));
    const typecheck = spawnSync(join(fileURLToPath(new URL("../../..", import.meta.url)), "node_modules/.bin/tsc"), ["-p", join(directory, "tsconfig.json")], { encoding: "utf8" });
    assert.equal(typecheck.status, 0, `${typecheck.stdout}\n${typecheck.stderr}`);
    const environment = { ...process.env, [mutationModuleKey]: pathToFileURL(mutationPath).href };
    delete environment.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, [
      "--experimental-strip-types", "--test", "--test-name-pattern", `^${hostileProxyContract.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`, fileURLToPath(import.meta.url)
    ], { encoding: "utf8", env: environment });
    const lines = result.stdout.split(/\r?\n/u);
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(lines.filter((line) => line === "# FINITE_BATCH_HOSTILE_PROXY_CONTRACT_EXECUTED").length, 1);
    assert.equal(lines.filter((line) => /^not ok \d+ - /u.test(line) && line.replace(/^not ok \d+ - /u, "") === hostileProxyContract).length, 1);
    assert.equal(lines.filter((line) => line.includes("HOSTILE_PROXY_LENGTH_MUST_BE_READ_ONCE")).length, 1);
  } catch (error) {
    testError = error;
  } finally {
    if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  }
  assert.equal(directory === undefined ? false : existsSync(directory), false);
  if (testError !== undefined) throw testError;
});

const retryFallbackContract = "finite batch retry does not fallback to ticket zero";
test(retryFallbackContract, async () => {
  console.log("FINITE_BATCH_RETRY_CONTRACT_EXECUTED");
  const mapping = await import(process.env[mutationModuleKey] ?? sourcePath.href);
  assert.deepEqual(mapping.mapUnsigned32SampleBatchToBoundedTicket([UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - 1, 12], 7), { state: "accepted", ticket: 5, consumedSamples: 2 }, "RETRY_MUST_CONTINUE_TO_NEXT_SUPPLIED_SAMPLE");
});
test("retry-fallback semantic mutation fails its exact named contract", () => {
  const before = "if (mapping.state === \"retry\") continue;";
  const after = "if (mapping.state === \"retry\") return frozen({ state: \"accepted\", ticket: 0, consumedSamples: index + 1 });";
  const original = readFileSync(sourcePath, "utf8");
  assert.equal(original.split(before).length - 1, 1);
  const mutated = original.replace(before, after);
  assert.equal(mutated.split(after).length - 1, 1);
  assert.equal(Buffer.byteLength(mutated) - Buffer.byteLength(original), Buffer.byteLength(after) - Buffer.byteLength(before));
  let directory;
  let testError;
  try {
    directory = mkdtempSync(join(tmpdir(), "draft-table-uint32-sample-batch-retry-"));
    const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url));
    for (const file of readdirSync(sourceDirectory).filter((file) => file.endsWith(".ts"))) copyFileSync(join(sourceDirectory, file), join(directory, file));
    const mutationPath = join(directory, "uint32-sample-batch.ts");
    writeFileSync(mutationPath, mutated);
    writeFileSync(join(directory, "tsconfig.json"), JSON.stringify({
      compilerOptions: { target: "ES2022", module: "ES2022", moduleResolution: "bundler", strict: true, noEmit: true, allowImportingTsExtensions: true }, include: ["*.ts"]
    }));
    const typecheck = spawnSync(join(fileURLToPath(new URL("../../..", import.meta.url)), "node_modules/.bin/tsc"), ["-p", join(directory, "tsconfig.json")], { encoding: "utf8" });
    assert.equal(typecheck.status, 0, `${typecheck.stdout}\n${typecheck.stderr}`);
    const environment = { ...process.env, [mutationModuleKey]: pathToFileURL(mutationPath).href };
    delete environment.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, [
      "--experimental-strip-types", "--test", "--test-name-pattern", `^${retryFallbackContract.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`, fileURLToPath(import.meta.url)
    ], { encoding: "utf8", env: environment });
    const lines = result.stdout.split(/\r?\n/u);
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(lines.filter((line) => line === "# FINITE_BATCH_RETRY_CONTRACT_EXECUTED").length, 1);
    assert.equal(lines.filter((line) => /^not ok \d+ - /u.test(line) && line.replace(/^not ok \d+ - /u, "") === retryFallbackContract).length, 1);
    assert.equal(lines.filter((line) => line.includes("RETRY_MUST_CONTINUE_TO_NEXT_SUPPLIED_SAMPLE")).length, 1);
  } catch (error) {
    testError = error;
  } finally {
    if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  }
  assert.equal(directory === undefined ? false : existsSync(directory), false);
  if (testError !== undefined) throw testError;
});

const firstAcceptanceContract = "finite batch stops at first acceptance";
test(firstAcceptanceContract, async () => {
  console.log("FINITE_BATCH_FIRST_ACCEPTANCE_CONTRACT_EXECUTED");
  const mapping = await import(process.env[mutationModuleKey] ?? sourcePath.href);
  assert.deepEqual(mapping.mapUnsigned32SampleBatchToBoundedTicket([12, 13], 7), { state: "accepted", ticket: 5, consumedSamples: 1 }, "FIRST_ACCEPTANCE_MUST_STOP_SELECTION");
});
test("first-acceptance semantic mutation fails its exact named contract", () => {
  const before = "return frozen({ state: \"accepted\", ticket: mapping.ticket, consumedSamples: index + 1 });";
  const after = "frozen({ state: \"accepted\", ticket: mapping.ticket, consumedSamples: index + 1 });\n        continue;";
  const original = readFileSync(sourcePath, "utf8");
  assert.equal(original.split(before).length - 1, 1);
  const mutated = original.replace(before, after);
  assert.equal(mutated.split(after).length - 1, 1);
  assert.equal(Buffer.byteLength(mutated) - Buffer.byteLength(original), Buffer.byteLength(after) - Buffer.byteLength(before));
  let directory;
  let testError;
  try {
    directory = mkdtempSync(join(tmpdir(), "draft-table-uint32-sample-batch-first-acceptance-"));
    const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url));
    for (const file of readdirSync(sourceDirectory).filter((file) => file.endsWith(".ts"))) copyFileSync(join(sourceDirectory, file), join(directory, file));
    const mutationPath = join(directory, "uint32-sample-batch.ts");
    writeFileSync(mutationPath, mutated);
    writeFileSync(join(directory, "tsconfig.json"), JSON.stringify({
      compilerOptions: { target: "ES2022", module: "ES2022", moduleResolution: "bundler", strict: true, noEmit: true, allowImportingTsExtensions: true }, include: ["*.ts"]
    }));
    const typecheck = spawnSync(join(fileURLToPath(new URL("../../..", import.meta.url)), "node_modules/.bin/tsc"), ["-p", join(directory, "tsconfig.json")], { encoding: "utf8" });
    assert.equal(typecheck.status, 0, `${typecheck.stdout}\n${typecheck.stderr}`);
    const environment = { ...process.env, [mutationModuleKey]: pathToFileURL(mutationPath).href };
    delete environment.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, [
      "--experimental-strip-types", "--test", "--test-name-pattern", `^${firstAcceptanceContract.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`, fileURLToPath(import.meta.url)
    ], { encoding: "utf8", env: environment });
    const lines = result.stdout.split(/\r?\n/u);
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(lines.filter((line) => line === "# FINITE_BATCH_FIRST_ACCEPTANCE_CONTRACT_EXECUTED").length, 1);
    assert.equal(lines.filter((line) => /^not ok \d+ - /u.test(line) && line.replace(/^not ok \d+ - /u, "") === firstAcceptanceContract).length, 1);
    assert.equal(lines.filter((line) => line.includes("FIRST_ACCEPTANCE_MUST_STOP_SELECTION")).length, 1);
  } catch (error) {
    testError = error;
  } finally {
    if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  }
  assert.equal(directory === undefined ? false : existsSync(directory), false);
  if (testError !== undefined) throw testError;
});

const consumedCountContract = "finite batch reports exact consumed count";
test(consumedCountContract, async () => {
  console.log("FINITE_BATCH_CONSUMED_COUNT_CONTRACT_EXECUTED");
  const mapping = await import(process.env[mutationModuleKey] ?? sourcePath.href);
  assert.deepEqual(mapping.mapUnsigned32SampleBatchToBoundedTicket([UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - 1, 12], 7), { state: "accepted", ticket: 5, consumedSamples: 2 }, "CONSUMED_COUNT_MUST_BE_ONE_BASED");
});
test("consumed-count semantic mutation fails its exact named contract", () => {
  const before = "consumedSamples: index + 1";
  const after = "consumedSamples: index";
  const original = readFileSync(sourcePath, "utf8");
  assert.equal(original.split(before).length - 1, 1);
  const mutated = original.replace(before, after);
  assert.equal(mutated.split(after).length - 1, 1);
  assert.equal(Buffer.byteLength(mutated) - Buffer.byteLength(original), Buffer.byteLength(after) - Buffer.byteLength(before));
  let directory;
  let testError;
  try {
    directory = mkdtempSync(join(tmpdir(), "draft-table-uint32-sample-batch-consumed-count-"));
    const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url));
    for (const file of readdirSync(sourceDirectory).filter((file) => file.endsWith(".ts"))) copyFileSync(join(sourceDirectory, file), join(directory, file));
    const mutationPath = join(directory, "uint32-sample-batch.ts");
    writeFileSync(mutationPath, mutated);
    writeFileSync(join(directory, "tsconfig.json"), JSON.stringify({
      compilerOptions: { target: "ES2022", module: "ES2022", moduleResolution: "bundler", strict: true, noEmit: true, allowImportingTsExtensions: true }, include: ["*.ts"]
    }));
    const typecheck = spawnSync(join(fileURLToPath(new URL("../../..", import.meta.url)), "node_modules/.bin/tsc"), ["-p", join(directory, "tsconfig.json")], { encoding: "utf8" });
    assert.equal(typecheck.status, 0, `${typecheck.stdout}\n${typecheck.stderr}`);
    const environment = { ...process.env, [mutationModuleKey]: pathToFileURL(mutationPath).href };
    delete environment.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, [
      "--experimental-strip-types", "--test", "--test-name-pattern", `^${consumedCountContract.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`, fileURLToPath(import.meta.url)
    ], { encoding: "utf8", env: environment });
    const lines = result.stdout.split(/\r?\n/u);
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(lines.filter((line) => line === "# FINITE_BATCH_CONSUMED_COUNT_CONTRACT_EXECUTED").length, 1);
    assert.equal(lines.filter((line) => /^not ok \d+ - /u.test(line) && line.replace(/^not ok \d+ - /u, "") === consumedCountContract).length, 1);
    assert.equal(lines.filter((line) => line.includes("CONSUMED_COUNT_MUST_BE_ONE_BASED")).length, 1);
  } catch (error) {
    testError = error;
  } finally {
    if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  }
  assert.equal(directory === undefined ? false : existsSync(directory), false);
  if (testError !== undefined) throw testError;
});

const ownSnapshotPropertyContract = "finite batch snapshots each caller value as an own immutable data property";
test(ownSnapshotPropertyContract, async () => {
  console.log("FINITE_BATCH_OWN_SNAPSHOT_PROPERTY_CONTRACT_EXECUTED");
  const mapping = await import(process.env[mutationModuleKey] ?? sourcePath.href);
  const inheritedIndexDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, "0");
  const samples = [7];
  let result;
  try {
    Object.defineProperty(Array.prototype, "0", {
      configurable: true,
      get() { return 99; },
      set() {}
    });
    result = mapping.mapUnsigned32SampleBatchToBoundedTicket(samples, 10);
  } finally {
    if (inheritedIndexDescriptor === undefined) delete Array.prototype[0];
    else Object.defineProperty(Array.prototype, "0", inheritedIndexDescriptor);
  }
  assert.deepEqual(
    result,
    { state: "accepted", ticket: 7, consumedSamples: 1 },
    "SNAPSHOT_INDEX_MUST_BE_OWN_IMMUTABLE_DATA_PROPERTY"
  );
});
test("own-snapshot-property semantic mutation fails its exact named contract", () => {
  const before = "defineOwnDataProperty(sampleSnapshot, index, {\n        value: suppliedSamples[index], writable: false, enumerable: true, configurable: false\n      });";
  const after = "sampleSnapshot[index] = suppliedSamples[index];";
  const original = readFileSync(sourcePath, "utf8");
  assert.equal(original.split(before).length - 1, 1);
  const mutated = original.replace(before, after);
  assert.equal(mutated.split(after).length - 1, 1);
  assert.equal(Buffer.byteLength(mutated) - Buffer.byteLength(original), Buffer.byteLength(after) - Buffer.byteLength(before));
  let directory;
  let testError;
  try {
    directory = mkdtempSync(join(tmpdir(), "draft-table-uint32-sample-batch-own-property-"));
    const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url));
    for (const file of readdirSync(sourceDirectory).filter((file) => file.endsWith(".ts"))) copyFileSync(join(sourceDirectory, file), join(directory, file));
    const mutationPath = join(directory, "uint32-sample-batch.ts");
    writeFileSync(mutationPath, mutated);
    writeFileSync(join(directory, "tsconfig.json"), JSON.stringify({
      compilerOptions: { target: "ES2022", module: "ES2022", moduleResolution: "bundler", strict: true, noEmit: true, allowImportingTsExtensions: true }, include: ["*.ts"]
    }));
    const typecheck = spawnSync(join(fileURLToPath(new URL("../../..", import.meta.url)), "node_modules/.bin/tsc"), ["-p", join(directory, "tsconfig.json")], { encoding: "utf8" });
    assert.equal(typecheck.status, 0, `${typecheck.stdout}\n${typecheck.stderr}`);
    const environment = { ...process.env, [mutationModuleKey]: pathToFileURL(mutationPath).href };
    delete environment.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, [
      "--experimental-strip-types", "--test", "--test-name-pattern", `^${ownSnapshotPropertyContract.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`, fileURLToPath(import.meta.url)
    ], { encoding: "utf8", env: environment });
    const lines = result.stdout.split(/\r?\n/u);
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(lines.filter((line) => line === "# FINITE_BATCH_OWN_SNAPSHOT_PROPERTY_CONTRACT_EXECUTED").length, 1);
    assert.equal(lines.filter((line) => /^not ok \d+ - /u.test(line) && line.replace(/^not ok \d+ - /u, "") === ownSnapshotPropertyContract).length, 1);
    assert.equal(lines.filter((line) => line.includes("SNAPSHOT_INDEX_MUST_BE_OWN_IMMUTABLE_DATA_PROPERTY")).length, 1);
  } catch (error) {
    testError = error;
  } finally {
    if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  }
  assert.equal(directory === undefined ? false : existsSync(directory), false);
  if (testError !== undefined) throw testError;
});

const ownResultPropertiesContract = "finite batch results use own data properties under inherited accessors";
test(ownResultPropertiesContract, async () => {
  console.log("FINITE_BATCH_OWN_RESULT_PROPERTIES_CONTRACT_EXECUTED");
  const mapping = await import(process.env[mutationModuleKey] ?? sourcePath.href);
  const inheritedDescriptors = Object.fromEntries(
    ["state", "ticket", "consumedSamples"].map((property) => [property, Object.getOwnPropertyDescriptor(Object.prototype, property)])
  );
  let accepted;
  let exhausted;
  try {
    for (const property of ["state", "ticket", "consumedSamples"]) {
      Object.defineProperty(Object.prototype, property, {
        configurable: true,
        get() { return property === "state" ? "hostile" : 99; },
        set() {}
      });
    }
    accepted = mapping.mapUnsigned32SampleBatchToBoundedTicket([12], 7);
    exhausted = mapping.mapUnsigned32SampleBatchToBoundedTicket([UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - 1], UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - 1);
  } finally {
    for (const property of ["state", "ticket", "consumedSamples"]) {
      const descriptor = inheritedDescriptors[property];
      if (descriptor === undefined) delete Object.prototype[property];
      else Object.defineProperty(Object.prototype, property, descriptor);
    }
  }
  assert.deepEqual(accepted, { state: "accepted", ticket: 5, consumedSamples: 1 }, "BATCH_RESULTS_MUST_USE_OWN_DATA_PROPERTIES");
  assert.deepEqual(exhausted, { state: "needs-sample", consumedSamples: 1 });
  assert.equal(Object.isFrozen(accepted), true);
  assert.equal(Object.isFrozen(exhausted), true);
  for (const [result, properties] of [[accepted, ["state", "ticket", "consumedSamples"]], [exhausted, ["state", "consumedSamples"]]]) {
    for (const property of properties) {
      const descriptor = Object.getOwnPropertyDescriptor(result, property);
      assert.deepEqual(
        { writable: descriptor?.writable, enumerable: descriptor?.enumerable, configurable: descriptor?.configurable },
        { writable: false, enumerable: true, configurable: false }
      );
    }
  }
});
test("own-result-properties semantic mutation fails its exact named contract", () => {
  const before = "return frozen({ state: \"accepted\", ticket: mapping.ticket, consumedSamples: index + 1 });\n      }\n      if (mapping.state === \"retry\") continue;\n      return fail();\n    }\n    return frozen({ state: \"needs-sample\", consumedSamples: sampleCount });";
  const after = "const result = {} as { state: \"accepted\"; ticket: number; consumedSamples: number };\n        result.state = \"accepted\";\n        result.ticket = mapping.ticket;\n        result.consumedSamples = index + 1;\n        return frozen(result);\n      }\n      if (mapping.state === \"retry\") continue;\n      return fail();\n    }\n    const result = {} as { state: \"needs-sample\"; consumedSamples: number };\n    result.state = \"needs-sample\";\n    result.consumedSamples = sampleCount;\n    return frozen(result);";
  const original = readFileSync(sourcePath, "utf8");
  assert.equal(original.split(before).length - 1, 1);
  const mutated = original.replace(before, after);
  assert.equal(mutated.split(after).length - 1, 1);
  assert.equal(Buffer.byteLength(mutated) - Buffer.byteLength(original), Buffer.byteLength(after) - Buffer.byteLength(before));
  let directory;
  let testError;
  try {
    directory = mkdtempSync(join(tmpdir(), "draft-table-uint32-sample-batch-own-result-properties-"));
    const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url));
    for (const file of readdirSync(sourceDirectory).filter((file) => file.endsWith(".ts"))) copyFileSync(join(sourceDirectory, file), join(directory, file));
    const mutationPath = join(directory, "uint32-sample-batch.ts");
    writeFileSync(mutationPath, mutated);
    writeFileSync(join(directory, "tsconfig.json"), JSON.stringify({
      compilerOptions: { target: "ES2022", module: "ES2022", moduleResolution: "bundler", strict: true, noEmit: true, allowImportingTsExtensions: true }, include: ["*.ts"]
    }));
    const typecheck = spawnSync(join(fileURLToPath(new URL("../../..", import.meta.url)), "node_modules/.bin/tsc"), ["-p", join(directory, "tsconfig.json")], { encoding: "utf8" });
    assert.equal(typecheck.status, 0, `${typecheck.stdout}\n${typecheck.stderr}`);
    const environment = { ...process.env, [mutationModuleKey]: pathToFileURL(mutationPath).href };
    delete environment.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, [
      "--experimental-strip-types", "--test", "--test-name-pattern", `^${ownResultPropertiesContract.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`, fileURLToPath(import.meta.url)
    ], { encoding: "utf8", env: environment });
    const lines = result.stdout.split(/\r?\n/u);
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(lines.filter((line) => line === "# FINITE_BATCH_OWN_RESULT_PROPERTIES_CONTRACT_EXECUTED").length, 1);
    assert.equal(lines.filter((line) => /^not ok \d+ - /u.test(line) && line.replace(/^not ok \d+ - /u, "") === ownResultPropertiesContract).length, 1);
    assert.equal(lines.filter((line) => line.includes("BATCH_RESULTS_MUST_USE_OWN_DATA_PROPERTIES")).length, 1);
  } catch (error) {
    testError = error;
  } finally {
    if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  }
  assert.equal(directory === undefined ? false : existsSync(directory), false);
  if (testError !== undefined) throw testError;
});

test("captured-defineProperty semantic mutation fails its exact named contract", () => {
  const before = "defineOwnDataProperty(sampleSnapshot, index, {";
  const after = "Object.defineProperty(sampleSnapshot, index, {";
  const original = readFileSync(sourcePath, "utf8");
  assert.equal(original.split(before).length - 1, 1);
  const mutated = original.replace(before, after);
  assert.equal(mutated.split(after).length - 1, 1);
  assert.equal(Buffer.byteLength(mutated) - Buffer.byteLength(original), Buffer.byteLength(after) - Buffer.byteLength(before));
  let directory;
  let testError;
  try {
    directory = mkdtempSync(join(tmpdir(), "draft-table-uint32-sample-batch-captured-define-"));
    const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url));
    for (const file of readdirSync(sourceDirectory).filter((file) => file.endsWith(".ts"))) copyFileSync(join(sourceDirectory, file), join(directory, file));
    const mutationPath = join(directory, "uint32-sample-batch.ts");
    writeFileSync(mutationPath, mutated);
    writeFileSync(join(directory, "tsconfig.json"), JSON.stringify({
      compilerOptions: { target: "ES2022", module: "ES2022", moduleResolution: "bundler", strict: true, noEmit: true, allowImportingTsExtensions: true }, include: ["*.ts"]
    }));
    const typecheck = spawnSync(join(fileURLToPath(new URL("../../..", import.meta.url)), "node_modules/.bin/tsc"), ["-p", join(directory, "tsconfig.json")], { encoding: "utf8" });
    assert.equal(typecheck.status, 0, `${typecheck.stdout}\n${typecheck.stderr}`);
    const environment = { ...process.env, [mutationModuleKey]: pathToFileURL(mutationPath).href };
    delete environment.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, [
      "--experimental-strip-types", "--test", "--test-name-pattern", `^${capturedDefinePropertyContract.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`, fileURLToPath(import.meta.url)
    ], { encoding: "utf8", env: environment });
    const lines = result.stdout.split(/\r?\n/u);
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(lines.filter((line) => line === "# FINITE_BATCH_CAPTURED_DEFINE_PROPERTY_CONTRACT_EXECUTED").length, 1);
    assert.equal(lines.filter((line) => /^not ok \d+ - /u.test(line) && line.replace(/^not ok \d+ - /u, "") === capturedDefinePropertyContract).length, 1);
    assert.equal(lines.filter((line) => line.includes("CAPTURED_DEFINE_PROPERTY_MUST_PRESERVE_EXACT_TICKET")).length, 1);
  } catch (error) {
    testError = error;
  } finally {
    if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  }
  assert.equal(directory === undefined ? false : existsSync(directory), false);
  if (testError !== undefined) throw testError;
});

test("captured-freeze semantic mutation fails its exact named contract", () => {
  const before = "const frozen = <Value>(value: Value): Readonly<Value> => freeze(value);";
  const after = "const frozen = <Value>(value: Value): Readonly<Value> => Object.freeze(value);";
  const original = readFileSync(sourcePath, "utf8");
  assert.equal(original.split(before).length - 1, 1);
  const mutated = original.replace(before, after);
  assert.equal(mutated.split(after).length - 1, 1);
  assert.equal(Buffer.byteLength(mutated) - Buffer.byteLength(original), Buffer.byteLength(after) - Buffer.byteLength(before));
  let directory;
  let testError;
  try {
    directory = mkdtempSync(join(tmpdir(), "draft-table-uint32-sample-batch-captured-freeze-"));
    const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url));
    for (const file of readdirSync(sourceDirectory).filter((file) => file.endsWith(".ts"))) copyFileSync(join(sourceDirectory, file), join(directory, file));
    const mutationPath = join(directory, "uint32-sample-batch.ts");
    writeFileSync(mutationPath, mutated);
    writeFileSync(join(directory, "tsconfig.json"), JSON.stringify({
      compilerOptions: { target: "ES2022", module: "ES2022", moduleResolution: "bundler", strict: true, noEmit: true, allowImportingTsExtensions: true }, include: ["*.ts"]
    }));
    const typecheck = spawnSync(join(fileURLToPath(new URL("../../..", import.meta.url)), "node_modules/.bin/tsc"), ["-p", join(directory, "tsconfig.json")], { encoding: "utf8" });
    assert.equal(typecheck.status, 0, `${typecheck.stdout}\n${typecheck.stderr}`);
    const environment = { ...process.env, [mutationModuleKey]: pathToFileURL(mutationPath).href };
    delete environment.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, [
      "--experimental-strip-types", "--test", "--test-name-pattern", `^${capturedFreezeContract.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`, fileURLToPath(import.meta.url)
    ], { encoding: "utf8", env: environment });
    const lines = result.stdout.split(/\r?\n/u);
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(lines.filter((line) => line === "# FINITE_BATCH_CAPTURED_FREEZE_CONTRACT_EXECUTED").length, 1);
    assert.equal(lines.filter((line) => /^not ok \d+ - /u.test(line) && line.replace(/^not ok \d+ - /u, "") === capturedFreezeContract).length, 1);
    assert.equal(lines.filter((line) => line.includes("FORGED_MAPPER_TICKET_MUST_BE_REJECTED")).length, 1);
  } catch (error) {
    testError = error;
  } finally {
    if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  }
  assert.equal(directory === undefined ? false : existsSync(directory), false);
  if (testError !== undefined) throw testError;
});

test("mapper-result-validation semantic mutation fails its exact named contract", () => {
  const before = "mapUnsigned32SampleToBoundedTicket(samples[index], inputs[1]), samples[index], inputs[1]";
  const after = "frozen({ state: \"accepted\", sample: samples[index], ticketBound: inputs[1], sampleDomainExclusiveEnd: UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END, acceptedSampleExclusiveEnd: UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END % inputs[1], ticket: 3 }), samples[index], inputs[1]";
  const original = readFileSync(sourcePath, "utf8");
  assert.equal(original.split(before).length - 1, 1);
  const mutated = original.replace(before, after);
  assert.equal(mutated.split(after).length - 1, 1);
  assert.equal(Buffer.byteLength(mutated) - Buffer.byteLength(original), Buffer.byteLength(after) - Buffer.byteLength(before));
  let directory;
  let testError;
  try {
    directory = mkdtempSync(join(tmpdir(), "draft-table-uint32-sample-batch-mapper-validation-"));
    const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url));
    for (const file of readdirSync(sourceDirectory).filter((file) => file.endsWith(".ts"))) copyFileSync(join(sourceDirectory, file), join(directory, file));
    const mutationPath = join(directory, "uint32-sample-batch.ts");
    writeFileSync(mutationPath, mutated);
    writeFileSync(join(directory, "tsconfig.json"), JSON.stringify({
      compilerOptions: { target: "ES2022", module: "ES2022", moduleResolution: "bundler", strict: true, noEmit: true, allowImportingTsExtensions: true }, include: ["*.ts"]
    }));
    const typecheck = spawnSync(join(fileURLToPath(new URL("../../..", import.meta.url)), "node_modules/.bin/tsc"), ["-p", join(directory, "tsconfig.json")], { encoding: "utf8" });
    assert.equal(typecheck.status, 0, `${typecheck.stdout}\n${typecheck.stderr}`);
    const environment = { ...process.env, [mutationModuleKey]: pathToFileURL(mutationPath).href };
    delete environment.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, [
      "--experimental-strip-types", "--test", "--test-name-pattern", `^${capturedFreezeContract.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`, fileURLToPath(import.meta.url)
    ], { encoding: "utf8", env: environment });
    const lines = result.stdout.split(/\r?\n/u);
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(lines.filter((line) => line === "# FINITE_BATCH_CAPTURED_FREEZE_CONTRACT_EXECUTED").length, 1);
    assert.equal(lines.filter((line) => /^not ok \d+ - /u.test(line) && line.replace(/^not ok \d+ - /u, "") === capturedFreezeContract).length, 1);
    assert.equal(lines.filter((line) => line.includes("FORGED_MAPPER_TICKET_MUST_BE_REJECTED")).length, 1);
  } catch (error) {
    testError = error;
  } finally {
    if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  }
  assert.equal(directory === undefined ? false : existsSync(directory), false);
  if (testError !== undefined) throw testError;
});
