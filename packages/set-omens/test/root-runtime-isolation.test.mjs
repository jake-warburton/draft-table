import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const sourceDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
const extensionCandidates = [".ts", ".mts", ".js", ".mjs"];

const resolveRelativeModule = (from, specifier) => {
  const candidate = resolve(dirname(from), specifier);
  if (existsSync(candidate)) return candidate;
  if (extname(candidate)) throw new Error(`Missing module ${specifier} imported by ${from}`);
  for (const extension of extensionCandidates) {
    if (existsSync(`${candidate}${extension}`)) return `${candidate}${extension}`;
  }
  throw new Error(`Missing module ${specifier} imported by ${from}`);
};

const moduleSpecifiers = (source) => [
  ...source.matchAll(/\b(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g)
].map((match) => match[1]);

const staticGraph = (entrypoint) => {
  const pending = [entrypoint];
  const visited = new Set();
  const external = new Set();
  while (pending.length > 0) {
    const module = pending.pop();
    if (visited.has(module)) continue;
    visited.add(module);
    for (const specifier of moduleSpecifiers(readFileSync(module, "utf8"))) {
      if (!specifier.startsWith(".")) external.add(specifier);
      else pending.push(resolveRelativeModule(module, specifier));
    }
  }
  return { visited, external };
};

test("the root static import graph excludes the engine and Draft-04 schema dependencies", () => {
  const graph = staticGraph(resolve(sourceDirectory, "index.ts"));
  const modules = [...graph.visited].map((path) => path.replace(`${sourceDirectory}/`, ""));

  assert.ok(!modules.includes("public-source-schema-validation.ts"), modules.join("\n"));
  assert.ok(![...graph.external].some((specifier) => specifier === "@draft-table/engine" || specifier === "ajv" || specifier === "ajv-draft-04"), [...graph.external].join("\n"));
});
