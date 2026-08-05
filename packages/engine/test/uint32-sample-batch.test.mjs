import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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
});

const mutationModuleKey = "DRAFT_TABLE_TEST_UINT32_SAMPLE_BATCH_MODULE";
const sourcePath = new URL("../src/uint32-sample-batch.ts", import.meta.url);
const exactTestNamePattern = (name) => `^${name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`;
const withCanonicalSnapshot = (action) => {
  let directory;
  try {
    directory = mkdtempSync(join(tmpdir(), "draft-table-uint32-sample-batch-mutation-"));
    const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url));
    for (const file of readdirSync(sourceDirectory).filter((file) => file.endsWith(".ts"))) copyFileSync(join(sourceDirectory, file), join(directory, file));
    writeFileSync(join(directory, "tsconfig.json"), JSON.stringify({
      compilerOptions: { target: "ES2022", module: "ES2022", moduleResolution: "bundler", strict: true, noEmit: true, allowImportingTsExtensions: true },
      include: ["*.ts"]
    }));
    return action(directory);
  } finally {
    if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  }
};
const loadMutationModule = () => import(process.env[mutationModuleKey] ?? sourcePath.href);
const runMutation = (mutated, contractName, marker, failure) => withCanonicalSnapshot((directory) => {
  const mutationPath = join(directory, "uint32-sample-batch.ts");
  writeFileSync(mutationPath, mutated);
  const typecheck = spawnSync(join(fileURLToPath(new URL("../../..", import.meta.url)), "node_modules/.bin/tsc"), ["-p", join(directory, "tsconfig.json")], { encoding: "utf8" });
  assert.equal(typecheck.status, 0, `${typecheck.stdout}\n${typecheck.stderr}`);
  const environment = { ...process.env, [mutationModuleKey]: pathToFileURL(mutationPath).href };
  delete environment.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, [
    "--experimental-strip-types", "--test", "--test-name-pattern", exactTestNamePattern(contractName), fileURLToPath(import.meta.url)
  ], { encoding: "utf8", env: environment });
  const lines = result.stdout.split(/\r?\n/u);
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.equal(lines.filter((line) => line === `# ${marker}`).length, 1);
  assert.equal(lines.filter((line) => /^not ok \d+ - /u.test(line) && line.replace(/^not ok \d+ - /u, "") === contractName).length, 1);
  assert.equal(lines.filter((line) => line.includes(failure)).length, 1);
});

const retryFallbackContract = "finite batch retry does not fallback to ticket zero";
test(retryFallbackContract, async () => {
  console.log("FINITE_BATCH_RETRY_CONTRACT_EXECUTED");
  const mapping = await loadMutationModule();
  assert.deepEqual(mapping.mapUnsigned32SampleBatchToBoundedTicket([UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - 1, 12], 7), { state: "accepted", ticket: 5, consumedSamples: 2 }, "RETRY_MUST_CONTINUE_TO_NEXT_SUPPLIED_SAMPLE");
});
test("retry-fallback semantic mutation fails its exact named contract", () => {
  const original = readFileSync(sourcePath, "utf8");
  const mutated = original.replace(
    "if (mapping.state === \"retry\") continue;",
    "if (mapping.state === \"retry\") return frozen({ state: \"accepted\", ticket: 0, consumedSamples: index + 1 });"
  );
  assert.notEqual(mutated, original);
  runMutation(mutated, retryFallbackContract, "FINITE_BATCH_RETRY_CONTRACT_EXECUTED", "RETRY_MUST_CONTINUE_TO_NEXT_SUPPLIED_SAMPLE");
});

const firstAcceptanceContract = "finite batch stops at first acceptance";
test(firstAcceptanceContract, async () => {
  console.log("FINITE_BATCH_FIRST_ACCEPTANCE_CONTRACT_EXECUTED");
  const mapping = await loadMutationModule();
  assert.deepEqual(mapping.mapUnsigned32SampleBatchToBoundedTicket([12, 13], 7), { state: "accepted", ticket: 5, consumedSamples: 1 }, "FIRST_ACCEPTANCE_MUST_STOP_SELECTION");
});
test("first-acceptance semantic mutation fails its exact named contract", () => {
  const original = readFileSync(sourcePath, "utf8");
  const mutated = original.replace(
    "if (mapping.state === \"accepted\") return frozen({\n        state: \"accepted\", ticket: mapping.ticket, consumedSamples: index + 1\n      });",
    "if (mapping.state === \"accepted\") {\n        frozen({\n          state: \"accepted\", ticket: mapping.ticket, consumedSamples: index + 1\n        });\n        continue;\n      }"
  );
  assert.notEqual(mutated, original);
  runMutation(mutated, firstAcceptanceContract, "FINITE_BATCH_FIRST_ACCEPTANCE_CONTRACT_EXECUTED", "FIRST_ACCEPTANCE_MUST_STOP_SELECTION");
});

const consumedCountContract = "finite batch reports exact consumed count";
test(consumedCountContract, async () => {
  console.log("FINITE_BATCH_CONSUMED_COUNT_CONTRACT_EXECUTED");
  const mapping = await loadMutationModule();
  assert.deepEqual(mapping.mapUnsigned32SampleBatchToBoundedTicket([UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - 1, 12], 7), { state: "accepted", ticket: 5, consumedSamples: 2 }, "CONSUMED_COUNT_MUST_BE_ONE_BASED");
});
test("consumed-count semantic mutation fails its exact named contract", () => {
  const original = readFileSync(sourcePath, "utf8");
  const mutated = original.replace(
    "consumedSamples: index + 1",
    "consumedSamples: index"
  );
  assert.notEqual(mutated, original);
  runMutation(mutated, consumedCountContract, "FINITE_BATCH_CONSUMED_COUNT_CONTRACT_EXECUTED", "CONSUMED_COUNT_MUST_BE_ONE_BASED");
});

test("mutation snapshots are file-local OS-temp canonical copies and always clean", () => {
  let snapshot;
  withCanonicalSnapshot((directory) => { snapshot = directory; assert.ok(directory.startsWith(tmpdir())); });
  assert.equal(existsSync(snapshot), false);
  let failed;
  assert.throws(() => withCanonicalSnapshot((directory) => { failed = directory; throw new Error("body"); }));
  assert.equal(existsSync(failed), false);
});
