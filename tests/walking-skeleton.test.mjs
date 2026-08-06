import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import test from "node:test";

const root = new URL("..", import.meta.url);
const fromRoot = (path) => new URL(path, root);

const runSizeReport = () =>
  spawnSync("node", ["scripts/bundle-size.mjs"], {
    cwd: root,
    encoding: "utf8"
  });

test("the browser shell permanently identifies Draft Table as unofficial and non-affiliated", () => {
  const html = readFileSync(fromRoot("apps/web/index.html"), "utf8");

  assert.match(html, /unofficial/i);
  assert.match(html, /not affiliated with Legend Story Studios/i);
});

test("the browser shell identifies a real bot draft dealt from the reviewed snapshot", () => {
  const html = readFileSync(fromRoot("apps/web/index.html"), "utf8");

  assert.match(html, /<title>Draft Table<\/title>/);
  assert.match(html, /<h1>Draft Table<\/h1>/);
  assert.match(html, /three-round draft against bots/i);
  assert.match(html, /reviewed Omens set snapshot/i);
  assert.match(html, /card images are served by Legend Story Studios/i);
  assert.match(html, /<main[^>]*>/);
  assert.doesNotMatch(html, /hello world/i);
  assert.doesNotMatch(html, /invented fixtures|placeholder/i);
  assert.doesNotMatch(html, /main\.js/);
});

test("the bundle-size report measures completed built output rather than source and permits large output", (t) => {
  const dist = fromRoot("apps/web/dist");
  t.after(() => rmSync(dist, { recursive: true, force: true }));

  execFileSync("npm", ["run", "build"], { cwd: root, stdio: "pipe" });
  const sourceBytes = ["index.html", "styles.css", "src/main.ts", "src/table.ts", "src/cards.ts"]
    .map((name) => statSync(fromRoot(`apps/web/${name}`)).size)
    .reduce((total, bytes) => total + bytes, 0);
  const builtBytes = ["index.html", "styles.css"]
    .map((name) => statSync(fromRoot(`apps/web/dist/${name}`)).size)
    .reduce((total, bytes) => total + bytes, 0);
  assert.notEqual(sourceBytes, builtBytes, "readable source must be distinguishable from built output");

  writeFileSync(
    fromRoot("apps/web/dist/index.html"),
    `${readFileSync(fromRoot("apps/web/dist/index.html"), "utf8")}${"x".repeat(Math.max(0, 2049 - builtBytes))}`
  );
  const largeBuiltBytes = ["index.html", "styles.css"]
    .map((name) => statSync(fromRoot(`apps/web/dist/${name}`)).size)
    .reduce((total, bytes) => total + bytes, 0);
  const report = runSizeReport();
  assert.equal(report.status, 0, report.stderr);
  assert.match(
    report.stdout,
    new RegExp(`Client bundle: ${largeBuiltBytes} bytes \\(apps/web/dist/index\\.html, apps/web/dist/styles\\.css\\)`)
  );
  assert.doesNotMatch(report.stdout, new RegExp(`Client bundle: ${sourceBytes} bytes`));
  assert.match(report.stdout, /Server bundle: 0 bytes \(not yet emitted; boundary typechecked only\)/);
});

test("the bundle-size report rejects missing expected built artifacts", (t) => {
  const dist = fromRoot("apps/web/dist");
  t.after(() => rmSync(dist, { recursive: true, force: true }));

  execFileSync("npm", ["run", "build"], { cwd: root, stdio: "pipe" });
  rmSync(fromRoot("apps/web/dist/styles.css"));
  const missingOutput = runSizeReport();
  assert.notEqual(missingOutput.status, 0);
  assert.match(missingOutput.stderr, /Built client output is incomplete: missing apps\/web\/dist\/styles\.css\./);
});

test("CI validates pull requests and main with read-only permissions and the quality commands", () => {
  const workflow = readFileSync(fromRoot(".github/workflows/ci.yml"), "utf8");

  assert.match(workflow, /^\s*pull_request:\s*$/m);
  assert.match(workflow, /^\s*push:\s*\n\s*branches:\s*\[main\]/m);
  assert.match(workflow, /^permissions:\s*\n\s*contents:\s*read\s*$/m);
  assert.match(workflow, /^\s*node-version:\s*22\s*$/m);
  assert.match(workflow, /cache:\s*npm/);
  for (const command of ["npm ci", "npm run build", "npm run typecheck", "npm run lint", "npm test", "npm run size"]) {
    const whitespaceFlexibleCommand = command.split(" ").join("\\s+");
    assert.match(workflow, new RegExp(`^\\s*-\\s+run:\\s*${whitespaceFlexibleCommand}\\s*$`, "m"));
  }
});

test("every approved workspace builds and the client emits only referenced artifacts", (t) => {
  t.after(() => rmSync(fromRoot("apps/web/dist"), { recursive: true, force: true }));

  for (const workspace of [
    "apps/web",
    "apps/server",
    "packages/draft",
    "packages/engine",
    "packages/contracts",
    "packages/set-omens"
  ]) {
    assert.ok(existsSync(fromRoot(`${workspace}/package.json`)), `${workspace} has a package manifest`);
  }

  const staleOutput = fromRoot("apps/web/dist/stale-output.js");
  mkdirSync(fromRoot("apps/web/dist"), { recursive: true });
  writeFileSync(staleOutput, "stale");

  execFileSync("npm", ["run", "build"], { cwd: root, stdio: "pipe" });
  assert.ok(existsSync(fromRoot("apps/web/dist/index.html")), "the browser shell is built");
  assert.ok(existsSync(fromRoot("apps/web/dist/styles.css")), "the browser stylesheet is built");
  assert.ok(!existsSync(fromRoot("apps/web/dist/main.js")), "no unreferenced browser JavaScript is emitted");
  assert.ok(!existsSync(staleOutput), "the web build removes stale output before emitting");
});
