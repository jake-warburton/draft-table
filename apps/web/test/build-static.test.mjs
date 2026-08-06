import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const app = new URL("../", import.meta.url);
const file = (name) => fileURLToPath(new URL(name, app));
const IMAGE_ORIGIN = "https://legendstory-production-s3-public.s3.amazonaws.com";

const build = () => execFileSync("node", ["scripts/build-static.mjs"], { cwd: file(""), stdio: "pipe" });
const builtHtml = () => readFileSync(file("dist/index.html"), "utf8");

const bundleOf = (html) => {
  const match = /<script type="module">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(match !== null, "the built page must inline exactly one module script");
  return match[1];
};

const cleanDist = () => rmSync(file("dist"), { recursive: true, force: true });

/** A minimal node whose `textContent` follows the real rule: writing it replaces every child. */
class Element {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.attributes = {};
    this.text = "";
    this.disabled = false;
    this.focused = false;
    this.hidden = false;
  }
  get textContent() { return this.text + this.children.map((child) => child.textContent).join(""); }
  set textContent(value) { this.children = []; this.text = value; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.text = ""; this.children = children; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  focus() { this.focused = true; }
  get firstChild() { return this.children[0]; }
}

/**
 * Builds, then evaluates this repository's own freshly built artifact against a minimal stub of
 * only the DOM surface it uses. The input is the build output produced in this call, never
 * external text. The stub stays installed for the whole test because the client keeps handling
 * activations after its first render.
 */
const openBuiltClient = (t) => {
  const ids = ["pack", "status", "pool", "pool-count", "round", "pick", "restart"];
  const nodes = Object.fromEntries(ids.map((id) => [id, new Element("div")]));
  const previousDocument = globalThis.document;
  globalThis.document = {
    querySelector: (selector) => nodes[selector.slice(1)] ?? null,
    createElement: (tag) => new Element(tag)
  };
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    cleanDist();
  });
  build();
  new Function(bundleOf(builtHtml()))();
  return nodes;
};

test("the build inlines one self-contained module script and copies the stylesheet", (t) => {
  t.after(cleanDist);
  build();

  const html = builtHtml();
  assert.equal(readFileSync(file("dist/styles.css"), "utf8"), readFileSync(file("styles.css"), "utf8"));
  assert.deepEqual(readdirSync(file("dist")).sort(), ["index.html", "styles.css"]);

  const bundle = bundleOf(html);
  assert.doesNotMatch(bundle, /^\s*(?:import|export)\s/m, "no unresolved module syntax may survive");
  assert.doesNotMatch(bundle, /<\/script>/i, "the inline script must not be closable from its own text");
  assert.doesNotMatch(bundle, /fetch\(|XMLHttpRequest|WebSocket/, "the client opens no connection of its own");
  const origins = new Set([...bundle.matchAll(/https?:\/\/[^/"']+/gu)].map((match) => match[0]));
  assert.deepEqual([...origins], [IMAGE_ORIGIN], "images are the only thing the page loads from elsewhere");
});

test("the build is byte-for-byte deterministic and clears stale output", (t) => {
  t.after(cleanDist);
  build();
  const first = builtHtml();
  writeFileSync(file("dist/stale.js"), "stale");
  build();

  assert.equal(builtHtml(), first);
  assert.equal(existsSync(file("dist/stale.js")), false, "stale output must be removed before emitting");
});

test("the bundle carries every workspace module the client actually imports", (t) => {
  t.after(cleanDist);
  build();
  const bundle = bundleOf(builtHtml());

  for (const id of ["apps/web/src/main.ts", "apps/web/src/table.ts", "apps/web/src/cards.ts",
    "packages/draft/src/index.ts", "packages/engine/src/unbiased-uint32-ticket.ts",
    "packages/set-omens/src/set-snapshot.ts", "packages/set-omens/src/set-snapshot.generated.ts"]) {
    assert.ok(bundle.includes(`modules["${id}"]`), `${id} must be bundled`);
  }
});

test("separate workspace modules keep separate scopes despite colliding private names", (t) => {
  const draft = readFileSync(file("../../packages/draft/src/index.ts"), "utf8");
  const engine = readFileSync(file("../../packages/engine/src/unbiased-uint32-ticket.ts"), "utf8");
  assert.match(draft, /function fail\(/, "the collision this build must survive still exists");
  assert.match(engine, /const fail = /, "the collision this build must survive still exists");

  const nodes = openBuiltClient(t);
  assert.equal(nodes.pack.children.length, 14, "a flattened single scope would have thrown before rendering");
});

test("the built client renders a real opening pack, pool, and live status", (t) => {
  const nodes = openBuiltClient(t);

  assert.equal(nodes.round.textContent, "1");
  assert.equal(nodes.pick.textContent, "1");
  assert.equal(nodes.pack.children.length, 14);
  assert.equal(nodes.pool.children.length, 0);
  assert.equal(nodes["pool-count"].textContent, "0");
  assert.match(nodes.status.textContent, /Choose one of 14 cards/);
  assert.ok(nodes.pack.children.every((card) => / · (Common|Rare|Majestic)/.test(card.textContent)));
  assert.match(nodes.pack.children[13].textContent, / · Rainbow Foil$/);
});

test("every dealt card shows its own official art and stays readable without it", (t) => {
  const nodes = openBuiltClient(t);

  for (const card of nodes.pack.children) {
    const art = card.children.find((child) => child.tag === "img");
    assert.ok(art !== undefined, "each card carries its own image");
    assert.match(art.attributes.src, new RegExp(`^${IMAGE_ORIGIN}/media/cards/normal/OMN\\d+\\.webp$`));
    assert.equal(art.attributes.alt, "", "the visible card name is already the accessible name");
    assert.equal(art.attributes.loading, "lazy");
    assert.equal(art.attributes.referrerpolicy, "no-referrer");
    assert.ok(Number(art.attributes.width) > 0 && Number(art.attributes.height) > 0, "art reserves its own space");
  }

  const [first] = nodes.pack.children;
  const failed = first.children.find((child) => child.tag === "img");
  const label = first.textContent;
  failed.onerror();
  assert.equal(failed.hidden, true, "a failed image gets out of the way");
  assert.equal(first.textContent, label, "the card keeps its name when its art cannot load");
});

test("the same card identity is requested from exactly one URL", (t) => {
  const nodes = openBuiltClient(t);
  const sources = new Map();
  for (const card of nodes.pack.children) {
    const art = card.children.find((child) => child.tag === "img");
    const id = /\/(OMN\d+)\.webp$/.exec(art.attributes.src)[1];
    const seen = sources.get(id);
    if (seen !== undefined) assert.equal(seen, art.attributes.src, `${id} must resolve to one cacheable URL`);
    sources.set(id, art.attributes.src);
  }
  assert.ok(sources.size > 0);
});

test("clicking a card in the built client drafts it and passes a fresh pack", (t) => {
  const nodes = openBuiltClient(t);
  const chosen = nodes.pack.children[2];
  chosen.onclick();

  assert.equal(nodes.pool.children.length, 1);
  assert.equal(nodes.pool.children[0].textContent, chosen.textContent);
  assert.equal(nodes["pool-count"].textContent, "1");
  assert.equal(nodes.pick.textContent, "2");
  assert.equal(nodes.pack.children.length, 13);
});

test("a stale card activation from a superseded pack cannot draft twice", (t) => {
  const nodes = openBuiltClient(t);
  const stale = nodes.pack.children[0];
  stale.onclick();
  stale.onclick();

  assert.equal(nodes.pool.children.length, 1);
});

test("the built client can play a whole three-round draft to forty-two cards", (t) => {
  const nodes = openBuiltClient(t);

  for (let choice = 0; choice < 39; choice += 1) nodes.pack.firstChild.onclick();
  assert.equal(nodes.pool.children.length, 42);
  assert.equal(nodes.pack.children.length, 0);
  assert.match(nodes.status.textContent, /Draft complete\. You drafted 42 cards\./);
  assert.equal(nodes.status.focused, true);
});

test("restarting deals a new draft from an empty pool", (t) => {
  const nodes = openBuiltClient(t);
  nodes.pack.firstChild.onclick();
  nodes.restart.onclick();

  assert.equal(nodes.pool.children.length, 0);
  assert.equal(nodes.pick.textContent, "1");
  assert.equal(nodes.pack.children.length, 14);
});

test("the build refuses a module specifier it cannot resolve inside the workspace", (t) => {
  const entry = join(mkdtempSync(join(tmpdir(), "draft-table-web-entry-")), "entry.ts");
  t.after(() => { rmSync(dirname(entry), { recursive: true, force: true }); cleanDist(); });
  writeFileSync(entry, 'import { readFile } from "node:fs/promises";\nconsole.log(readFile);\n');

  assert.throws(
    () => execFileSync("node", ["scripts/build-static.mjs"], {
      cwd: file(""), stdio: "pipe", env: { ...process.env, DRAFT_TABLE_WEB_ENTRY: entry }
    }),
    /node:fs\/promises/
  );
});
