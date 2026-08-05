import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

test("the browser shell identifies current fixture-only playability and deferred integration", () => {
  const html = readFileSync(fromRoot("apps/web/index.html"), "utf8");

  assert.match(html, /<title>Draft Table<\/title>/);
  assert.match(html, /<h1>Draft Table<\/h1>/);
  assert.match(html, /Playable with invented fixtures only/i);
  assert.match(html, /engine\/set-omens integration comes later/i);
  assert.match(html, /<main[^>]*>/);
  assert.doesNotMatch(html, /hello world/i);
  assert.doesNotMatch(html, /main\.js/);
});

test("the bundle-size report deterministically accepts the 2,048-byte client ceiling and rejects overflow", (t) => {
  const dist = fromRoot("apps/web/dist");
  t.after(() => rmSync(dist, { recursive: true, force: true }));

  execFileSync("npm", ["run", "build"], { cwd: root, stdio: "pipe" });
  const atCeiling = runSizeReport();
  assert.equal(atCeiling.status, 0, atCeiling.stderr);
  assert.match(atCeiling.stdout, /Client bundle: 2043 bytes \(apps\/web\/dist\/index\.html, apps\/web\/dist\/styles\.css\)/);
  assert.match(atCeiling.stdout, /Server bundle: 0 bytes \(not yet emitted; boundary typechecked only\)/);

  appendFileSync(fromRoot("apps/web/dist/styles.css"), "123456");
  const overCeiling = runSizeReport();
  assert.notEqual(overCeiling.status, 0);
  assert.match(overCeiling.stdout, /Client bundle: 2049 bytes/);
  assert.match(overCeiling.stderr, /exceeds 2048-byte ceiling/);
});

test("the bundle-size report measures only completed built output and rejects missing artifacts", (t) => {
  const dist = fromRoot("apps/web/dist");
  t.after(() => rmSync(dist, { recursive: true, force: true }));

  execFileSync("npm", ["run", "build"], { cwd: root, stdio: "pipe" });
  const sourceBytes = ["index.html", "styles.css", "main.js"]
    .map((name) => readFileSync(fromRoot(`apps/web/${name}`)).length)
    .reduce((total, bytes) => total + bytes, 0);
  assert.ok(sourceBytes > 2048, "readable source must be distinguishable from built output");

  const completedOutput = runSizeReport();
  assert.equal(completedOutput.status, 0, completedOutput.stderr);
  assert.match(completedOutput.stdout, /Client bundle: \d+ bytes \(apps\/web\/dist\/index\.html, apps\/web\/dist\/styles\.css\)/);

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

test("the approved workspaces build without product implementations", (t) => {
  t.after(() => rmSync(fromRoot("apps/web/dist"), { recursive: true, force: true }));

  for (const workspace of [
    "apps/web",
    "apps/server",
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
