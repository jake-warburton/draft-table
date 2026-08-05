import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { exactTestNamePattern } from "./recipe-layout-pool-resolution-test-name.mjs";
import { assertPackLocalInitialProjectionMatchesCompiledTables } from "./pack-local-pool-draw-state-evidence-assertions.mjs";

const runner = fileURLToPath(new URL("./pack-local-pool-draw-state-evidence-command.mjs", import.meta.url));
const variables = ["OMENS_RECIPE_EVIDENCE_PATH", "FAB_CARD_SOURCE_EVIDENCE_PATH", "FAB_CARD_SCHEMA_EVIDENCE_PATH", "FAB_CARD_VAULT_EVIDENCE_PATH"];
const contractName = "four checksum-verified caller-held sources enforce pack-local same-pool removal across every identity-pool entry";
const marker = "PACK_LOCAL_POOL_DRAW_STATE_CONTRACT_EXECUTED";
const bytes = variables.map((_, index) => `synthetic pack local pool draw state command bytes ${index}`);
const passing = `
import assert from "node:assert/strict"; import { createHash } from "node:crypto"; import { readFileSync } from "node:fs"; import test from "node:test";
const variables=${JSON.stringify(variables)}, expected=${JSON.stringify(bytes)}, available=variables.every((variable)=>Boolean(process.env[variable]));
test(${JSON.stringify(contractName)}, { skip: !available ? "missing" : false }, () => { assert.equal(process.env.NODE_TEST_CONTEXT.startsWith("child-v"), true); for (const [index, variable] of variables.entries()) assert.equal(createHash("sha256").update(readFileSync(process.env[variable])).digest("hex"), createHash("sha256").update(expected[index]).digest("hex")); console.log(${JSON.stringify(marker)}); });
`;
const run = (contract = passing, options = {}) => {
  const directory = mkdtempSync(join(tmpdir(), "draft-table-pack-local-pool-draw-state-command-")), testDirectory = join(directory, "test"); mkdirSync(testDirectory);
  writeFileSync(join(testDirectory, "probe.pack-local-pool-draw-state-evidence.test.mjs"), contract);
  const environment = { ...process.env, NODE_TEST_CONTEXT: "synthetic-parent-context" };
  for (const [index, variable] of variables.entries()) { const path = join(directory, variable); writeFileSync(path, bytes[index]); environment[variable] = path; }
  if (options.missing) delete environment[options.missing]; if (options.unreadable) environment[options.unreadable] = join(directory, "missing");
  if (options.swap) [environment[variables[0]], environment[variables[1]]] = [environment[variables[1]], environment[variables[0]]];
  try { return spawnSync(process.execPath, [runner, ...(options.args ?? [])], { cwd: directory, encoding: "utf8", env: environment }); }
  finally { rmSync(directory, { recursive: true, force: true }); }
};
const rejected = (result) => { assert.notEqual(result.status, 0); assert.equal(result.stdout, ""); assert.equal(result.stderr, "Pack local pool draw state acceptance failed.\n"); };

test("pack-local draw-state command rejects every missing unreadable or checksum-wrong evidence variable", () => {
  for (const variable of variables) { rejected(run(passing, { missing: variable })); rejected(run(passing, { unreadable: variable })); }
  rejected(run(passing, { swap: true }));
});
test("pack-local draw-state command rejects usage errors nonexecution arbitrary failure and duplicate execution", () => {
  rejected(run(passing, { args: ["unexpected"] }));
  rejected(run(`import test from "node:test"; test(${JSON.stringify(contractName)}, { skip: true }, () => {});`));
  rejected(run(passing.replace(contractName, `prefix ${contractName}`)));
  rejected(run(passing.replace(marker, "WRONG_PACK_LOCAL_POOL_DRAW_STATE_MARKER")));
  rejected(run(passing.replace(`console.log(${JSON.stringify(marker)});`, `console.log(${JSON.stringify(marker)}); process.exitCode = 29;`)));
  rejected(run(`${passing}\ntest("unrelated failure", () => { throw new Error("unrelated"); });`));
  rejected(run(`${passing}\ntest(${JSON.stringify(contractName)}, () => console.log(${JSON.stringify(marker)}));`));
  rejected(run(passing.replace(`console.log(${JSON.stringify(marker)});`, `console.log(${JSON.stringify(marker)}); console.log(${JSON.stringify(marker)});`)));
});
const poolAggregates = [
  ["Wizard", 24, 159], ["Illusionist", 24, 160], ["Runeblade", 24, 164], ["Lightning", 42, 227],
  ["Generic", 6, 28], ["Equipment", 14, 148], ["Rare", 60, 120], ["Majestic", 15, 30],
  ["Rfcommon", 105, 105], ["RFRare", 59, 59], ["RFMajestic", 7, 7]
];
const projectionFixture = () => {
  const poolTables = poolAggregates.map(([sourcePoolLabel, count, total]) => {
    const poolReference = { sourcePoolLabel }, base = Math.floor(total / count), remainder = total % count;
    let cumulativeExclusiveEnd = 0;
    const officialIdentityChoices = Array.from({ length: count }, (_, index) => {
      const weight = base + (index < remainder ? 1 : 0); cumulativeExclusiveEnd += weight;
      return { officialIdentityReference: { sourcePoolLabel, index }, weight, cumulativeExclusiveEnd };
    });
    return { poolReference, poolTotalWeight: total, officialIdentityChoices };
  });
  const poolStates = poolTables.map((table) => ({
    poolReference: table.poolReference, poolTotalWeight: table.poolTotalWeight,
    officialIdentityChoices: table.officialIdentityChoices.map((choice) => ({ ...choice }))
  }));
  return { tables: { poolTables }, initial: { poolStates } };
};
const recompile = (choices) => {
  let cumulativeExclusiveEnd = 0;
  return choices.map((choice) => ({ ...choice, cumulativeExclusiveEnd: cumulativeExclusiveEnd += choice.weight }));
};

test("pack-local evidence initialization rejects source-order and source-weight swaps with unchanged aggregates", () => {
  const order = projectionFixture();
  [order.initial.poolStates[0].officialIdentityChoices[0], order.initial.poolStates[0].officialIdentityChoices[1]] = [order.initial.poolStates[0].officialIdentityChoices[1], order.initial.poolStates[0].officialIdentityChoices[0]];
  order.initial.poolStates[0].officialIdentityChoices = recompile(order.initial.poolStates[0].officialIdentityChoices);
  assert.throws(() => assertPackLocalInitialProjectionMatchesCompiledTables(order.tables, order.initial));

  const weights = projectionFixture(), choices = weights.initial.poolStates[0].officialIdentityChoices, last = choices.length - 1;
  [choices[0].weight, choices[last].weight] = [choices[last].weight, choices[0].weight];
  weights.initial.poolStates[0].officialIdentityChoices = recompile(choices);
  assert.throws(() => assertPackLocalInitialProjectionMatchesCompiledTables(weights.tables, weights.initial));
});

test("pack-local evidence source comparison cannot be removed or delayed until after removals", () => {
  const path = fileURLToPath(new URL("./pack-local-pool-draw-state.pack-local-pool-draw-state-evidence.test.mjs", import.meta.url));
  const source = readFileSync(path, "utf8"), invocation = "  assertPackLocalInitialProjectionMatchesCompiledTables(tables, initial);", removal = "      const next = removeOmensPackLocalPoolOfficialIdentity";
  const requiresPreRemovalComparison = (candidate) => {
    assert.equal(candidate.split(invocation).length - 1, 1);
    assert.ok(candidate.indexOf(invocation) < candidate.indexOf(removal));
  };
  requiresPreRemovalComparison(source);
  assert.throws(() => requiresPreRemovalComparison(source.replace(invocation, "")));
  const delayed = source.replace(invocation, "").replace("  assert.ok(crossPoolOverlapCount > 0);", `${invocation}\n  assert.ok(crossPoolOverlapCount > 0);`);
  assert.throws(() => requiresPreRemovalComparison(delayed));
});

test("pack-local draw-state exact targeting escapes regex metacharacters", () => {
  const directory = mkdtempSync(join(tmpdir(), "draft-table-pack-local-pool-draw-state-pattern-")), fictionalName = "fictional [pack] (state)+ contract?", path = join(directory, "pattern.test.mjs");
  writeFileSync(path, `import test from "node:test"; test(${JSON.stringify(fictionalName)}, () => console.log("FICTIONAL_CONTRACT_EXECUTED")); test(${JSON.stringify(`prefix ${fictionalName}`)}, () => {});`);
  try {
    const environment = { ...process.env }; delete environment.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ["--test", "--test-name-pattern", exactTestNamePattern(fictionalName), path], { encoding: "utf8", env: environment });
    assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /^# FICTIONAL_CONTRACT_EXECUTED$/mu); assert.match(result.stdout, /^# tests 1$/mu); assert.match(result.stdout, /^# pass 1$/mu); assert.match(result.stdout, /^# skipped 0$/mu); assert.doesNotMatch(result.stdout, /^ok \d+ - prefix /mu);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test("pack-local draw-state command sanitizes inherited context and prints only its exact success marker", () => {
  const result = run(); assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout, "pack local pool draw state acceptance passed\n"); assert.equal(result.stderr, "");
});
