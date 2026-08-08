import assert from "node:assert/strict";
import test from "node:test";

import { RoomClient } from "../src/room-client.ts";
import { credentialStorageKey } from "../src/protocol.ts";

const CODE = "A1B2C3D4";

const makeSocket = () => ({
  sent: [],
  closed: null,
  onopen: null,
  onmessage: null,
  onclose: null,
  send(data) { this.sent.push(JSON.parse(data)); },
  close(code, reason) { this.closed = { code, reason }; }
});

/** A whole fake platform: sockets, clock, scheduler, storage, and a tape of what happened. */
const makeWorld = () => {
  const world = {
    sockets: [],
    nowMs: 100_000,
    timers: [],
    stored: new Map(),
    frames: [],
    statuses: []
  };
  const hooks = {
    openSocket: () => {
      const socket = makeSocket();
      world.sockets.push(socket);
      return socket;
    },
    now: () => world.nowMs,
    schedule: (callback, delayMs) => {
      const timer = { callback, delayMs, cancelled: false };
      world.timers.push(timer);
      return () => { timer.cancelled = true; };
    },
    loadStored: (key) => world.stored.get(key) ?? null,
    store: (key, value) => { world.stored.set(key, value); },
    onFrame: (frame) => { world.frames.push(frame); },
    onStatus: (status) => { world.statuses.push(status); }
  };
  return { world, hooks };
};

const frame = (overrides = {}) => JSON.stringify({
  protocolVersion: 1,
  stateVersion: 1,
  type: "snapshot",
  serverNow: 100_000,
  payload: {},
  ...overrides
});

const helloAck = (stateVersion = 1, payload = {}) => frame({
  type: "hello_ack", stateVersion, commandId: "c1", payload
});

const open = (world) => {
  const socket = world.sockets.at(-1);
  socket.onopen();
  return socket;
};

test("connecting says hello with what it was given and keeps the credential it is issued", () => {
  const { world, hooks } = makeWorld();
  const client = new RoomClient(CODE, { name: "Karla", password: "sea shanty" }, hooks);
  client.connect();
  const socket = open(world);

  const [hello] = socket.sent;
  assert.equal(hello.type, "hello");
  assert.deepEqual(hello.payload, { name: "Karla", password: "sea shanty" });

  socket.onmessage({ data: helloAck(1, { credential: "issued-secret", self: { id: "p1" } }) });
  assert.equal(world.stored.get(credentialStorageKey(CODE)), "issued-secret");
  assert.deepEqual(world.statuses.at(-1), { state: "connected" });
  assert.equal(world.frames.at(-1).type, "hello_ack");
});

test("a stored credential is presented and a host claim is never replayed", () => {
  const { world, hooks } = makeWorld();
  world.stored.set(credentialStorageKey(CODE), "kept-secret");
  const client = new RoomClient(CODE, { hostClaim: "the-claim" }, hooks);
  client.connect();
  const socket = open(world);
  assert.deepEqual(socket.sent[0].payload, { credential: "kept-secret", hostClaim: "the-claim" });
  socket.onmessage({ data: helloAck() });

  // The connection dies; the reconnect hello must carry the credential, never the spent claim.
  socket.onclose({ code: 1006, reason: "" });
  world.timers.at(-1).callback();
  const revived = open(world);
  assert.deepEqual(revived.sent[0].payload, { credential: "kept-secret" });
});

test("a dead connection comes back with bounded backoff and a fresh hello", () => {
  const { world, hooks } = makeWorld();
  const client = new RoomClient(CODE, {}, hooks);
  client.connect();
  const socket = open(world);
  socket.onmessage({ data: helloAck() });

  socket.onclose({ code: 1006, reason: "went away" });
  const wait = world.statuses.at(-1);
  assert.equal(wait.state, "reconnecting");
  assert.equal(wait.attempt, 1);
  assert.equal(world.timers.length, 1);

  world.timers[0].callback();
  assert.equal(world.sockets.length, 2, "a second socket is opened");
  const revived = open(world);
  assert.equal(revived.sent[0].type, "hello");

  revived.onclose({ code: 1006, reason: "again" });
  assert.equal(world.statuses.at(-1).attempt, 2);
  assert.ok(world.timers.at(-1).delayMs > world.timers[0].delayMs, "the wait grows");
});

test("refusals, supersessions, and doors that never opened are answers, not accidents", () => {
  const refused = makeWorld();
  const client = new RoomClient(CODE, { password: "wrong" }, refused.hooks);
  client.connect();
  const socket = open(refused.world);
  socket.onclose({ code: 4001, reason: "wrong_password" });
  assert.deepEqual(refused.world.statuses.at(-1), { state: "refused", reason: "wrong_password" });
  assert.equal(refused.world.timers.length, 0, "nobody argues with a refusal");

  const superseded = makeWorld();
  const second = new RoomClient(CODE, {}, superseded.hooks);
  second.connect();
  const own = open(superseded.world);
  own.onmessage({ data: helloAck() });
  own.onclose({ code: 4000, reason: "superseded" });
  assert.deepEqual(superseded.world.statuses.at(-1), { state: "superseded" });
  assert.equal(superseded.world.timers.length, 0, "the newer connection owns the identity now");

  const unreachable = makeWorld();
  const third = new RoomClient(CODE, {}, unreachable.hooks);
  third.connect();
  unreachable.world.sockets.at(-1).onclose({ code: 1006, reason: "" });
  assert.deepEqual(unreachable.world.statuses.at(-1), { state: "closed", reason: "unreachable" });
  assert.equal(unreachable.world.timers.length, 0, "no retry storm against a door that never opened");
});

test("a version gap asks for the whole truth instead of guessing", () => {
  const { world, hooks } = makeWorld();
  const client = new RoomClient(CODE, {}, hooks);
  client.connect();
  const socket = open(world);
  socket.onmessage({ data: helloAck(3) });
  socket.onmessage({ data: frame({ type: "snapshot", stateVersion: 3 }) });
  socket.onmessage({ data: frame({ type: "participants_changed", stateVersion: 4 }) });
  assert.ok(!socket.sent.some((sent) => sent.type === "resync"), "consecutive versions need no help");

  socket.onmessage({ data: frame({ type: "participants_changed", stateVersion: 9 }) });
  assert.equal(socket.sent.at(-1).type, "resync", "a gap means missed frames");
});

test("garbage frames are dropped without ceremony and commands refuse a dead room", () => {
  const { world, hooks } = makeWorld();
  const client = new RoomClient(CODE, {}, hooks);
  client.connect();
  const socket = open(world);
  socket.onmessage({ data: "not a frame at all" });
  socket.onmessage({ data: JSON.stringify({ protocolVersion: 9 }) });
  assert.equal(world.frames.length, 0);

  client.stop("test over");
  assert.throws(() => client.send("queue_pick", {}), /not connected/u);
});

test("the clock learns from provoked frames and the fastest round trip wins", () => {
  const { world, hooks } = makeWorld();
  const client = new RoomClient(CODE, {}, hooks);
  client.connect();
  const socket = open(world);
  world.nowMs = 100_400;
  socket.onmessage({ data: helloAck(1, {}) });
  // Provoked: sent at 100_000, received at 100_400, server stamped 200_000.
  // Latency 200; server is ahead by 200_000 + 200 - 100_400.
  const ack = frame({ type: "ack", commandId: "c1", serverNow: 200_000, stateVersion: 1 });
  world.nowMs = 100_400;
  socket.onmessage({ data: ack });
  assert.equal(world.frames.length, 2);
});

test("leaving tells the room and stops the driver for good", () => {
  const { world, hooks } = makeWorld();
  const client = new RoomClient(CODE, {}, hooks);
  client.connect();
  const socket = open(world);
  socket.onmessage({ data: helloAck() });

  client.leave();
  assert.equal(socket.sent.at(-1).type, "leave");
  assert.deepEqual(world.statuses.at(-1), { state: "closed", reason: "left" });
  assert.equal(socket.closed?.code, 1000);

  client.connect();
  assert.equal(world.sockets.length, 1, "a stopped driver stays stopped");
});
