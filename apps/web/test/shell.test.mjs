import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const app = new URL("../", import.meta.url);
const file = (name) => fileURLToPath(new URL(name, app));
const read = (name) => readFileSync(file(name), "utf8");

const clientSources = readdirSync(file("src"))
  .filter((name) => name.endsWith(".ts"))
  .map((name) => read(`src/${name}`));

const IMAGE_ORIGIN = "https://legendstory-production-s3-public.s3.amazonaws.com";

test("the shell states exactly what card material it uses and where images come from", () => {
  const html = read("index.html");
  assert.match(html, /not affiliated with Legend Story Studios/i);
  assert.match(html, /reviewed Omens set snapshot/i);
  assert.match(html, /real collation weights/i);
  assert.match(html, /card images are served by Legend Story Studios/i);
  assert.doesNotMatch(html, /invented fixtures|placeholder/i, "the shell no longer deals invented material");
});

test("the shell blocks every origin except the one official image host", () => {
  const html = read("index.html");
  const policy = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html);
  assert.ok(policy !== null, "the shell must carry a content security policy");
  const directives = new Map(policy[1].split(";").map((part) => {
    const [name, ...values] = part.trim().split(/\s+/u);
    return [name, values.join(" ")];
  }));
  assert.equal(directives.get("default-src"), "'none'", "nothing loads unless it is named");
  assert.equal(directives.get("img-src"), IMAGE_ORIGIN, "images come from exactly one pinned origin");
  assert.equal(directives.get("connect-src"), "'none'", "the client opens no connection of its own");
  assert.equal(directives.get("base-uri"), "'none'");
  assert.equal(directives.get("form-action"), "'none'");
});

test("the shell sends no referrer to the image host", () => {
  assert.match(read("index.html"), /<meta name="referrer" content="no-referrer">/);
});

test("the shell keeps labelled regions and one live status region", () => {
  const html = read("index.html");
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /aria-label="Cards in the current pack"/);
  assert.match(html, /aria-label="Cards you have drafted"/);
  assert.match(html, /aria-labelledby="pack-title"/);
  assert.match(html, /aria-labelledby="pool-title"/);
  for (const id of ["pack", "status", "pool", "pool-count", "round", "pick", "restart"]) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
});

test("the stylesheet keeps visible focus, reduced motion, and a phone layout", () => {
  const css = read("styles.css");
  assert.match(css, /:focus-visible/);
  assert.match(css, /section\s*{\s*padding:\s*1rem/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /scroll-behavior:\s*auto\s*!important/);
  assert.match(css, /@media \(max-width:\s*42rem\)[\s\S]*main\s*{\s*padding:\s*1rem/);
  assert.match(css, /@media \(max-width:\s*42rem\)[\s\S]*button\s*{\s*min-height:\s*4rem/);
});

test("the client makes no scripted request and hard-codes no card material", () => {
  const surfaces = [read("index.html"), read("styles.css"), ...clientSources].join("\n");
  assert.doesNotMatch(surfaces, /fetch\(|XMLHttpRequest|WebSocket/);
  const origins = new Set([...surfaces.matchAll(/https?:\/\/[^\s"');/]+/gu)].map((match) => match[0]));
  assert.deepEqual([...origins], [IMAGE_ORIGIN], "the image host is the only origin the client names");
});

test("images degrade to text rather than leaving a card unreadable", () => {
  const source = read("src/main.ts");
  assert.match(source, /onerror/, "a card whose image fails must not stay blank");
  assert.match(source, /loading", "lazy"|loading="lazy"/);
  assert.match(source, /referrerpolicy/i);
  assert.match(source, /alt", ""|alt=""/, "the visible name is the accessible name, so art is decorative");
});

test("readable client source stays separate from the built artifact", () => {
  assert.ok(clientSources.length >= 3, "the client is split into readable modules");
  assert.match(read("src/main.ts"), /const render = /);
  assert.match(read("src/table.ts"), /export const chooseCard = /);
  assert.match(read("src/cards.ts"), /export const buildPack = /);
  assert.doesNotMatch(read("src/cards.ts"), /PLACEHOLDER/, "the invented catalogue is gone");
  assert.match(read("index.html"), /<!--app-->/, "the build inlines the client at this placeholder");
});
