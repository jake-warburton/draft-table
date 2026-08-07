import assert from "node:assert/strict";
import test from "node:test";

import { isRoomCode } from "@draft-table/contracts";

import worker, { MAX_CREATE_BODY_BYTES, ROOM_CREATE_ATTEMPTS } from "../src/index.ts";

const ORIGIN = "https://draft.example";

/** A stand-in for the room object namespace, recording exactly what the router asked it to do. */
const rooms = (respond) => {
  const calls = [];
  const namespace = {
    idFromName(name) {
      return { name };
    },
    get(id) {
      return {
        async fetch(request) {
          const call = { name: id.name, url: request.url, method: request.method, request };
          call.body = request.method === "POST" ? await request.clone().text() : null;
          calls.push(call);
          return respond(call, calls.length);
        }
      };
    }
  };
  return { calls, namespace };
};

/** A stand-in for the static assets binding. */
const assets = (response = new Response("the client", { status: 200 })) => {
  const calls = [];
  return { calls, binding: { fetch(request) { calls.push(request); return response; } } };
};

const created = (call) => new Response(
  JSON.stringify({ code: call.url.split("/")[4] }),
  { status: 201, headers: { "content-type": "application/json" } }
);

const taken = () => new Response("", { status: 409 });

const env = (roomNamespace, assetBinding) => ({ ROOMS: roomNamespace, ASSETS: assetBinding });

const post = (path, { body = "{}", origin = ORIGIN, type = "application/json", headers = {} } = {}) => {
  const sent = { "content-type": type, origin, ...headers };
  const init = { method: "POST", headers: Object.fromEntries(Object.entries(sent).filter(([, value]) => value !== null)) };
  if (body !== null) {
    init.body = body;
    if (typeof body !== "string") init.duplex = "half";
  }
  return new Request(`${ORIGIN}${path}`, init);
};

const upgrade = (path, { origin = ORIGIN, method = "GET", headers = { upgrade: "websocket" } } = {}) => new Request(
  `${ORIGIN}${path}`,
  { method, headers: Object.fromEntries(Object.entries({ ...headers, origin }).filter(([, value]) => value !== null)) }
);

/** A body that arrives in pieces and never declares its length, the way a hostile client would send it. */
const streamed = (chunkBytes, chunks) => new ReadableStream({
  pull(controller) {
    if (chunks-- <= 0) { controller.close(); return; }
    controller.enqueue(new Uint8Array(chunkBytes).fill(0x20));
  }
});

const errorCode = async (response) => (await response.clone().json()).error;

test("creating a room mints a code and initializes exactly one object under it", async () => {
  const room = rooms(created);
  const response = await worker.fetch(post("/api/rooms", { body: '{"name":"Friday draft"}' }), env(room.namespace, null));

  assert.equal(response.status, 201);
  assert.equal(room.calls.length, 1);
  const [call] = room.calls;
  assert.ok(isRoomCode(call.name), call.name);
  assert.equal(call.method, "POST");
  assert.equal(call.url, `https://rooms.invalid/rooms/${call.name}/initialize`);
  assert.equal(call.body, '{"name":"Friday draft"}', "the configuration reaches the object unchanged");
  assert.deepEqual(await response.json(), { code: call.name });
});

test("a created room is never stored, because its body carries the host's credential", async () => {
  const room = rooms(created);
  const response = await worker.fetch(post("/api/rooms"), env(room.namespace, null));

  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("content-type"), "application/json");
});

test("a code the object says is taken is replaced rather than reused", async () => {
  const room = rooms((call, attempt) => (attempt === 1 ? taken() : created(call)));
  const response = await worker.fetch(post("/api/rooms"), env(room.namespace, null));

  assert.equal(response.status, 201);
  assert.equal(room.calls.length, 2);
  assert.notEqual(room.calls[0].name, room.calls[1].name, "a fresh code, not a retry of the same one");
  assert.deepEqual(await response.json(), { code: room.calls[1].name });
});

test("codes that keep colliding give up instead of draining the day's request budget", async () => {
  const room = rooms(taken);
  const response = await worker.fetch(post("/api/rooms"), env(room.namespace, null));

  assert.equal(response.status, 503);
  assert.equal(await errorCode(response), "room_unavailable");
  assert.equal(room.calls.length, ROOM_CREATE_ATTEMPTS);
  assert.equal(new Set(room.calls.map((call) => call.name)).size, ROOM_CREATE_ATTEMPTS, "every attempt used its own code");
});

test("an object that refuses the configuration is relayed as a malformed request, in our words", async () => {
  const room = rooms(() => new Response('{"error":"the object\'s own words"}', { status: 400 }));
  const response = await worker.fetch(post("/api/rooms", { body: '{"theme":"dark"}' }), env(room.namespace, null));

  assert.equal(response.status, 400);
  assert.equal(await errorCode(response), "malformed_request");
  assert.doesNotMatch(await response.text(), /own words|theme/u, "neither side's body is repeated");
  assert.equal(room.calls.length, 1, "a refused configuration is not retried on a fresh code");
});

test("an object that answers with anything else is reported as our failure, not described", async () => {
  const room = rooms(() => new Response("stack trace and room state", { status: 500 }));
  const response = await worker.fetch(post("/api/rooms"), env(room.namespace, null));

  assert.equal(response.status, 500);
  assert.equal(await errorCode(response), "server_error");
  assert.doesNotMatch(await response.text(), /stack trace|room state/u);
});

test("an object that cannot be reached at all is reported as our failure", async () => {
  const room = rooms(() => { throw new Error("no object here"); });
  const response = await worker.fetch(post("/api/rooms"), env(room.namespace, null));

  assert.equal(response.status, 500);
  assert.equal(await errorCode(response), "server_error");
});

test("a body larger than a room's configuration never reaches an object", async () => {
  const room = rooms(created);
  const oversized = "x".repeat(MAX_CREATE_BODY_BYTES + 1);
  const response = await worker.fetch(post("/api/rooms", { body: `"${oversized}"` }), env(room.namespace, null));

  assert.equal(response.status, 413);
  assert.equal(await errorCode(response), "payload_too_large");
  assert.equal(room.calls.length, 0);
});

test("a body that never declares its length is still cut off at the limit", async () => {
  const room = rooms(created);
  const request = post("/api/rooms", { body: streamed(1024, 64) });
  assert.equal(request.headers.get("content-length"), null, "the fixture must not declare a length");

  const response = await worker.fetch(request, env(room.namespace, null));

  assert.equal(response.status, 413);
  assert.equal(await errorCode(response), "payload_too_large");
  assert.equal(room.calls.length, 0);
});

test("a declared length over the limit settles it before the body is worth reading", async () => {
  const room = rooms(created);
  // Unreadable on purpose: the answer must come from the declared length alone. Reading this body
  // would be a malformed request instead, which is how the two paths tell each other apart.
  const body = new ReadableStream({ pull() { throw new Error("this body must never be read"); } });
  const request = post("/api/rooms", { body, headers: { "content-length": `${MAX_CREATE_BODY_BYTES + 1}` } });
  assert.equal(request.headers.get("content-length"), `${MAX_CREATE_BODY_BYTES + 1}`, "the fixture must declare the length");

  const response = await worker.fetch(request, env(room.namespace, null));

  assert.equal(response.status, 413);
  assert.equal(await errorCode(response), "payload_too_large");
  assert.equal(room.calls.length, 0);
});

test("a length that is not a length is malformed, not an invitation to guess", async () => {
  for (const declared of ["abc", "-1", "", "12.5", "0x10", "1e9"]) {
    const room = rooms(created);
    const response = await worker.fetch(post("/api/rooms", { headers: { "content-length": declared } }), env(room.namespace, null));

    assert.equal(response.status, 400, JSON.stringify(declared));
    assert.equal(await errorCode(response), "malformed_request");
    assert.equal(room.calls.length, 0);
  }
});

test("a body exactly at the limit is still a room's configuration", async () => {
  const room = rooms(created);
  const filler = "y".repeat(MAX_CREATE_BODY_BYTES - '{"name":""}'.length);
  const body = `{"name":"${filler}"}`;
  assert.equal(body.length, MAX_CREATE_BODY_BYTES);

  const response = await worker.fetch(post("/api/rooms", { body }), env(room.namespace, null));

  assert.equal(response.status, 201);
  assert.equal(room.calls[0].body, body);
});

test("a content type we do not speak is refused before any object is reached", async () => {
  for (const type of ["text/plain", "application/x-www-form-urlencoded", "application/jsonp", null]) {
    const room = rooms(created);
    const response = await worker.fetch(post("/api/rooms", { type }), env(room.namespace, null));

    assert.equal(response.status, 415, `${type}`);
    assert.equal(await errorCode(response), "unsupported_media_type");
    assert.equal(room.calls.length, 0);
  }
});

test("the charset a browser adds to its content type is accepted", async () => {
  const room = rooms(created);
  const response = await worker.fetch(post("/api/rooms", { type: "application/JSON; charset=utf-8" }), env(room.namespace, null));

  assert.equal(response.status, 201);
});

test("anything that is not one JSON object is refused before any object is reached", async () => {
  for (const body of ["", "{", "not json", "[]", '"a room"', "null", "42", "{} {}"]) {
    const room = rooms(created);
    const response = await worker.fetch(post("/api/rooms", { body }), env(room.namespace, null));

    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal(await errorCode(response), "malformed_request");
    assert.equal(room.calls.length, 0);
  }
});

test("a refusal never repeats the request back, because a room's password may be in it", async () => {
  const room = rooms(created);
  const response = await worker.fetch(
    post("/api/rooms", { body: '["name","hunter2"]' }),
    env(room.namespace, null)
  );

  assert.equal(response.status, 400);
  const echoed = `${response.status} ${response.statusText} ${[...response.headers].join(" ")} ${await response.text()}`;
  assert.doesNotMatch(echoed, /hunter2/u);
});

test("a room is created by posting, and other methods say so", async () => {
  for (const method of ["GET", "PUT", "DELETE", "OPTIONS"]) {
    const room = rooms(created);
    const response = await worker.fetch(new Request(`${ORIGIN}/api/rooms`, { method, headers: { origin: ORIGIN } }), env(room.namespace, null));

    assert.equal(response.status, 405, method);
    assert.equal(response.headers.get("allow"), "POST");
    assert.equal(room.calls.length, 0);
  }
});

test("a socket upgrade reaches the object named by the code, exactly as it arrived", async () => {
  const upgraded = new Response("upgraded", { status: 200 });
  const room = rooms(() => upgraded);
  const request = upgrade("/api/rooms/A1B2C3D4/socket");

  const response = await worker.fetch(request, env(room.namespace, null));

  assert.equal(response, upgraded, "the upgrade is passed through untouched, not rebuilt");
  assert.equal(room.calls.length, 1);
  assert.equal(room.calls[0].name, "A1B2C3D4");
  assert.equal(room.calls[0].request, request, "the original request, so the upgrade survives");
});

test("a code typed the way a person types it reaches the same one object", async () => {
  for (const typed of ["a1b2c3d4", "A1B2-C3D4", "aIb2c3d4"]) {
    const room = rooms(() => new Response("upgraded", { status: 200 }));
    await worker.fetch(upgrade(`/api/rooms/${typed}/socket`), env(room.namespace, null));

    assert.equal(room.calls[0].name, "A1B2C3D4", typed);
  }
});

test("a code that could never have been minted is refused without waking an object", async () => {
  for (const code of ["A1B2C3D", "A1B2C3D45", "A1B2C3DU", "A1B2C3D%34", "A1B2%20C3D4", "roomcode!"]) {
    const room = rooms(() => new Response("upgraded", { status: 200 }));
    const response = await worker.fetch(upgrade(`/api/rooms/${code}/socket`), env(room.namespace, null));

    assert.equal(response.status, 404, code);
    assert.equal(await errorCode(response), "not_found");
    assert.equal(room.calls.length, 0);
  }
});

test("a refusal never names the code, because a code is an unlisted address", async () => {
  const room = rooms(() => new Response("upgraded", { status: 200 }));
  const response = await worker.fetch(upgrade("/api/rooms/SECRETCODE/socket"), env(room.namespace, null));

  assert.equal(response.status, 404);
  const echoed = `${response.status} ${response.statusText} ${[...response.headers].join(" ")} ${await response.text()}`;
  assert.doesNotMatch(echoed, /SECRETCODE/u);
});

test("the socket route is only for sockets", async () => {
  const room = rooms(() => new Response("upgraded", { status: 200 }));
  const response = await worker.fetch(upgrade("/api/rooms/A1B2C3D4/socket", { headers: {} }), env(room.namespace, null));

  assert.equal(response.status, 426);
  assert.equal(await errorCode(response), "upgrade_required");
  assert.equal(room.calls.length, 0);
});

test("the upgrade header is read the way browsers actually send it", async () => {
  for (const value of ["websocket", "WebSocket", "WEBSOCKET"]) {
    const room = rooms(() => new Response("upgraded", { status: 200 }));
    const response = await worker.fetch(upgrade("/api/rooms/A1B2C3D4/socket", { headers: { upgrade: value } }), env(room.namespace, null));

    assert.equal(response.status, 200, value);
    assert.equal(room.calls.length, 1);
  }
});

test("a socket is opened by getting, and other methods say so", async () => {
  for (const method of ["POST", "PUT", "DELETE", "OPTIONS"]) {
    const room = rooms(() => new Response("upgraded", { status: 200 }));
    const response = await worker.fetch(upgrade("/api/rooms/A1B2C3D4/socket", { method }), env(room.namespace, null));

    assert.equal(response.status, 405, method);
    assert.equal(response.headers.get("allow"), "GET");
    assert.equal(room.calls.length, 0);
  }
});

test("another site cannot open a room or a socket in this one's name", async () => {
  for (const origin of ["https://draft.example.evil", "http://draft.example", "https://evil.example", "null", null]) {
    const room = rooms(created);
    const create = await worker.fetch(post("/api/rooms", { origin }), env(room.namespace, null));
    const socket = await worker.fetch(upgrade("/api/rooms/A1B2C3D4/socket", { origin }), env(room.namespace, null));

    assert.equal(create.status, 403, `create ${origin}`);
    assert.equal(socket.status, 403, `socket ${origin}`);
    assert.equal(await errorCode(create), "forbidden_origin");
    assert.equal(room.calls.length, 0);
  }
});

test("nothing this router returns invites another site to read it", async () => {
  const room = rooms(created);
  const responses = [
    await worker.fetch(post("/api/rooms"), env(room.namespace, null)),
    await worker.fetch(post("/api/rooms", { body: "[]" }), env(room.namespace, null)),
    await worker.fetch(upgrade("/api/rooms/A1B2C3D4/socket", { headers: {} }), env(room.namespace, null))
  ];

  for (const response of responses) {
    for (const header of [...response.headers.keys()]) {
      assert.doesNotMatch(header, /^access-control-/u, header);
    }
  }
});

test("everything that is not a room route is the client, handed over untouched", async () => {
  for (const path of ["/", "/index.html", "/draft", "/styles.css", "/api"]) {
    const asset = assets();
    const request = new Request(`${ORIGIN}${path}`);
    const response = await worker.fetch(request, env(null, asset.binding));

    assert.equal(response.status, 200, path);
    assert.equal(asset.calls.length, 1, path);
    assert.equal(asset.calls[0], request, path);
  }
});

test("an unknown room route is refused rather than answered by the client", async () => {
  for (const path of ["/api/", "/api/rooms/", "/api/rooms/A1B2C3D4", "/api/rooms/A1B2C3D4/socket/extra", "/api/whatever"]) {
    const asset = assets();
    const room = rooms(created);
    const response = await worker.fetch(new Request(`${ORIGIN}${path}`, { headers: { origin: ORIGIN } }), env(room.namespace, asset.binding));

    assert.equal(response.status, 404, path);
    assert.equal(await errorCode(response), "not_found");
    assert.equal(asset.calls.length, 0, `${path} must not fall back to the client`);
    assert.equal(room.calls.length, 0, path);
  }
});

test("a deployment missing its bindings refuses rather than half-working", async () => {
  const noRooms = await worker.fetch(post("/api/rooms"), {});
  const noSocket = await worker.fetch(upgrade("/api/rooms/A1B2C3D4/socket"), {});
  const noAssets = await worker.fetch(new Request(`${ORIGIN}/`), {});

  for (const response of [noRooms, noSocket, noAssets]) {
    assert.equal(response.status, 500);
    assert.equal(await errorCode(response), "server_error");
  }
});
