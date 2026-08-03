import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const root = new URL("..", import.meta.url);
const fromRoot = (path) => new URL(path, root);

const runSizeReport = (clientDirectory) =>
  spawnSync("node", ["scripts/bundle-size.mjs"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, BUNDLE_SIZE_CLIENT_DIR: clientDirectory }
  });

const writeClientShell = (directory, bytes) => {
  for (const file of ["index.html", "styles.css", "main.js"]) {
    writeFileSync(join(directory, file), "x".repeat(bytes[file] ?? 0));
  }
};

test("the browser shell identifies Draft Table as an unofficial walking skeleton without playable behavior", () => {
  const html = readFileSync(fromRoot("apps/web/index.html"), "utf8");
  const source = readFileSync(fromRoot("apps/web/src/main.ts"), "utf8");

  assert.match(html, /<title>Draft Table<\/title>/);
  assert.match(html, /<h1>Draft Table<\/h1>/);
  assert.match(html, /unofficial/i);
  assert.match(html, /walking skeleton/i);
  assert.match(html, /No playable draft behavior exists yet\./);
  assert.match(html, /<main[^>]*>/);
  assert.doesNotMatch(html, /hello world/i);
  assert.doesNotMatch(source, /textContent\s*=/);
});

test("the bundle-size report deterministically accepts the 2,048-byte client ceiling and rejects overflow", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "draft-table-size-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  writeClientShell(directory, { "index.html": 1024, "styles.css": 1024, "main.js": 0 });
  const atCeiling = runSizeReport(directory);
  assert.equal(atCeiling.status, 0, atCeiling.stderr);
  assert.match(atCeiling.stdout, /Client bundle: 2048 bytes/);
  assert.match(atCeiling.stdout, /Server bundle: 0 bytes \(not yet emitted; boundary typechecked only\)/);

  mkdirSync(join(directory, "assets"));
  writeFileSync(join(directory, "assets", "extra.js"), "x");
  const overCeiling = runSizeReport(directory);
  assert.notEqual(overCeiling.status, 0);
  assert.match(overCeiling.stdout, /Client bundle: 2049 bytes/);
  assert.match(overCeiling.stderr, /exceeds 2048-byte ceiling/);
});

test("CI validates pull requests and main with read-only permissions and the quality commands", () => {
  const workflow = readFileSync(fromRoot(".github/workflows/ci.yml"), "utf8");

  assert.match(workflow, /^\s*pull_request:\s*$/m);
  assert.match(workflow, /^\s*push:\s*\n\s*branches:\s*\[main\]/m);
  assert.match(workflow, /^permissions:\s*\n\s*contents:\s*read\s*$/m);
  assert.match(workflow, /node-version:\s*22/);
  assert.match(workflow, /cache:\s*npm/);
  for (const command of ["npm ci", "npm run build", "npm run typecheck", "npm run lint", "npm test", "npm run size"]) {
    assert.match(workflow, new RegExp(command.replace(" ", "\\s+")));
  }
});

test("the approved workspaces build without product implementations", () => {
  for (const workspace of [
    "apps/web",
    "apps/server",
    "packages/engine",
    "packages/contracts",
    "packages/set-omens"
  ]) {
    assert.ok(existsSync(fromRoot(`${workspace}/package.json`)), `${workspace} has a package manifest`);
  }

  execFileSync("npm", ["run", "build"], { cwd: root, stdio: "pipe" });
  assert.ok(existsSync(fromRoot("apps/web/dist/index.html")), "the browser shell is built");
});
