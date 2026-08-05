import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const app = new URL("../", import.meta.url);
const file = (name) => fileURLToPath(new URL(name, app));

class Element {
  constructor() { this.children = []; this.attributes = {}; this.disabled = false; this.focused = false; }
  append(child) { this.children.push(child); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = value; }
  focus() { this.focused = true; }
  get firstChild() { return this.children[0]; }
}

const loadShell = async () => {
  const nodes = Object.fromEntries(["pack", "status", "picks", "round"].map((id) => [id, new Element()]));
  globalThis.document = { querySelector: (selector) => nodes[selector.slice(1)], createElement: () => new Element() };
  await import(`data:text/javascript,${encodeURIComponent(`${readFileSync(file("main.js"), "utf8")}\n//${Math.random()}`)}`);
  return nodes;
};

test("initial fixture render provides named native pick controls and a live status", async () => {
  const { pack, status, round } = await loadShell();
  assert.equal(round.textContent, 1);
  assert.equal(pack.children.length, 3);
  assert.match(status.textContent, /Choose one card/);
  assert.ok(pack.children.every((card) => card.ariaLabel.startsWith("Pick ")));
});

test("a click picks one card, removes its pack, and advances deterministically", async () => {
  const { pack, picks, round } = await loadShell();
  const chosen = pack.firstChild;
  chosen.onclick();
  assert.equal(chosen.disabled, true);
  assert.equal(picks.children[0].textContent, "Ash");
  assert.equal(round.textContent, 2);
  assert.equal(pack.children.some((card) => card.textContent === "Ash"), false);
});

test("keyboard activation has the same native-button pick result", async () => {
  const { pack, picks } = await loadShell();
  pack.children[1].onclick(); // Native Enter/Space activation dispatches click for a button.
  assert.equal(picks.children[0].textContent, "Gale");
});

test("a reload starts a fresh deterministic walkthrough", async () => {
  const first = await loadShell();
  first.pack.firstChild.onclick();
  const reloaded = await loadShell();
  assert.equal(reloaded.round.textContent, 1);
  assert.equal(reloaded.picks.children.length, 0);
  assert.equal(reloaded.pack.firstChild.textContent, "Ash");
});

test("stale and double card activation cannot add a second pick", async () => {
  const { pack, picks } = await loadShell();
  const stale = pack.firstChild;
  stale.onclick();
  stale.onclick();
  assert.equal(picks.children.length, 1);
});

test("three fixture packs repeat for the second seat in deterministic order", async () => {
  const { pack, picks, round, status } = await loadShell();
  for (let pick = 0; pick < 3; pick += 1) pack.firstChild.onclick();
  assert.equal(picks.children.length, 3);
  assert.equal(round.textContent, 1);
  assert.match(status.textContent, /Seat 2, fixture pack 1/);
});

test("the sixth fixture pick completes the two-seat walkthrough and moves focus to the status", async () => {
  const { pack, picks, status } = await loadShell();
  for (let pick = 0; pick < 6; pick += 1) pack.firstChild.onclick();
  assert.equal(picks.children.length, 6);
  assert.equal(pack.children.length, 0);
  assert.match(status.textContent, /Draft complete/);
  assert.equal(status.focused, true);
});

test("the static shell has labelled regions, visible focus, reduced motion, no network, and no app imports", () => {
  const html = readFileSync(file("index.html"), "utf8");
  const css = readFileSync(file("styles.css"), "utf8");
  const js = readFileSync(file("main.js"), "utf8");
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /aria-label="Cards in fixture pack"/);
  assert.match(html, /aria-label="Picked cards"/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.doesNotMatch(`${html}\n${css}\n${js}`, /fetch\(|XMLHttpRequest|https?:\/\//);
  assert.doesNotMatch(js, /^\s*import\s/m);
});

test("the static build is deterministic, inline-only, and does not emit an external app module", () => {
  execFileSync("node", ["scripts/build-static.mjs"], { cwd: file(""), stdio: "pipe" });
  const first = readFileSync(file("dist/index.html"), "utf8");
  execFileSync("node", ["scripts/build-static.mjs"], { cwd: file(""), stdio: "pipe" });
  assert.equal(readFileSync(file("dist/index.html"), "utf8"), first);
  assert.match(first, /<script type="module">/);
  assert.doesNotMatch(first, /src="\.\/main\.js"/);
  rmSync(file("dist"), { recursive: true, force: true });
});
