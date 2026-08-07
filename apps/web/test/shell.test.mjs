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
const FABRARY_ORIGIN = "https://fabrary.net";

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
  for (const id of ["pack", "status", "pool", "pool-grouping", "pool-count", "round", "pick", "restart", "drafting-heading", "review-heading", "review-pack", "continue", "export", "export-link", "export-list", "export-copy", "export-status"]) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
  assert.match(html, /<span id="review-heading" hidden>Pack <span id="review-pack">1<\/span> review<\/span>/,
    "the review phase is a real heading, as the accessibility notes require");
});

test("the Fabrary hand-off is honest about what it cannot do", () => {
  const html = read("index.html");
  assert.match(html, /<section id="export"[^>]*hidden>/, "nothing to export until the draft finishes");
  assert.match(html, /sign in and choose a hero yourself/i, "the sign-in limit is stated rather than implied");
  assert.match(html, /never sees your Fabrary account/i);
  assert.match(html, /If that opens empty, copy this list/i, "the fallback is offered, not hidden");
  for (const link of html.matchAll(/<a [^>]*href="https:\/\/fabrary\.net[^"]*"[^>]*>/gu)) {
    assert.match(link[0], /rel="noopener noreferrer"/, link[0]);
    assert.match(link[0], /target="_blank"/, link[0]);
  }
});

test("the export never opens a connection of its own", () => {
  const source = read("src/fabrary.ts");
  assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|WebSocket|graphql/i, "no private Fabrary endpoint is called");
  assert.match(source, /DT-7/, "the decision that governs this is named where it is implemented");
});

test("the stylesheet keeps visible focus, reduced motion, and a phone layout", () => {
  const css = read("styles.css");
  assert.match(css, /:focus-visible/);
  assert.match(css, /section\s*{\s*padding:\s*1rem/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /scroll-behavior:\s*auto\s*!important/);
  assert.match(css, /@media \(max-width:\s*42rem\)[\s\S]*main\s*{\s*padding:\s*1rem/);
  assert.match(css, /@media \(max-width:\s*42rem\)[\s\S]*\.card\s*{\s*min-height:\s*4rem/);
});

test("the stylesheet deals the pack five to a row and stacks the pool into piles", () => {
  const css = read("styles.css");
  assert.match(css, /\.cards\s*{[^}]*grid-template-columns:\s*repeat\(5,\s*1fr\)/,
    "a fresh fourteen-card pack reads as rows of five, five, and four");
  assert.match(css, /\.pool-card\s*\+\s*\.pool-card\s*{[^}]*margin-top:\s*-125\.9%/,
    "each drafted card overlaps all but the top tenth of the one before it");
  assert.match(css, /\.pool-card\s*{[^}]*aspect-ratio:\s*376\s*\/\s*526/,
    "a card whose art never arrives keeps its place in the pile");
  assert.match(css, /\.pool-card img\[hidden\]\s*\+\s*\.card-name\s*{[^}]*position:\s*static/,
    "the text name returns when the art fails");
});

test("the client makes no scripted request and hard-codes no card material", () => {
  const surfaces = [read("index.html"), read("styles.css"), ...clientSources].join("\n");
  assert.doesNotMatch(surfaces, /fetch\(|XMLHttpRequest|WebSocket/);
  const origins = new Set([...surfaces.matchAll(/https?:\/\/[^\s"');/]+/gu)].map((match) => match[0]));
  assert.deepEqual([...origins].sort(), [FABRARY_ORIGIN, IMAGE_ORIGIN].sort(),
    "card art and the Fabrary hand-off are the only origins the client names");
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
