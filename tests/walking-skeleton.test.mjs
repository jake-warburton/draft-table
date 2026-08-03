import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("..", import.meta.url);
const fromRoot = (path) => new URL(path, root);

test("the browser shell identifies Draft Table as an unofficial walking skeleton", () => {
  const html = readFileSync(fromRoot("apps/web/index.html"), "utf8");

  assert.match(html, /<title>Draft Table<\/title>/);
  assert.match(html, /<h1>Draft Table<\/h1>/);
  assert.match(html, /unofficial/i);
  assert.match(html, /walking skeleton/i);
  assert.match(html, /<main[^>]*>/);
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
