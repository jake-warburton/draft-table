import assert from "node:assert/strict";
import test from "node:test";

import { createRoom, readTypedCode, socketPath, socketUrl } from "../src/rooms.ts";

const respond = (status, body) => async (path, init) => {
  respond.calls.push({ path, init });
  return { status, json: async () => body };
};
respond.calls = [];

test("creating a room posts the options to the page's own origin and keeps the answer", async () => {
  respond.calls = [];
  const outcome = await createRoom(
    { name: "Friday Omens", password: "sea shanty", timers: false },
    respond(201, { code: "A1B2C3D4", hostClaim: "the-claim" })
  );

  assert.deepEqual(outcome, { ok: true, code: "A1B2C3D4", hostClaim: "the-claim" });
  const [call] = respond.calls;
  assert.equal(call.path, "/api/rooms", "a path, never an absolute URL");
  assert.equal(call.init.method, "POST");
  assert.deepEqual(JSON.parse(call.init.body), { name: "Friday Omens", password: "sea shanty", timers: false });
});

test("refusals come back as reasons, and a throwing network is a failure, not an exception", async () => {
  assert.deepEqual(await createRoom({}, respond(400, {})), { ok: false, reason: "invalid" });
  assert.deepEqual(await createRoom({}, respond(503, {})), { ok: false, reason: "unavailable" });
  assert.deepEqual(await createRoom({}, respond(500, {})), { ok: false, reason: "failed" });
  assert.deepEqual(await createRoom({}, respond(201, "not an object")), { ok: false, reason: "failed" });
  assert.deepEqual(await createRoom({}, respond(201, { code: 7 })), { ok: false, reason: "failed" });
  assert.deepEqual(
    await createRoom({}, async () => { throw new Error("offline"); }),
    { ok: false, reason: "failed" }
  );
});

test("typed codes normalize by Crockford's forgiving rules or come back null", () => {
  assert.equal(readTypedCode("a1b2-c3d4"), "A1B2C3D4");
  assert.equal(readTypedCode("AIb2c3d4"), "A1B2C3D4", "I reads as 1");
  assert.equal(readTypedCode("AUB2C3D4"), null, "U is refused");
  assert.equal(readTypedCode("A1B2C3"), null);
  assert.equal(readTypedCode(""), null);
});

test("the socket address never leaves the page's own host", () => {
  assert.equal(socketPath("A1B2C3D4"), "/api/rooms/A1B2C3D4/socket");
  assert.equal(socketUrl("https:", "draft.example", "A1B2C3D4"), "wss://draft.example/api/rooms/A1B2C3D4/socket");
  assert.equal(socketUrl("http:", "localhost:8787", "A1B2C3D4"), "ws://localhost:8787/api/rooms/A1B2C3D4/socket");
});
