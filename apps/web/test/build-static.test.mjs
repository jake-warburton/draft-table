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
const FABRARY_ORIGIN = "https://fabrary.net";

const build = () => execFileSync("node", ["scripts/build-static.mjs"], { cwd: file(""), stdio: "pipe" });
const builtHtml = () => readFileSync(file("dist/index.html"), "utf8");

const bundleOf = (html) => {
  const match = /<script type="module">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(match !== null, "the built page must inline exactly one module script");
  return match[1];
};

const cleanDist = () => rmSync(file("dist"), { recursive: true, force: true });

/** Every card in the pool, flattened out of whatever grouping is currently rendered. */
const pooledCards = (pool) => pool.children.flatMap((group) =>
  group.children.filter((child) => child.tag === "ol").flatMap((list) => list.children));

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
    this.value = "";
    this.selected = false;
  }
  select() { this.selected = true; }
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
  const ids = ["pack", "status", "pool", "pool-grouping", "pool-count", "round", "pick", "restart",
    "drafting-heading", "review-heading", "review-pack", "continue",
    "export", "export-link", "export-list", "export-copy", "export-status",
    "rooms", "room-status", "room-forms", "create-form", "create-name", "create-password", "create-timers",
    "create-pool-hidden", "create-spectators", "create-room", "join-form", "join-code", "join-name",
    "join-password", "join-room", "room-lobby", "room-code", "room-share", "lobby-seats", "lobby-spectators",
    "lobby-randomize", "lobby-start", "room-leave", "room-deadline", "deadline-label", "deadline-bar",
    "deadline-seconds", "solo-table", "pack-section", "pool-section"];
  const nodes = Object.fromEntries(ids.map((id) => [id, new Element("div")]));
  const previousDocument = globalThis.document;
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const clipboard = { written: [], reject: false };
  globalThis.document = {
    querySelector: (selector) => nodes[selector.slice(1)] ?? null,
    createElement: (tag) => new Element(tag)
  };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      clipboard: {
        writeText: (text) => clipboard.reject
          ? Promise.reject(new Error("refused"))
          : (clipboard.written.push(text), Promise.resolve())
      }
    }
  });
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousNavigator === undefined) delete globalThis.navigator;
    else Object.defineProperty(globalThis, "navigator", previousNavigator);
    cleanDist();
  });
  nodes.clipboard = clipboard;
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
  // Networking exists now, but only the reviewed kind: no XHR, and no origin beyond the two
  // known ones — the room's fetch and socket speak exclusively to the page's own host.
  assert.doesNotMatch(bundle, /XMLHttpRequest/, "no legacy transport sneaks in");
  const origins = new Set([...bundle.matchAll(/https?:\/\/[^/"']+/gu)].map((match) => match[0]));
  assert.deepEqual([...origins].sort(), [FABRARY_ORIGIN, IMAGE_ORIGIN].sort(),
    "card art and the Fabrary hand-off are the only origins in the bundle");
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

  for (const id of ["apps/web/src/main.ts", "apps/web/src/table.ts", "apps/web/src/cards.ts", "apps/web/src/pool.ts", "apps/web/src/fabrary.ts",
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
  assert.equal(pooledCards(nodes.pool).length, 0);
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

test("clicking a card in the built client drafts it face down and passes a fresh pack", (t) => {
  const nodes = openBuiltClient(t);
  const chosen = nodes.pack.children[2];
  chosen.onclick();

  assert.equal(pooledCards(nodes.pool).length, 0, "the pile stays face down while picking");
  assert.equal(nodes.pool.textContent, "Pool hidden until the next review",
    "the cards are genuinely absent, not hidden with styling");
  assert.equal(nodes["pool-grouping"].hidden, true);
  assert.equal(nodes["pool-grouping"].children.length, 0);
  assert.equal(nodes["pool-count"].textContent, "1", "the count is no secret");
  assert.equal(nodes.pick.textContent, "2");
  assert.equal(nodes.pack.children.length, 13);
});

test("a stale card activation from a superseded pack cannot draft twice", (t) => {
  const nodes = openBuiltClient(t);
  const stale = nodes.pack.children[0];
  stale.onclick();
  stale.onclick();

  assert.equal(nodes["pool-count"].textContent, "1");
});

test("a finished pack pauses the table for review before the next one is dealt", (t) => {
  const nodes = openBuiltClient(t);
  const chosen = nodes.pack.children[0];
  draftCards(nodes, 13);

  assert.equal(nodes.pack.children.length, 0, "the next pack waits behind the review");
  assert.equal(nodes["drafting-heading"].hidden, true);
  assert.equal(nodes["review-heading"].hidden, false);
  assert.equal(nodes["review-pack"].textContent, "1");
  assert.equal(nodes.continue.hidden, false);
  assert.equal(nodes.continue.focused, true, "keyboard flow lands on the one primary action");
  assert.equal(nodes.continue.textContent, "Continue to pack 2");
  assert.equal(nodes.status.textContent, "Pack 1 drafted. Review your pool. Pack 2 passes to the right.");
  assert.equal(nodes["pool-count"].textContent, "14", "thirteen choices plus the last card, which commits itself");
  assert.equal(pooledCards(nodes.pool).length, 14, "the pile turns face up for the review");
  assert.ok(pooledCards(nodes.pool).some((item) => item.textContent === chosen.textContent),
    "the first card taken is in the face-up pile");
  assert.equal(nodes["pool-grouping"].hidden, false);
  assert.equal(nodes.export.hidden, true, "a part-drafted pool is not a finished one");
});

test("continuing deals the next pack and turns the pile face down again", (t) => {
  const nodes = openBuiltClient(t);
  draftCards(nodes, 13);
  nodes.continue.onclick();

  assert.equal(nodes["review-heading"].hidden, true);
  assert.equal(nodes["drafting-heading"].hidden, false);
  assert.equal(nodes.round.textContent, "2");
  assert.equal(nodes.pick.textContent, "1");
  assert.equal(nodes.pack.children.length, 14);
  assert.equal(nodes.pack.firstChild.focused, true);
  assert.equal(nodes.continue.hidden, true);
  assert.equal(pooledCards(nodes.pool).length, 0);
  assert.equal(nodes.pool.textContent, "Pool hidden until the next review");
});

test("the second review names pack two and the last pack ends without one", (t) => {
  const nodes = openBuiltClient(t);
  draftCards(nodes, 26);

  assert.equal(nodes["review-pack"].textContent, "2");
  assert.equal(nodes.continue.textContent, "Continue to pack 3");
  assert.equal(nodes.status.textContent, "Pack 2 drafted. Review your pool. Pack 3 passes to the left.");

  draftCards(nodes, 13);
  assert.equal(nodes.continue.hidden, true, "the finished draft reviews itself; there is no pack 4");
  assert.equal(nodes["review-heading"].hidden, true);
});

test("restarting during a review clears it and deals a fresh face-down draft", (t) => {
  const nodes = openBuiltClient(t);
  draftCards(nodes, 13);
  nodes.restart.onclick();

  assert.equal(nodes.continue.hidden, true);
  assert.equal(nodes["review-heading"].hidden, true);
  assert.equal(nodes.round.textContent, "1");
  assert.equal(nodes.pick.textContent, "1");
  assert.equal(nodes.pack.children.length, 14);
  assert.equal(pooledCards(nodes.pool).length, 0);
  assert.equal(nodes.pool.textContent, "Pool hidden until the next review");
});

test("the built client can play a whole three-round draft to forty-two cards", (t) => {
  const nodes = openBuiltClient(t);

  draftCards(nodes, 39);
  assert.equal(pooledCards(nodes.pool).length, 42, "the finished pile is face up");
  assert.equal(nodes.pack.children.length, 0);
  assert.match(nodes.status.textContent, /Draft complete\. You drafted 42 cards\./);
  assert.equal(nodes.status.focused, true);
});

test("restarting deals a new draft from an empty pool", (t) => {
  const nodes = openBuiltClient(t);
  nodes.pack.firstChild.onclick();
  nodes.restart.onclick();

  assert.equal(pooledCards(nodes.pool).length, 0);
  assert.equal(nodes.pick.textContent, "1");
  assert.equal(nodes.pack.children.length, 14);
});

/** Drafts `count` cards by always taking the first card offered, continuing through reviews. */
const draftCards = (nodes, count) => {
  for (let taken = 0; taken < count; taken += 1) {
    if (nodes.continue.hidden === false) nodes.continue.onclick();
    nodes.pack.firstChild.onclick();
  }
};

const pressed = (nodes) => nodes["pool-grouping"].children
  .filter((control) => control.attributes["aria-pressed"] === "true")
  .map((control) => control.textContent);

test("the pool offers every grouping and starts ungrouped in collector order", (t) => {
  const nodes = openBuiltClient(t);
  draftCards(nodes, 13);

  assert.deepEqual(
    nodes["pool-grouping"].children.map((control) => control.textContent),
    ["Set number", "Class", "Colour", "Type"]
  );
  assert.deepEqual(pressed(nodes), ["Set number"], "exactly one grouping is active at a time");
  assert.equal(nodes.pool.children.length, 1, "set number is a single ungrouped run");
  assert.equal(nodes.pool.children[0].children.filter((child) => child.tag === "h3").length, 0, "no heading");

  const numbers = pooledCards(nodes.pool).map((item) => Number(item.textContent.replace(/\D/gu, "")));
  assert.deepEqual(numbers, [...numbers].sort((left, right) => left - right));
});

test("choosing a grouping regroups the same pool rather than changing it", (t) => {
  const nodes = openBuiltClient(t);
  draftCards(nodes, 13);
  const before = pooledCards(nodes.pool).map((item) => item.textContent).sort();

  for (const label of ["Class", "Colour", "Type"]) {
    const control = nodes["pool-grouping"].children.find((entry) => entry.textContent === label);
    control.onclick();

    assert.deepEqual(pressed(nodes), [label]);
    assert.ok(nodes.pool.children.length >= 1, label);
    assert.deepEqual(pooledCards(nodes.pool).map((item) => item.textContent).sort(), before, label);
    for (const group of nodes.pool.children) {
      const [heading] = group.children.filter((child) => child.tag === "h3");
      const [list] = group.children.filter((child) => child.tag === "ol");
      assert.ok(heading !== undefined, `${label} groups are headed`);
      assert.match(heading.textContent, /^[A-Za-z ]+ \(\d+\)$/, heading.textContent);
      assert.equal(Number(/\((\d+)\)$/.exec(heading.textContent)[1]), list.children.length, "the count is real");
      const numbers = list.children.map((item) => Number(item.textContent.replace(/\D/gu, "")));
      assert.deepEqual(numbers, [...numbers].sort((left, right) => left - right), "collector order inside a group");
    }
  }
});

test("a grouped pool survives drafting more cards into it", (t) => {
  const nodes = openBuiltClient(t);
  draftCards(nodes, 13);
  nodes["pool-grouping"].children.find((entry) => entry.textContent === "Type").onclick();
  draftCards(nodes, 13);

  assert.deepEqual(pressed(nodes), ["Type"], "the chosen grouping is kept across packs");
  assert.equal(pooledCards(nodes.pool).length, 28);
});

test("drafted cards show their own art in the pool as well as in the pack", (t) => {
  const nodes = openBuiltClient(t);
  draftCards(nodes, 13);

  for (const item of pooledCards(nodes.pool)) {
    const art = item.children.find((child) => child.tag === "img");
    assert.ok(art !== undefined, "a drafted card carries its art too");
    assert.match(art.attributes.src, new RegExp(`^${IMAGE_ORIGIN}/media/cards/normal/OMN\\d+\\.webp$`));
    assert.equal(art.attributes.alt, "");
    assert.equal(art.attributes.loading, "lazy");
    assert.equal(art.attributes.referrerpolicy, "no-referrer");
  }
});

test("the Fabrary hand-off stays hidden until there is a finished pool to hand off", (t) => {
  const nodes = openBuiltClient(t);
  assert.equal(nodes.export.hidden, true, "nothing to export before the draft starts");

  draftCards(nodes, 20);
  assert.equal(nodes.export.hidden, true, "a part-drafted pool is not a finished one");

  draftCards(nodes, 19);
  assert.equal(nodes.export.hidden, false);
});

test("the finished export carries all forty-two drafted copies", (t) => {
  const nodes = openBuiltClient(t);
  draftCards(nodes, 39);

  const link = new URL(nodes["export-link"].attributes.href);
  assert.equal(link.origin, FABRARY_ORIGIN);
  assert.equal(link.searchParams.get("format"), "Draft");
  const identifiers = link.searchParams.get("cards").split(",");
  assert.equal(identifiers.length, 42, "one identifier per physical copy");
  assert.ok(identifiers.every((id) => /^OMN\d+$/u.test(id)), "every identifier is a real collector id");

  const counted = nodes["export-list"].value.split("\n").filter((line) => /^\d+x /u.test(line));
  assert.equal(counted.reduce((total, line) => total + Number(/^(\d+)x/u.exec(line)[1]), 0), 42);
  assert.equal(counted.length, new Set(identifiers).size, "duplicates collapse to one counted line");
  assert.match(nodes["export-list"].value, /^Name: .+\nFormat: Draft\n\nDeck cards\n/u);
});

test("dealing a new draft withdraws the previous export", (t) => {
  const nodes = openBuiltClient(t);
  draftCards(nodes, 39);
  assert.equal(nodes.export.hidden, false);

  nodes.restart.onclick();
  assert.equal(nodes.export.hidden, true, "a finished pool must not outlive the draft that made it");
});

test("copying the list reports what happened either way", (t) => {
  const nodes = openBuiltClient(t);
  draftCards(nodes, 39);

  nodes["export-copy"].onclick();
  return Promise.resolve().then(() => {
    assert.deepEqual(nodes.clipboard.written, [nodes["export-list"].value]);
    assert.equal(nodes["export-list"].selected, true, "the list is selected so a refusal is still recoverable");
    assert.equal(nodes["export-status"].textContent, "Copied.");

    nodes.clipboard.reject = true;
    nodes["export-copy"].onclick();
    return Promise.resolve().then(() => {
      assert.match(nodes["export-status"].textContent, /copy it yourself/i);
    });
  });
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

/** A scripted room server: a fake fetch for creation and a fake socket the test speaks through. */
const openRoomWorld = (t) => {
  const nodes = openBuiltClient(t);
  const world = { fetches: [], sockets: [], storage: new Map() };
  const previous = {
    fetch: globalThis.fetch,
    WebSocket: globalThis.WebSocket,
    localStorage: Object.getOwnPropertyDescriptor(globalThis, "localStorage"),
    location: Object.getOwnPropertyDescriptor(globalThis, "location"),
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval
  };
  globalThis.fetch = async (path, init) => {
    world.fetches.push({ path, init });
    return { status: 201, json: async () => ({ code: "A1B2C3D4", hostClaim: "claim-of-the-host" }) };
  };
  globalThis.WebSocket = class {
    constructor(url) {
      this.url = url;
      this.sent = [];
      this.onopen = null;
      this.onmessage = null;
      this.onclose = null;
      world.sockets.push(this);
    }
    send(data) { this.sent.push(JSON.parse(data)); }
    close() {}
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key) => world.storage.get(key) ?? null,
      setItem: (key, value) => { world.storage.set(key, value); }
    }
  });
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { protocol: "https:", host: "draft.test" }
  });
  globalThis.setTimeout = () => 0;
  globalThis.clearTimeout = () => {};
  globalThis.setInterval = () => 0;
  globalThis.clearInterval = () => {};
  t.after(() => {
    globalThis.fetch = previous.fetch;
    globalThis.WebSocket = previous.WebSocket;
    if (previous.localStorage === undefined) delete globalThis.localStorage;
    else Object.defineProperty(globalThis, "localStorage", previous.localStorage);
    if (previous.location === undefined) delete globalThis.location;
    else Object.defineProperty(globalThis, "location", previous.location);
    globalThis.setTimeout = previous.setTimeout;
    globalThis.clearTimeout = previous.clearTimeout;
    globalThis.setInterval = previous.setInterval;
    globalThis.clearInterval = previous.clearInterval;
  });
  const serve = (socket, type, payload, extra = {}) => {
    socket.onmessage({ data: JSON.stringify({
      protocolVersion: 1, stateVersion: extra.stateVersion ?? 1, type,
      ...(extra.commandId === undefined ? {} : { commandId: extra.commandId }),
      serverNow: 1_000, payload
    }) });
  };
  return { nodes, world, serve };
};

const flush = () => new Promise((resolve) => { setImmediate(resolve); });

test("creating a room walks the page into a live lobby and stands the solo table down", async (t) => {
  const { nodes, world, serve } = openRoomWorld(t);
  nodes["create-name"].value = "Friday Omens";
  nodes["create-timers"].checked = true;
  nodes["create-pool-hidden"].checked = true;
  nodes["create-spectators"].checked = true;
  nodes["create-form"].onsubmit({ preventDefault: () => {} });
  await flush();

  assert.equal(world.fetches[0].path, "/api/rooms");
  const socket = world.sockets[0];
  assert.equal(socket.url, "wss://draft.test/api/rooms/A1B2C3D4/socket");
  socket.onopen();
  const [hello] = socket.sent;
  assert.equal(hello.type, "hello");
  assert.equal(hello.payload.hostClaim, "claim-of-the-host");

  serve(socket, "hello_ack", { credential: "issued", self: { id: "p1", name: "Drafter 1", host: true, connected: true, seat: 0 } }, { commandId: hello.commandId });
  serve(socket, "snapshot", {
    phase: "lobby",
    config: { name: "Friday Omens" },
    passwordProtected: false,
    participants: [{ id: "p1", name: "Drafter 1", host: true, connected: true, seat: 0 }],
    feed: [],
    self: "p1"
  });

  assert.equal(nodes["room-lobby"].hidden, false, "the lobby is on screen");
  assert.equal(nodes["room-forms"].hidden, true);
  assert.equal(nodes["solo-table"].hidden, true, "the solo table stood down");
  assert.equal(nodes["pack-section"].hidden, true, "the table sections wait behind the lobby");
  assert.equal(nodes["pool-section"].hidden, true);
  assert.equal(nodes.pack.children.length, 0, "no stale solo card lurks clickable under the lobby");
  assert.equal(nodes.export.hidden, true);
  assert.equal(nodes["room-code"].textContent, "A1B2C3D4");
  assert.equal(nodes["lobby-seats"].children[0].textContent, "Drafter 1 (host)");
  assert.equal(nodes["lobby-start"].hidden, false, "the host sees the start control");
  assert.equal(world.storage.size, 1, "the issued credential is kept");

  serve(socket, "snapshot", {
    phase: "lobby", config: {}, passwordProtected: false,
    participants: [
      { id: "p1", name: "Drafter 1", host: false, connected: true, seat: 0 },
      { id: "p2", name: "The Host", host: true, connected: true, seat: 1 }
    ],
    feed: [], self: "p1"
  }, { stateVersion: 2 });
  assert.equal(nodes["lobby-start"].hidden, true, "a guest sees no start control");
  assert.equal(nodes["lobby-randomize"].hidden, true, "nor the shuffle");
});

test("a started room deals the pack onto the same table and clicking a card queues it", async (t) => {
  const { nodes, world, serve } = openRoomWorld(t);
  nodes["create-form"].onsubmit({ preventDefault: () => {} });
  await flush();
  const socket = world.sockets[0];
  socket.onopen();
  const [hello] = socket.sent;
  serve(socket, "hello_ack", { self: { id: "p1", name: "Drafter 1", host: true, connected: true, seat: 0 } }, { commandId: hello.commandId });
  serve(socket, "snapshot", {
    phase: "lobby", config: {}, passwordProtected: false,
    participants: [{ id: "p1", name: "Drafter 1", host: true, connected: true, seat: 0 }],
    feed: [], self: "p1"
  });

  serve(socket, "phase_changed", {
    phase: "picking", status: "picking", round: 1, pick: 1, passDirection: "left", packSize: 3,
    seats: [{ seatId: "seat-1", participantId: "p1", connected: true, hasQueued: false }]
  }, { stateVersion: 2 });
  serve(socket, "private_pack_pool", {
    seatId: "seat-1",
    pack: { id: "r1s1", cards: [
      { instanceId: "r1s1-0", cardId: "UNKNOWN1" },
      { instanceId: "r1s1-1", cardId: "UNKNOWN2" },
      { instanceId: "r1s1-2", cardId: "UNKNOWN3" }
    ] },
    pool: null,
    queued: null
  }, { stateVersion: 2 });

  assert.equal(nodes["pack-section"].hidden, false, "the table sections return for the draft");
  assert.equal(nodes["pool-section"].hidden, false);
  assert.equal(nodes.pack.children.length, 3, "the room's pack landed on the shared table");
  assert.match(nodes.status.textContent, /Round 1, pick 1/);
  assert.match(nodes.pool.textContent, /Pool hidden until the next review/);

  // A deadline learned from a snapshot alone must still fill the bar from what remains now.
  serve(socket, "snapshot", {
    phase: "picking", config: {}, passwordProtected: false,
    participants: [{ id: "p1", name: "Drafter 1", host: true, connected: true, seat: 0 }],
    feed: [], self: "p1",
    draft: {
      status: "picking", round: 1, pick: 1, passDirection: "left", packSize: 3,
      seats: [{ seatId: "seat-1", participantId: "p1", connected: true, hasQueued: false }]
    },
    deadlineAt: 51_000
  }, { stateVersion: 3 });
  assert.equal(nodes["room-deadline"].hidden, false);
  assert.ok(Number(nodes["deadline-bar"].value) > 900,
    "the bar measures from what remained at arrival, not from an empty total");

  nodes.pack.children[1].onclick();
  const queued = socket.sent.at(-1);
  assert.equal(queued.type, "queue_pick");
  assert.deepEqual(queued.payload, { round: 1, pick: 1, cardInstanceId: "r1s1-1" });
});
