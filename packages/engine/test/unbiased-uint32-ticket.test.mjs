import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
import { mapExactIntegerSampleToBoundedTicketForTest } from "../src/unbiased-uint32-ticket.ts";

const safe = (action) => assert.throws(action, (error) => {
  assert.ok(error instanceof UnbiasedUint32TicketMappingError);
  assert.equal(error.code, "UNBIASED_UINT_TICKET_MAPPING_FAILED");
  assert.equal(error.message, "Unbiased uint32 ticket mapping failed.");
  assert.equal(error.stack, "UnbiasedUint32TicketMappingError: Unbiased uint32 ticket mapping failed.");
  assert.deepEqual(JSON.parse(JSON.stringify(error)), {
    name: "UnbiasedUint32TicketMappingError",
    code: "UNBIASED_UINT_TICKET_MAPPING_FAILED"
  });
  assert.doesNotMatch(error.message, /0\.5|NaN|Infinity|4294967296|9007199254740992|https?:|\\|\//i);
  return true;
});

const expectedCutoff = (sampleDomainExclusiveEnd, ticketBound) =>
  sampleDomainExclusiveEnd - sampleDomainExclusiveEnd % ticketBound;

const assertMapping = (result, { state, sample, ticketBound, sampleDomainExclusiveEnd, ticket }) => {
  assert.ok(Object.isFrozen(result));
  assert.deepEqual(Object.keys(result).sort(), [
    "acceptedSampleExclusiveEnd", "sample", "sampleDomainExclusiveEnd", "state", "ticketBound",
    ...(state === "accepted" ? ["ticket"] : [])
  ].sort());
  assert.equal(result.state, state);
  assert.equal(result.sample, sample);
  assert.equal(result.ticketBound, ticketBound);
  assert.equal(result.sampleDomainExclusiveEnd, sampleDomainExclusiveEnd);
  assert.equal(result.acceptedSampleExclusiveEnd, expectedCutoff(sampleDomainExclusiveEnd, ticketBound));
  if (state === "accepted") assert.equal(result.ticket, ticket);
};

test("a generic exact-domain test seam exhaustively partitions its half-open sample domain into equal ticket preimages and a retry tail", () => {
  const sampleDomainExclusiveEnd = 11;
  for (let ticketBound = 1; ticketBound <= sampleDomainExclusiveEnd; ticketBound++) {
    const acceptedSampleExclusiveEnd = expectedCutoff(sampleDomainExclusiveEnd, ticketBound);
    const ticketCounts = Array.from({ length: ticketBound }, () => 0);
    const retrySamples = [];
    for (let sample = 0; sample < sampleDomainExclusiveEnd; sample++) {
      const result = mapExactIntegerSampleToBoundedTicketForTest(sample, ticketBound, sampleDomainExclusiveEnd);
      assert.equal(result.acceptedSampleExclusiveEnd, acceptedSampleExclusiveEnd);
      if (sample < acceptedSampleExclusiveEnd) {
        assert.equal(result.state, "accepted");
        assert.equal(result.ticket, sample % ticketBound);
        assert.ok(result.ticket >= 0 && result.ticket < ticketBound);
        ticketCounts[result.ticket]++;
      } else {
        assert.equal(result.state, "retry");
        retrySamples.push(sample);
      }
    }
    assert.equal(acceptedSampleExclusiveEnd % ticketBound, 0);
    assert.equal(acceptedSampleExclusiveEnd + retrySamples.length, sampleDomainExclusiveEnd);
    assert.equal(retrySamples.length, sampleDomainExclusiveEnd % ticketBound);
    assert.ok(retrySamples.length < ticketBound);
    assert.deepEqual(retrySamples, Array.from({ length: retrySamples.length }, (_, index) => acceptedSampleExclusiveEnd + index));
    assert.ok(ticketCounts.every((count) => count === acceptedSampleExclusiveEnd / ticketBound));
  }
});

test("uint32 mapping names the 2^32 domain, exact bound, accepted prefix, and half-open result states at every boundary", () => {
  assert.equal(UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END, 4_294_967_296);
  for (const ticketBound of [1, 2, 3, 7, 460_800, 4_294_967_295, 4_294_967_296]) {
    const acceptedSampleExclusiveEnd = expectedCutoff(UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END, ticketBound);
    const samples = new Set([0, UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - 1]);
    if (acceptedSampleExclusiveEnd > 0) samples.add(acceptedSampleExclusiveEnd - 1);
    if (acceptedSampleExclusiveEnd < UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END) samples.add(acceptedSampleExclusiveEnd);
    for (const sample of samples) {
      const accepted = sample < acceptedSampleExclusiveEnd;
      const result = mapUnsigned32SampleToBoundedTicket(sample, ticketBound);
      assertMapping(result, {
        state: accepted ? "accepted" : "retry",
        sample,
        ticketBound,
        sampleDomainExclusiveEnd: UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END,
        ticket: accepted ? sample % ticketBound : undefined
      });
    }
    assert.equal(acceptedSampleExclusiveEnd % ticketBound, 0);
    assert.equal(acceptedSampleExclusiveEnd + (UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - acceptedSampleExclusiveEnd), UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END);
    assert.ok(UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - acceptedSampleExclusiveEnd < ticketBound);
  }
});

test("uint32 mapping preserves the bound-one zero ticket and the bound-2^32 uint32 ticket without signed coercion", () => {
  for (const sample of [0, 1, 2_147_483_648, 4_294_967_295]) {
    assertMapping(mapUnsigned32SampleToBoundedTicket(sample, 1), {
      state: "accepted", sample, ticketBound: 1, sampleDomainExclusiveEnd: UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END, ticket: 0
    });
    assertMapping(mapUnsigned32SampleToBoundedTicket(sample, UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END), {
      state: "accepted", sample, ticketBound: UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END,
      sampleDomainExclusiveEnd: UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END, ticket: sample
    });
  }
});

test("uint32 mapping rejects every invalid sample, bound, arity, and generic-domain input with one safe engine error", () => {
  const invalidSamples = [-1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, 4_294_967_296, "0", null, undefined];
  const invalidBounds = [-1, 0, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, 4_294_967_297, "1", null, undefined];
  for (const sample of invalidSamples) safe(() => mapUnsigned32SampleToBoundedTicket(sample, 1));
  for (const ticketBound of invalidBounds) safe(() => mapUnsigned32SampleToBoundedTicket(0, ticketBound));
  safe(() => mapUnsigned32SampleToBoundedTicket());
  safe(() => mapUnsigned32SampleToBoundedTicket(0, 1, "override"));
  for (const inputs of [[0, 1, 0], [0, 1, 1.5], [0, 1, NaN], [0, 1, Infinity], [0, 13, 12], [0, 0, 11], [11, 1, 11]]) {
    safe(() => mapExactIntegerSampleToBoundedTicketForTest(...inputs));
  }
});

test("uint32 mapping returns fresh deeply immutable deterministic one-sample results", () => {
  const first = mapUnsigned32SampleToBoundedTicket(12, 7);
  const second = mapUnsigned32SampleToBoundedTicket(12, 7);
  assert.notEqual(first, second);
  assert.deepEqual(first, second);
  assert.ok(Object.isFrozen(first));
  assert.throws(() => { first.ticketBound = 1; }, TypeError);
  const retry = mapUnsigned32SampleToBoundedTicket(4_294_967_295, 4_294_967_295);
  assert.equal(retry.state, "retry");
  assert.ok(Object.isFrozen(retry));
  assert.throws(() => { retry.state = "accepted"; }, TypeError);
});

test("accepted uint32 arithmetic has a divisible prefix, exact retry tail, and tickets only in the explicit half-open ticket range", () => {
  for (const ticketBound of [1, 2, 3, 7, 460_800, 4_294_967_295, 4_294_967_296]) {
    const acceptedSampleExclusiveEnd = expectedCutoff(UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END, ticketBound);
    assert.equal(acceptedSampleExclusiveEnd % ticketBound, 0);
    assert.equal(acceptedSampleExclusiveEnd + (UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - acceptedSampleExclusiveEnd), UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END);
    assert.ok(UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - acceptedSampleExclusiveEnd < ticketBound);
    for (const sample of new Set([0, acceptedSampleExclusiveEnd - 1, acceptedSampleExclusiveEnd, UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END - 1])) {
      if (sample < 0 || sample >= UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END) continue;
      const result = mapUnsigned32SampleToBoundedTicket(sample, ticketBound);
      if (result.state === "accepted") assert.ok(result.ticket >= 0 && result.ticket < ticketBound);
    }
  }
});

test("mapping source has no random source, hidden retry loop, numeric bitwise coercion, or import-time output", () => {
  const sourcePath = new URL("../src/unbiased-uint32-ticket.ts", import.meta.url);
  const source = readFileSync(sourcePath, "utf8");
  assert.doesNotMatch(source, /Math\.random|crypto|randomBytes|randomUUID|while\s*\(|for\s*\(|\|\s*0|>>>\s*0|>>\s*0|<<\s*0|console\.|process\./u);
  const program = `import ${JSON.stringify(sourcePath.href)};`;
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", program], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

test("external runtime consumers receive only the supported platform-independent engine root", () => {
  const directory = mkdtempSync(join(tmpdir(), "draft-table-engine-consumer-"));
  const packageDirectory = fileURLToPath(new URL("..", import.meta.url));
  const packageLink = join(directory, "node_modules", "@draft-table", "engine");
  try {
    mkdirSync(dirname(packageLink), { recursive: true });
    symlinkSync(packageDirectory, packageLink, "dir");
    writeFileSync(join(directory, "consumer.mjs"), 'import { UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END, UnbiasedUint32TicketMappingError, mapUnsigned32SampleBatchToBoundedTicket, mapUnsigned32SampleToBoundedTicket } from "@draft-table/engine";\nconsole.log(UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END, typeof UnbiasedUint32TicketMappingError, typeof mapUnsigned32SampleBatchToBoundedTicket, typeof mapUnsigned32SampleToBoundedTicket);');
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "consumer.mjs"], { cwd: directory, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "4294967296 function function function");
    writeFileSync(join(directory, "internal-consumer.mjs"), 'import "@draft-table/engine/src/unbiased-uint32-ticket.ts";');
    const internal = spawnSync(process.execPath, ["--experimental-strip-types", "internal-consumer.mjs"], { cwd: directory, encoding: "utf8" });
    assert.notEqual(internal.status, 0);
    assert.match(internal.stderr, /ERR_PACKAGE_PATH_NOT_EXPORTED/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

const mutationModuleKey = "DRAFT_TABLE_TEST_UNBIASED_UINT32_TICKET_MODULE";
const sourcePath = new URL("../src/unbiased-uint32-ticket.ts", import.meta.url);
const exactTestNamePattern = (name) => `^${name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`;

const capturedMapperFreezeContract = "one-sample mapper uses its captured freeze intrinsic";
test(capturedMapperFreezeContract, async () => {
  console.log("ONE_SAMPLE_CAPTURED_FREEZE_CONTRACT_EXECUTED");
  const mapping = await import(process.env[mutationModuleKey] ?? sourcePath.href);
  const originalFreeze = Object.freeze;
  let calls = 0;
  let result;
  try {
    Object.freeze = (value) => ++calls === 1 ? { state: "accepted", ticket: 3 } : value;
    result = mapping.mapUnsigned32SampleToBoundedTicket(7, 10);
  } finally {
    Object.freeze = originalFreeze;
  }
  assert.deepEqual(result, {
    state: "accepted",
    sample: 7,
    ticketBound: 10,
    sampleDomainExclusiveEnd: UINT32_SAMPLE_DOMAIN_EXCLUSIVE_END,
    acceptedSampleExclusiveEnd: 4_294_967_290,
    ticket: 7
  }, "ONE_SAMPLE_CAPTURED_FREEZE_MUST_PRESERVE_EXACT_MAPPING");
  assert.equal(Object.isFrozen(result), true);
});

test("one-sample captured-freeze semantic mutation fails its exact named contract", () => {
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
    directory = mkdtempSync(join(tmpdir(), "draft-table-unbiased-uint32-ticket-captured-freeze-"));
    const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url));
    for (const file of readdirSync(sourceDirectory).filter((file) => file.endsWith(".ts"))) copyFileSync(join(sourceDirectory, file), join(directory, file));
    const mutationPath = join(directory, "unbiased-uint32-ticket.ts");
    writeFileSync(mutationPath, mutated);
    writeFileSync(join(directory, "tsconfig.json"), JSON.stringify({
      compilerOptions: { target: "ES2022", module: "ES2022", moduleResolution: "bundler", strict: true, noEmit: true, allowImportingTsExtensions: true }, include: ["*.ts"]
    }));
    const typecheck = spawnSync(join(fileURLToPath(new URL("../../..", import.meta.url)), "node_modules/.bin/tsc"), ["-p", join(directory, "tsconfig.json")], { encoding: "utf8" });
    assert.equal(typecheck.status, 0, `${typecheck.stdout}\n${typecheck.stderr}`);
    const environment = { ...process.env, [mutationModuleKey]: pathToFileURL(mutationPath).href };
    delete environment.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, [
      "--experimental-strip-types", "--test", "--test-name-pattern", exactTestNamePattern(capturedMapperFreezeContract), fileURLToPath(import.meta.url)
    ], { encoding: "utf8", env: environment });
    const lines = result.stdout.split(/\r?\n/u);
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(lines.filter((line) => line === "# ONE_SAMPLE_CAPTURED_FREEZE_CONTRACT_EXECUTED").length, 1);
    assert.equal(lines.filter((line) => /^not ok \d+ - /u.test(line) && line.replace(/^not ok \d+ - /u, "") === capturedMapperFreezeContract).length, 1);
    assert.equal(lines.filter((line) => line.includes("ONE_SAMPLE_CAPTURED_FREEZE_MUST_PRESERVE_EXACT_MAPPING")).length, 1);
  } catch (error) {
    testError = error;
  } finally {
    if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  }
  assert.equal(directory === undefined ? false : existsSync(directory), false);
  if (testError !== undefined) throw testError;
});
const capturedErrorDefinePropertyContract = "one-sample mapper uses its captured defineProperty for stable errors";
test(capturedErrorDefinePropertyContract, async () => {
  console.log("ONE_SAMPLE_CAPTURED_DEFINE_PROPERTY_CONTRACT_EXECUTED");
  const mapping = await import(process.env[mutationModuleKey] ?? `${sourcePath.href}?captured-error-define-property`);
  const originalDefineProperty = Object.defineProperty;
  let hostileCalls = 0;
  let error;
  try {
    Object.defineProperty = (target) => { hostileCalls++; return target; };
    try {
      mapping.mapUnsigned32SampleToBoundedTicket(-1, 10);
    } catch (caught) {
      error = caught;
    }
  } finally {
    Object.defineProperty = originalDefineProperty;
  }
  assert.equal(hostileCalls, 0, "CAPTURED_DEFINE_PROPERTY_MUST_AVOID_LIVE_INTRINSIC");
  assert.ok(error instanceof mapping.UnbiasedUint32TicketMappingError, "CAPTURED_ERROR_MUST_REMAIN_INSTANCEOF");
  assert.equal(Object.getOwnPropertyDescriptor(error, "code")?.value, "UNBIASED_UINT_TICKET_MAPPING_FAILED");
  assert.equal(Object.getOwnPropertyDescriptor(error, "name")?.value, "UnbiasedUint32TicketMappingError");
  assert.equal(Object.getOwnPropertyDescriptor(error, "message")?.value, "Unbiased uint32 ticket mapping failed.");
  assert.equal(Object.getOwnPropertyDescriptor(error, "stack")?.value, "UnbiasedUint32TicketMappingError: Unbiased uint32 ticket mapping failed.");
  assert.deepEqual(JSON.parse(JSON.stringify(error)), {
    name: "UnbiasedUint32TicketMappingError",
    code: "UNBIASED_UINT_TICKET_MAPPING_FAILED"
  });
});

test("one-sample captured-defineProperty semantic mutation fails its exact named contract", () => {
  const anchor = "defineProperty(this, \"code\", {";
  const replacement = "Object.defineProperty(this, \"code\", {";
  const original = readFileSync(sourcePath, "utf8");
  assert.equal(original.split(anchor).length - 1, 1);
  const mutated = original.replace(anchor, replacement);
  assert.notEqual(mutated, original);
  assert.equal(mutated.split(replacement).length - 1, 1);
  assert.equal(Buffer.byteLength(mutated) - Buffer.byteLength(original), Buffer.byteLength(replacement) - Buffer.byteLength(anchor));
  let directory;
  let testError;
  try {
    directory = mkdtempSync(join(tmpdir(), "draft-table-unbiased-captured-define-property-"));
    const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url));
    for (const file of readdirSync(sourceDirectory).filter((file) => file.endsWith(".ts"))) copyFileSync(join(sourceDirectory, file), join(directory, file));
    const mutationPath = join(directory, "unbiased-uint32-ticket.ts");
    writeFileSync(mutationPath, mutated);
    assert.equal(readdirSync(directory).filter((file) => file.endsWith(".ts")).length, readdirSync(sourceDirectory).filter((file) => file.endsWith(".ts")).length);
    writeFileSync(join(directory, "tsconfig.json"), JSON.stringify({
      compilerOptions: { target: "ES2022", module: "ES2022", moduleResolution: "bundler", strict: true, noEmit: true, allowImportingTsExtensions: true }, include: ["*.ts"]
    }));
    const typecheck = spawnSync(join(fileURLToPath(new URL("../../..", import.meta.url)), "node_modules/.bin/tsc"), ["-p", join(directory, "tsconfig.json")], { encoding: "utf8" });
    assert.equal(typecheck.status, 0, `${typecheck.stdout}\n${typecheck.stderr}`);
    const environment = { ...process.env, [mutationModuleKey]: pathToFileURL(mutationPath).href };
    delete environment.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, [
      "--experimental-strip-types", "--test", "--test-name-pattern", exactTestNamePattern(capturedErrorDefinePropertyContract), fileURLToPath(import.meta.url)
    ], { encoding: "utf8", env: environment });
    const lines = result.stdout.split(/\r?\n/u);
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(lines.filter((line) => line === "# ONE_SAMPLE_CAPTURED_DEFINE_PROPERTY_CONTRACT_EXECUTED").length, 1);
    assert.equal(lines.filter((line) => /^not ok \d+ - /u.test(line) && line.replace(/^not ok \d+ - /u, "") === capturedErrorDefinePropertyContract).length, 1);
    assert.equal(lines.filter((line) => line.includes("CAPTURED_DEFINE_PROPERTY_MUST_AVOID_LIVE_INTRINSIC")).length, 1);
  } catch (error) {
    testError = error;
  } finally {
    if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  }
  assert.equal(directory === undefined ? false : existsSync(directory), false);
  if (testError !== undefined) throw testError;
});

const ownErrorFieldsContract = "mapping errors define stable own fields despite inherited setters";
test(ownErrorFieldsContract, async () => {
  console.log("ERROR_OWN_FIELDS_CONTRACT_EXECUTED");
  const inheritedName = Object.getOwnPropertyDescriptor(Error.prototype, "name");
  let mapping;
  let error;
  try {
    Object.defineProperty(Error.prototype, "name", {
      configurable: true,
      get: () => "Error",
      set: () => { throw new Error("hostile inherited name setter"); }
    });
    mapping = await import(process.env[mutationModuleKey] ?? `${sourcePath.href}?own-error-fields`);
    error = new mapping.UnbiasedUint32TicketMappingError();
  } catch (caught) {
    error = caught;
  } finally {
    if (inheritedName === undefined) delete Error.prototype.name;
    else Object.defineProperty(Error.prototype, "name", inheritedName);
  }
  assert.ok(error instanceof mapping.UnbiasedUint32TicketMappingError, "ERROR_FIELDS_MUST_BYPASS_INHERITED_SETTERS");
  assert.equal(error.code, "UNBIASED_UINT_TICKET_MAPPING_FAILED");
  assert.equal(error.name, "UnbiasedUint32TicketMappingError");
  assert.equal(error.message, "Unbiased uint32 ticket mapping failed.");
  assert.equal(error.stack, "UnbiasedUint32TicketMappingError: Unbiased uint32 ticket mapping failed.");
  assert.deepEqual(JSON.parse(JSON.stringify(error)), {
    name: "UnbiasedUint32TicketMappingError",
    code: "UNBIASED_UINT_TICKET_MAPPING_FAILED"
  });
});

test("error-own-fields semantic mutation fails its exact named contract", () => {
  const before = `    defineProperty(this, "code", {
      value: "UNBIASED_UINT_TICKET_MAPPING_FAILED", writable: true, enumerable: true, configurable: true
    });
    defineProperty(this, "name", {
      value: "UnbiasedUint32TicketMappingError", writable: true, enumerable: true, configurable: true
    });
    defineProperty(this, "stack", {
      value: \`${"${this.name}: ${this.message}"}\`, writable: true, enumerable: false, configurable: true
    });`;
  const after = `    this.code = "UNBIASED_UINT_TICKET_MAPPING_FAILED";
    this.name = "UnbiasedUint32TicketMappingError";
    this.stack = \`${"${this.name}: ${this.message}"}\`;`;
  const original = readFileSync(sourcePath, "utf8");
  assert.equal(original.split(before).length - 1, 1);
  const mutated = original.replace(before, after);
  assert.notEqual(mutated, original);
  assert.equal(mutated.split(after).length - 1, 1);
  assert.equal(Buffer.byteLength(mutated) - Buffer.byteLength(original), Buffer.byteLength(after) - Buffer.byteLength(before));
  let directory;
  let testError;
  try {
    directory = mkdtempSync(join(tmpdir(), "draft-table-unbiased-error-own-fields-"));
    const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url));
    for (const file of readdirSync(sourceDirectory).filter((file) => file.endsWith(".ts"))) copyFileSync(join(sourceDirectory, file), join(directory, file));
    const mutationPath = join(directory, "unbiased-uint32-ticket.ts");
    writeFileSync(mutationPath, mutated);
    assert.equal(readdirSync(directory).filter((file) => file.endsWith(".ts")).length, readdirSync(sourceDirectory).filter((file) => file.endsWith(".ts")).length);
    writeFileSync(join(directory, "tsconfig.json"), JSON.stringify({
      compilerOptions: { target: "ES2022", module: "ES2022", moduleResolution: "bundler", strict: true, noEmit: true, allowImportingTsExtensions: true }, include: ["*.ts"]
    }));
    const typecheck = spawnSync(join(fileURLToPath(new URL("../../..", import.meta.url)), "node_modules/.bin/tsc"), ["-p", join(directory, "tsconfig.json")], { encoding: "utf8" });
    assert.equal(typecheck.status, 0, `${typecheck.stdout}\n${typecheck.stderr}`);
    const environment = { ...process.env, [mutationModuleKey]: pathToFileURL(mutationPath).href };
    delete environment.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, [
      "--experimental-strip-types", "--test", "--test-name-pattern", exactTestNamePattern(ownErrorFieldsContract), fileURLToPath(import.meta.url)
    ], { encoding: "utf8", env: environment });
    const lines = result.stdout.split(/\r?\n/u);
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(lines.filter((line) => line === "# ERROR_OWN_FIELDS_CONTRACT_EXECUTED").length, 1);
    assert.equal(lines.filter((line) => /^not ok \d+ - /u.test(line) && line.replace(/^not ok \d+ - /u, "") === ownErrorFieldsContract).length, 1);
    assert.equal(lines.filter((line) => line.includes("ERROR_FIELDS_MUST_BYPASS_INHERITED_SETTERS")).length, 1);
  } catch (error) {
    testError = error;
  } finally {
    if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  }
  assert.equal(directory === undefined ? false : existsSync(directory), false);
  if (testError !== undefined) throw testError;
});

const frozenErrorBoundaryContract = "mapping error constructor and prototype remain frozen and usable";
test(frozenErrorBoundaryContract, async () => {
  console.log("FROZEN_ERROR_BOUNDARY_CONTRACT_EXECUTED");
  const mapping = await import(process.env[mutationModuleKey] ?? `${sourcePath.href}?frozen-error-boundary`);
  let prototypeRejected = false;
  let constructorRejected = false;
  try {
    Object.defineProperty(mapping.UnbiasedUint32TicketMappingError.prototype, "name", {
      configurable: true, get: () => "forged"
    });
  } catch (error) {
    prototypeRejected = error instanceof TypeError;
  }
  try {
    Object.defineProperty(mapping.UnbiasedUint32TicketMappingError, Symbol.hasInstance, {
      configurable: true, value: () => false
    });
  } catch (error) {
    constructorRejected = error instanceof TypeError;
  }
  if (!Object.isFrozen(mapping.UnbiasedUint32TicketMappingError.prototype)) {
    delete mapping.UnbiasedUint32TicketMappingError.prototype.name;
  }
  if (!Object.isFrozen(mapping.UnbiasedUint32TicketMappingError)) {
    delete mapping.UnbiasedUint32TicketMappingError[Symbol.hasInstance];
  }
  const error = new mapping.UnbiasedUint32TicketMappingError();
  assert.ok(
    Object.isFrozen(mapping.UnbiasedUint32TicketMappingError.prototype) &&
      Object.isFrozen(mapping.UnbiasedUint32TicketMappingError) && prototypeRejected && constructorRejected,
    "ERROR_CONSTRUCTOR_AND_PROTOTYPE_MUST_REJECT_POISONING"
  );
  assert.ok(error instanceof mapping.UnbiasedUint32TicketMappingError);
  assert.equal(error.code, "UNBIASED_UINT_TICKET_MAPPING_FAILED");
});

test("error-freeze-boundary semantic mutation fails its exact named contract", () => {
  const before = `freeze(UnbiasedUint32TicketMappingError.prototype);
freeze(UnbiasedUint32TicketMappingError);`;
  const after = `void UnbiasedUint32TicketMappingError.prototype;
void UnbiasedUint32TicketMappingError;`;
  const original = readFileSync(sourcePath, "utf8");
  assert.equal(original.split(before).length - 1, 1);
  const mutated = original.replace(before, after);
  assert.notEqual(mutated, original);
  assert.equal(mutated.split(after).length - 1, 1);
  assert.equal(Buffer.byteLength(mutated) - Buffer.byteLength(original), Buffer.byteLength(after) - Buffer.byteLength(before));
  let directory;
  let testError;
  try {
    directory = mkdtempSync(join(tmpdir(), "draft-table-unbiased-error-freeze-"));
    const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url));
    for (const file of readdirSync(sourceDirectory).filter((file) => file.endsWith(".ts"))) copyFileSync(join(sourceDirectory, file), join(directory, file));
    const mutationPath = join(directory, "unbiased-uint32-ticket.ts");
    writeFileSync(mutationPath, mutated);
    assert.equal(readdirSync(directory).filter((file) => file.endsWith(".ts")).length, readdirSync(sourceDirectory).filter((file) => file.endsWith(".ts")).length);
    writeFileSync(join(directory, "tsconfig.json"), JSON.stringify({
      compilerOptions: { target: "ES2022", module: "ES2022", moduleResolution: "bundler", strict: true, noEmit: true, allowImportingTsExtensions: true }, include: ["*.ts"]
    }));
    const typecheck = spawnSync(join(fileURLToPath(new URL("../../..", import.meta.url)), "node_modules/.bin/tsc"), ["-p", join(directory, "tsconfig.json")], { encoding: "utf8" });
    assert.equal(typecheck.status, 0, `${typecheck.stdout}\n${typecheck.stderr}`);
    const environment = { ...process.env, [mutationModuleKey]: pathToFileURL(mutationPath).href };
    delete environment.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, [
      "--experimental-strip-types", "--test", "--test-name-pattern", exactTestNamePattern(frozenErrorBoundaryContract), fileURLToPath(import.meta.url)
    ], { encoding: "utf8", env: environment });
    const lines = result.stdout.split(/\r?\n/u);
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(lines.filter((line) => line === "# FROZEN_ERROR_BOUNDARY_CONTRACT_EXECUTED").length, 1);
    assert.equal(lines.filter((line) => /^not ok \d+ - /u.test(line) && line.replace(/^not ok \d+ - /u, "") === frozenErrorBoundaryContract).length, 1);
    assert.equal(lines.filter((line) => line.includes("ERROR_CONSTRUCTOR_AND_PROTOTYPE_MUST_REJECT_POISONING")).length, 1);
  } catch (error) {
    testError = error;
  } finally {
    if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  }
  assert.equal(directory === undefined ? false : existsSync(directory), false);
  if (testError !== undefined) throw testError;
});

const withCanonicalSnapshot = (action) => {
  let directory;
  try {
    directory = mkdtempSync(join(tmpdir(), "draft-table-unbiased-uint32-ticket-mutation-"));
    const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url));
    for (const file of readdirSync(sourceDirectory).filter((file) => file.endsWith(".ts"))) copyFileSync(join(sourceDirectory, file), join(directory, file));
    return action(directory);
  } finally {
    if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  }
};
const loadMutationModule = () => import(process.env[mutationModuleKey] ?? sourcePath.href);
const runMutation = (mutated, contractName, marker, failure) => withCanonicalSnapshot((directory) => {
  const mutationPath = join(directory, "unbiased-uint32-ticket.ts");
  writeFileSync(mutationPath, mutated);
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

const rejectionCutoffContract = "rejection cutoff owns prevention of modulo bias", rejectionCutoffMarker = "REJECTION_CUTOFF_CONTRACT_EXECUTED";
test(rejectionCutoffContract, async () => {
  console.log(rejectionCutoffMarker);
  const mapping = await loadMutationModule();
  const result = mapping.mapExactIntegerSampleToBoundedTicketForTest(6, 6, 10);
  assert.equal(result.state, "retry", "REJECTION_CUTOFF_PREVENTS_MODULO_BIAS");
});
test("rejection-cutoff semantic mutation fails its exact named contract", () => {
  const original = readFileSync(sourcePath, "utf8");
  const mutated = original
    .replace(
      "const acceptedSampleExclusiveEnd = sampleDomainExclusiveEnd - sampleDomainExclusiveEnd % ticketBound;",
      "const acceptedSampleExclusiveEnd = sampleDomainExclusiveEnd;"
    )
    .replace("acceptedSampleExclusiveEnd % ticketBound !== 0", "false");
  assert.notEqual(mutated, original);
  runMutation(mutated, rejectionCutoffContract, rejectionCutoffMarker, "REJECTION_CUTOFF_PREVENTS_MODULO_BIAS");
});

const strictCutoffContract = "rejection cutoff uses a strict exclusive boundary", strictCutoffMarker = "STRICT_CUTOFF_CONTRACT_EXECUTED";
test(strictCutoffContract, async () => {
  console.log(strictCutoffMarker);
  const mapping = await loadMutationModule();
  const result = mapping.mapExactIntegerSampleToBoundedTicketForTest(6, 6, 10);
  assert.equal(result.state, "retry", "ACCEPTED_PREFIX_IS_HALF_OPEN_AT_CUTOFF");
});
test("inclusive-cutoff semantic mutation fails its exact named contract", () => {
  const original = readFileSync(sourcePath, "utf8");
  const mutated = original.replace("if (sample < acceptedSampleExclusiveEnd)", "if (sample <= acceptedSampleExclusiveEnd)");
  assert.notEqual(mutated, original);
  runMutation(mutated, strictCutoffContract, strictCutoffMarker, "ACCEPTED_PREFIX_IS_HALF_OPEN_AT_CUTOFF");
});

const signedCoercionContract = "uint32 tickets retain the unsigned high-bit sample without signed bitwise coercion", signedCoercionMarker = "UNSIGNED_HIGH_BIT_CONTRACT_EXECUTED";
test(signedCoercionContract, async () => {
  console.log(signedCoercionMarker);
  const mapping = await loadMutationModule();
  const result = mapping.mapUnsigned32SampleToBoundedTicket(2_147_483_648, 4_294_967_296);
  assert.equal(result.ticket, 2_147_483_648, "SIGNED_BITWISE_COERCION_MUST_NOT_CHANGE_UINT32_SAMPLE");
});
test("signed-bitwise semantic mutation fails its exact named contract", () => {
  const original = readFileSync(sourcePath, "utf8");
  const mutated = original.replace("ticket: sample % ticketBound", "ticket: (sample | 0) % ticketBound");
  assert.notEqual(mutated, original);
  runMutation(mutated, signedCoercionContract, signedCoercionMarker, "SIGNED_BITWISE_COERCION_MUST_NOT_CHANGE_UINT32_SAMPLE");
});

test("mutation snapshots are file-local OS-temp canonical copies and always clean", () => {
  let snapshot;
  withCanonicalSnapshot((directory) => { snapshot = directory; assert.ok(directory.startsWith(tmpdir())); });
  assert.equal(existsSync(snapshot), false);
  let failed;
  assert.throws(() => withCanonicalSnapshot((directory) => { failed = directory; throw new Error("body"); }));
  assert.equal(existsSync(failed), false);
});
