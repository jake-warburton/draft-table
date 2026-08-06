import { cp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

/**
 * Emits the whole browser client as one inline module script.
 *
 * Native multi-file ES modules would need an HTTP origin, and flat concatenation is unsafe because
 * separate workspace modules legitimately declare the same private names. So each module keeps its
 * own scope through a small CommonJS registry, and every specifier is resolved at build time: an
 * unresolvable one fails the build rather than reaching the browser.
 */

const appRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
const repoRoot = resolve(appRoot, "../..");
const distDirectory = resolve(appRoot, "dist");
const entryPath = resolve(appRoot, process.env.DRAFT_TABLE_WEB_ENTRY ?? "src/main.ts");
const workspaceScope = "@draft-table/";
const requirePattern = /require\("((?:[^"\\]|\\.)*)"\)/g;

const moduleId = (absolutePath) => relative(repoRoot, absolutePath).split(sep).join("/");

const workspaceEntry = async (specifier) => {
  const manifestPath = resolve(repoRoot, "node_modules", specifier, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const exported = manifest.exports?.["."];
  if (typeof exported !== "string") throw new Error(`${specifier} does not export a single entry point.`);
  return resolve(dirname(manifestPath), exported);
};

const resolveSpecifier = async (specifier, importer) => {
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    return realpath(resolve(dirname(importer), specifier));
  }
  if (specifier.startsWith(workspaceScope)) return realpath(await workspaceEntry(specifier));
  throw new Error(
    `The browser client cannot bundle "${specifier}", imported by ${moduleId(importer)}. ` +
    "Only relative paths and workspace packages are bundleable."
  );
};

const transpile = (source, fileName) => ts.transpileModule(source, {
  fileName,
  reportDiagnostics: false,
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    newLine: ts.NewLineKind.LineFeed,
    removeComments: true,
    esModuleInterop: false
  }
}).outputText;

const graph = new Map();

const visit = async (absolutePath) => {
  const id = moduleId(absolutePath);
  if (graph.has(id)) return id;
  graph.set(id, null);
  const code = transpile(await readFile(absolutePath, "utf8"), absolutePath);
  const links = {};
  for (const [, specifier] of code.matchAll(requirePattern)) {
    if (links[specifier] !== undefined) continue;
    links[specifier] = await visit(await resolveSpecifier(specifier, absolutePath));
  }
  graph.set(id, { code, links });
  return id;
};

const entryId = await visit(entryPath);

const lines = [
  "(function () {",
  "\"use strict\";",
  "var modules = Object.create(null);",
  "var links = Object.create(null);",
  "var cache = Object.create(null);",
  "function load(id) {",
  "  if (cache[id] !== undefined) return cache[id].exports;",
  "  var loading = { exports: {} };",
  "  cache[id] = loading;",
  "  modules[id](loading, loading.exports, function (specifier) {",
  "    var target = links[id][specifier];",
  "    if (target === undefined) throw new Error(\"Unbundled module: \" + specifier);",
  "    return load(target);",
  "  });",
  "  return loading.exports;",
  "}"
];

for (const id of [...graph.keys()].sort()) {
  const { code, links } = graph.get(id);
  lines.push(`links[${JSON.stringify(id)}] = ${JSON.stringify(links)};`);
  lines.push(`modules[${JSON.stringify(id)}] = function (module, exports, require) {`);
  lines.push(code.trimEnd());
  lines.push("};");
}

lines.push(`load(${JSON.stringify(entryId)});`);
lines.push("})();");

const bundle = lines.join("\n");
if (/<\/script/i.test(bundle)) throw new Error("The bundled client would close its own inline script tag.");

const template = await readFile(resolve(appRoot, "index.html"), "utf8");
if (!template.includes("<!--app-->")) throw new Error("index.html is missing its <!--app--> placeholder.");

await rm(distDirectory, { recursive: true, force: true });
await mkdir(distDirectory, { recursive: true });
await writeFile(
  resolve(distDirectory, "index.html"),
  template.replace("<!--app-->", () => `<script type="module">\n${bundle}\n</script>`)
);
await cp(resolve(appRoot, "styles.css"), resolve(distDirectory, "styles.css"));
