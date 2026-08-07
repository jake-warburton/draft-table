import assert from "node:assert/strict";
import test from "node:test";

import {
  HOST_CLAIM_BYTES,
  LOBBY_ABANDONMENT_MS,
  MAX_MESSAGE_BYTES,
  MAX_PARTICIPANTS,
  LOBBY_SEAT_COUNT,
  REFUSED_CLOSE_CODE,
  SUPERSEDED_CLOSE_CODE,
  RoomObject
} from "../src/room.ts";

const CODE = "A1B2C3D4";
const CREATED_AT = 1_700_000_000_000;

/** In-memory stand-ins for the Durable Object storage slice the room declares. */
const makeStorage = () => {
  const map = new Map();
  const alarms = [];
  return {
    map,
    alarms,
    get: async (key) => map.get(key),
    put: async (key, value) => { map.set(key, value); },
    deleteAll: async () => { map.clear(); },
    setAlarm: async (timeMs) => { alarms.push(timeMs); }
  };
};

/** A hibernatable server socket that records everything the room does to it. */
const makeSocket = () => ({
  sent: [],
  closed: null,
  attachment: null,
  send(data) { this.sent.push(JSON.parse(data)); },
  close(code, reason) { this.closed = { code, reason }; },
  serializeAttachment(value) { this.attachment = value; },
  deserializeAttachment() { return this.attachment; }
});

/** Deterministic time and entropy; every draw differs, and differently seeded rooms differ. */
const makeTools = (start) => {
  const state = { now: start, draws: 0 };
  return {
    state,
    tools: {
      now: () => state.now,
      randomBytes: (byteCount) => {
        state.draws += 1;
        return Uint8Array.from(
          { length: byteCount },
          (unused, index) => (start + state.draws * 37 + index * 11) % 256
        );
      },
      openSocketPair: () => {
        const server = makeSocket();
        return { client: { marker: server }, server };
      },
      upgradeResponse: () => new Response(null, { status: 200, headers: { "x-test-upgrade": "accepted" } })
    }
  };
};

const makeRoom = (start = CREATED_AT) => {
  const storage = makeStorage();
  const { state: clock, tools } = makeTools(start);
  const sockets = [];
  // The real gate defers new events until the callback settles; this fake queues the same way.
  let gate = Promise.resolve();
  const state = {
    storage,
    acceptWebSocket: (socket) => { sockets.push(socket); },
    getWebSockets: () => sockets.filter((socket) => socket.closed === null),
    blockConcurrencyWhile: (callback) => {
      const run = gate.then(() => callback());
      gate = run.then(() => undefined, () => undefined);
      return run;
    }
  };
  const room = new RoomObject(state, undefined, tools);
  return { room, storage, clock, sockets };
};

const initialize = (room, body, code = CODE) =>
  room.fetch(new Request(`https://rooms.invalid/rooms/${code}/initialize`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body)
  }));

/** Opens one socket through the forwarded upgrade and returns it. */
const connect = async (context) => {
  const response = await context.room.fetch(new Request(`https://draft.example/api/rooms/${CODE}/socket`, {
    headers: { upgrade: "websocket" }
  }));
  return { response, socket: context.sockets.at(-1) };
};

let commandCounter = 0;
const hello = (payload = {}) => JSON.stringify({
  protocolVersion: 1,
  commandId: `cmd-${(commandCounter += 1)}`,
  type: "hello",
  payload
});

/** Initializes a room and joins one socket; the everyday starting position. */
const openRoom = async (config = {}) => {
  const context = makeRoom();
  const created = await (await initialize(context.room, config)).json();
  const { socket } = await connect(context);
  return { ...context, created, socket };
};

const frames = (socket, type) => socket.sent.filter((frame) => frame.type === type);
const errorCode = async (response) => (await response.json()).error;

test("initialize answers 201 with the code and a one-time host claim", async () => {
  const { room, storage } = makeRoom();
  const response = await initialize(room, {});

  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(body.code, CODE);
  assert.match(body.hostClaim, /^[A-Za-z0-9_-]+$/u, "the claim travels URL-safe");
  assert.ok(body.hostClaim.length >= Math.floor((HOST_CLAIM_BYTES * 8) / 6), "the claim carries its full entropy");
  assert.ok(storage.map.has("room"), "the room exists before it is announced");
});

test("the snapshot stores verifiers, never the host claim or password plaintext", async () => {
  const { room, storage } = makeRoom();
  const response = await initialize(room, { password: "hunter2 correct battery" });
  const body = await response.json();

  const stored = JSON.stringify(storage.map.get("room"));
  assert.ok(!stored.includes(body.hostClaim), "the host claim is only ever in the 201 body");
  assert.ok(!stored.includes("hunter2"), "the password is stored only as a verifier");
  const snapshot = storage.map.get("room");
  assert.match(snapshot.password.salt, /^[0-9a-f]{32}$/u);
  assert.match(snapshot.password.digest, /^[0-9a-f]{64}$/u);
  assert.match(snapshot.hostClaim.digest, /^[0-9a-f]{64}$/u);
});

test("the same password in two rooms stores two different digests", async () => {
  const first = makeRoom();
  const second = makeRoom(CREATED_AT + 5);
  await initialize(first.room, { password: "same words" });
  await initialize(second.room, { password: "same words" }, "B2C3D4E5");

  assert.notEqual(
    first.storage.map.get("room").password.digest,
    second.storage.map.get("room").password.digest,
    "the salt is doing its work"
  );
});

test("defaults follow the product contract when the creator says nothing", async () => {
  const { room, storage } = makeRoom();
  await initialize(room, {});
  const snapshot = storage.map.get("room");

  assert.equal(snapshot.schema, 1);
  assert.equal(snapshot.code, CODE);
  assert.equal(snapshot.phase, "lobby");
  assert.equal(snapshot.stateVersion, 0);
  assert.equal(snapshot.createdAt, CREATED_AT);
  assert.equal(snapshot.password, null);
  assert.equal(snapshot.hostClaimSpent, false);
  assert.equal(snapshot.abandonAt, CREATED_AT + LOBBY_ABANDONMENT_MS);
  assert.deepEqual(snapshot.config, {
    name: "Draft room",
    timers: true,
    poolHidden: true,
    spectators: true,
    randomizeSeatsAtStart: true
  });
});

test("explicit configuration is honoured and trimmed", async () => {
  const { room, storage } = makeRoom();
  await initialize(room, {
    name: "  Friday night Omens  ",
    timers: false,
    poolHidden: false,
    spectators: false,
    randomizeSeatsAtStart: false
  });

  assert.deepEqual(storage.map.get("room").config, {
    name: "Friday night Omens",
    timers: false,
    poolHidden: false,
    spectators: false,
    randomizeSeatsAtStart: false
  });
});

test("a second initialize is refused with the one taken answer and changes nothing", async () => {
  const { room, storage } = makeRoom();
  await initialize(room, { name: "First claim" });
  const before = JSON.stringify(storage.map.get("room"));
  const alarmsBefore = storage.alarms.length;

  const again = await initialize(room, { name: "Second claim" });
  assert.equal(again.status, 409);
  assert.equal(await errorCode(again), "room_taken");
  assert.equal(JSON.stringify(storage.map.get("room")), before, "the first room is untouched");
  assert.equal(storage.alarms.length, alarmsBefore, "no second cleanup appointment");
});

test("initialize schedules the abandoned-lobby cleanup for exactly thirty minutes", async () => {
  const { room, storage } = makeRoom();
  await initialize(room, {});
  assert.deepEqual(storage.alarms, [CREATED_AT + LOBBY_ABANDONMENT_MS]);
});

const REFUSED_CONFIGS = [
  ["an unknown field", { name: "ok", theme: "dark" }],
  ["a non-string name", { name: 7 }],
  ["an empty name", { name: "   " }],
  ["an overlong name", { name: "n".repeat(61) }],
  ["a control character in the name", { name: "line\u0000break" }],
  ["a name of only zero-width characters", { name: "\u200b\u200b\u200b" }],
  ["a direction-override character in the name", { name: "safe\u202eevil" }],
  ["a name with nothing that renders", { name: "\u0301\u0301" }],
  ["a non-string password", { password: 12345 }],
  ["an empty password", { password: "" }],
  ["an overlong password", { password: "p".repeat(129) }],
  ["a control character in the password", { password: "pass\u0007word" }],
  ["a zero-width character in the password", { password: "pass\u200bword" }],
  ["a non-boolean timers flag", { timers: "yes" }],
  ["a non-boolean pool flag", { poolHidden: 1 }],
  ["a non-boolean spectators flag", { spectators: null }],
  ["a non-boolean randomization flag", { randomizeSeatsAtStart: "soon" }]
];

for (const [label, config] of REFUSED_CONFIGS) {
  test(`initialize refuses ${label} and leaves no room behind`, async () => {
    const { room, storage } = makeRoom();
    const response = await initialize(room, config);

    assert.equal(response.status, 400);
    assert.equal(await errorCode(response), "malformed_request");
    assert.equal(storage.map.size, 0, "a refused room does not exist");
    assert.equal(storage.alarms.length, 0, "a refused room needs no cleanup");
  });
}

test("initialize refuses bodies that are not one JSON object", async () => {
  for (const body of ["not json at all", "[]", "null", "42", '"config"']) {
    const { room, storage } = makeRoom();
    const response = await initialize(room, body);
    assert.equal(response.status, 400, body);
    assert.equal(storage.map.size, 0, body);
  }
});

test("initialize refuses a body past the limit without keeping any of it", async () => {
  const { room, storage } = makeRoom();
  const response = await initialize(room, `{"name":"${"n".repeat(5000)}"}`);
  assert.equal(response.status, 400);
  assert.equal(storage.map.size, 0);
});

test("initialize refuses a code our router could never have minted", async () => {
  for (const code of ["a1b2c3d4", "A1B2C3D", "A1B2C3DU", "A1B2-C3D4", "%41%31"]) {
    const { room, storage } = makeRoom();
    const response = await initialize(room, {}, code);
    assert.equal(response.status, 400, code);
    assert.equal(storage.map.size, 0, code);
    assert.ok(!(await response.text()).includes(code), "a refused code is never echoed");
  }
});

test("a refusal never repeats what the creator sent", async () => {
  const { room } = makeRoom();
  const response = await initialize(room, { password: "hunter2", theme: "dark" });
  const text = await response.text();
  assert.equal(response.status, 400);
  assert.ok(!text.includes("hunter2"));
  assert.ok(!text.includes("theme"));
});

test("only POST initializes and unknown paths stay unknown", async () => {
  const { room } = makeRoom();
  const got = await room.fetch(new Request(`https://rooms.invalid/rooms/${CODE}/initialize`));
  assert.equal(got.status, 405);
  const stray = await room.fetch(new Request("https://rooms.invalid/rooms"));
  assert.equal(stray.status, 404);
});

test("a socket into a room that does not exist is refused before it is accepted", async () => {
  const { room, sockets } = makeRoom();
  const response = await room.fetch(new Request(`https://draft.example/api/rooms/${CODE}/socket`, {
    headers: { upgrade: "websocket" }
  }));
  assert.equal(response.status, 404);
  assert.equal(sockets.length, 0, "no socket was accepted");
});

test("a socket request without an upgrade is refused even when the room exists", async () => {
  const context = makeRoom();
  await initialize(context.room, {});
  const response = await context.room.fetch(new Request(`https://draft.example/api/rooms/${CODE}/socket`));
  assert.equal(response.status, 426);
  assert.equal(context.sockets.length, 0);
});

test("an upgrade is accepted silently: the socket is nobody until its hello", async () => {
  const { response, socket } = await (async () => {
    const context = makeRoom();
    await initialize(context.room, {});
    return connect(context);
  })();

  assert.equal(response.headers.get("x-test-upgrade"), "accepted");
  assert.deepEqual(socket.sent, [], "nothing is volunteered before the gate");
  assert.equal(socket.attachment, null);
});

test("the first message must be a well-formed hello or the socket is done", async () => {
  for (const first of [
    JSON.stringify({ protocolVersion: 1, commandId: "c", type: "queue_pick", payload: {} }),
    JSON.stringify({ protocolVersion: 2, commandId: "c", type: "hello", payload: {} }),
    JSON.stringify({ protocolVersion: 1, commandId: "c", type: "hello", payload: {}, extra: true }),
    "not json"
  ]) {
    const { room, socket, storage } = await openRoom();
    const before = JSON.stringify(storage.map.get("room"));
    await room.webSocketMessage(socket, first);

    assert.equal(socket.closed?.code, REFUSED_CLOSE_CODE, first);
    assert.equal(frames(socket, "error").length, 1, first);
    assert.equal(frames(socket, "error")[0].stateVersion, 0, "the gate reveals no state");
    assert.equal(JSON.stringify(storage.map.get("room")), before, "nothing mutated");
  }
});

test("an oversized message is refused for its size, not read for its content", async () => {
  const { room, socket, storage } = await openRoom();
  // A perfectly valid hello, padded past the limit: size alone must condemn it.
  await room.webSocketMessage(socket, hello() + " ".repeat(MAX_MESSAGE_BYTES));
  assert.equal(frames(socket, "hello_ack").length, 0, "the padded hello was never processed");
  assert.equal(frames(socket, "error")[0].payload.code, "malformed_message");
  assert.equal(socket.closed?.code, REFUSED_CLOSE_CODE);
  assert.equal(storage.map.get("room").participants.length, 0);
});

test("the password gate answers wrong and missing the same way and gives nothing away", async () => {
  for (const payload of [{}, { password: "wrong words" }]) {
    const { room, socket, storage } = await openRoom({ password: "right words" });
    await room.webSocketMessage(socket, hello(payload));

    const [error] = frames(socket, "error");
    assert.equal(error.payload.code, "wrong_password");
    assert.equal(error.stateVersion, 0);
    assert.equal(socket.closed?.code, REFUSED_CLOSE_CODE);
    assert.equal(frames(socket, "snapshot").length, 0, "no room data before verification");
    assert.equal(storage.map.get("room").participants.length, 0, "nobody joined");
  }
});

test("a correct password opens the gate", async () => {
  const { room, socket } = await openRoom({ password: "right words" });
  await room.webSocketMessage(socket, hello({ password: "right words" }));
  assert.equal(frames(socket, "hello_ack").length, 1);
  assert.equal(socket.closed, null);
});

test("hello mints a credential, seats the drafter, and answers ack then snapshot", async () => {
  const { room, socket, storage } = await openRoom();
  await room.webSocketMessage(socket, hello());

  const [ack] = frames(socket, "hello_ack");
  assert.match(ack.payload.credential, /^[A-Za-z0-9_-]+$/u);
  assert.deepEqual(ack.payload.self, {
    id: ack.payload.self.id,
    name: "Drafter 1",
    host: false,
    connected: true,
    seat: 0
  });
  const [snapshot] = frames(socket, "snapshot");
  assert.equal(snapshot.payload.phase, "lobby");
  assert.equal(snapshot.payload.passwordProtected, false);
  assert.equal(snapshot.payload.self, ack.payload.self.id);
  assert.equal(snapshot.payload.participants.length, 1);
  assert.equal(storage.map.get("room").stateVersion, 1);
  assert.equal(storage.map.get("room").abandonAt, null, "someone is here; the appointment is off");
  assert.deepEqual(socket.attachment, { participantId: ack.payload.self.id, generation: 1 });
});

test("no frame a drafter receives ever carries a verifier or another identity's secret", async () => {
  const { room, socket, storage } = await openRoom({ password: "right words" });
  await room.webSocketMessage(socket, hello({ password: "right words" }));

  const everything = JSON.stringify(socket.sent);
  assert.ok(!everything.includes("digest"), "verifiers stay in storage");
  assert.ok(!everything.includes("salt"));
  assert.ok(!everything.includes("right words"), "the password never comes back");
  const stored = JSON.stringify(storage.map.get("room"));
  const [ack] = frames(socket, "hello_ack");
  assert.ok(!stored.includes(ack.payload.credential), "the credential is stored only as a verifier");
});

test("the host claim binds hostship once and is spent forever after", async () => {
  const { room, socket, storage, created, ...context } = await openRoom();
  await room.webSocketMessage(socket, hello({ hostClaim: created.hostClaim }));
  assert.equal(frames(socket, "hello_ack")[0].payload.self.host, true);
  assert.equal(storage.map.get("room").hostClaimSpent, true);

  const second = await connect({ room, ...context });
  await room.webSocketMessage(second.socket, hello({ hostClaim: created.hostClaim }));
  assert.equal(frames(second.socket, "error")[0].payload.code, "invalid_claim");
  assert.equal(second.socket.closed?.code, REFUSED_CLOSE_CODE);
});

test("a wrong host claim is refused outright", async () => {
  const { room, socket } = await openRoom();
  await room.webSocketMessage(socket, hello({ hostClaim: "not-the-claim" }));
  assert.equal(frames(socket, "error")[0].payload.code, "invalid_claim");
});

test("chosen names are validated and default names never collide", async () => {
  const { room, socket, ...context } = await openRoom();
  await room.webSocketMessage(socket, hello({ name: "  Karla  " }));
  assert.equal(frames(socket, "hello_ack")[0].payload.self.name, "Karla");

  const second = await connect({ room, ...context });
  await room.webSocketMessage(second.socket, hello());
  assert.equal(frames(second.socket, "hello_ack")[0].payload.self.name, "Drafter 1");

  const third = await connect({ room, ...context });
  await room.webSocketMessage(third.socket, hello({ name: "\u200b\u200b" }));
  assert.equal(frames(third.socket, "error")[0].payload.code, "invalid_name");
  assert.equal(third.socket.closed?.code, REFUSED_CLOSE_CODE);
});

test("joins fill the eight seats first and then the spectator row, up to the cap", async () => {
  const { room, ...context } = await openRoom();
  const seats = [];
  for (let joiner = 0; joiner < MAX_PARTICIPANTS; joiner += 1) {
    const { socket } = await connect({ room, ...context });
    await room.webSocketMessage(socket, hello());
    seats.push(frames(socket, "hello_ack")[0].payload.self.seat);
  }
  assert.deepEqual(seats.slice(0, LOBBY_SEAT_COUNT), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.ok(seats.slice(LOBBY_SEAT_COUNT).every((seat) => seat === null), "the rest are the spectator row");

  const { socket: overflow } = await connect({ room, ...context });
  await room.webSocketMessage(overflow, hello());
  assert.equal(frames(overflow, "error")[0].payload.code, "room_full");
  assert.equal(overflow.closed?.code, REFUSED_CLOSE_CODE);
});

test("a returning credential reclaims its identity and the older socket loses", async () => {
  const { room, socket, storage, ...context } = await openRoom();
  await room.webSocketMessage(socket, hello());
  const credential = frames(socket, "hello_ack")[0].payload.credential;
  const identity = frames(socket, "hello_ack")[0].payload.self.id;

  const second = await connect({ room, ...context });
  await room.webSocketMessage(second.socket, hello({ credential }));

  const [ack] = frames(second.socket, "hello_ack");
  assert.equal(ack.payload.self.id, identity, "the same identity, not a twin");
  assert.equal(ack.payload.credential, undefined, "no second credential is minted");
  assert.equal(storage.map.get("room").participants.length, 1);
  assert.equal(socket.closed?.code, SUPERSEDED_CLOSE_CODE, "the older socket is closed");
  assert.deepEqual(second.socket.attachment, { participantId: identity, generation: 2 });
});

test("an unknown credential joins as a fresh identity rather than failing", async () => {
  const { room, socket, storage } = await openRoom();
  await room.webSocketMessage(socket, hello({ credential: "stale-from-some-old-room" }));
  assert.equal(frames(socket, "hello_ack").length, 1);
  assert.equal(storage.map.get("room").participants.length, 1);
});

test("everyone already at the table hears about a join, but not the joiner twice", async () => {
  const { room, socket, ...context } = await openRoom();
  await room.webSocketMessage(socket, hello());

  const second = await connect({ room, ...context });
  await room.webSocketMessage(second.socket, hello());

  const [change] = frames(socket, "participants_changed");
  assert.equal(change.payload.participants.length, 2);
  assert.equal(frames(second.socket, "participants_changed").length, 0, "the snapshot already told them");
});

test("hello twice on one socket is an error without a door slam", async () => {
  const { room, socket } = await openRoom();
  await room.webSocketMessage(socket, hello());
  await room.webSocketMessage(socket, hello());
  assert.equal(frames(socket, "error")[0].payload.code, "already_authenticated");
  assert.equal(socket.closed, null, "an authenticated socket survives its mistakes");
});

test("a command the lobby does not know yet is a structured error, not a mutation", async () => {
  const { room, socket, storage } = await openRoom();
  await room.webSocketMessage(socket, hello());
  const before = JSON.stringify(storage.map.get("room"));
  await room.webSocketMessage(socket, JSON.stringify({
    protocolVersion: 1, commandId: "c2", type: "queue_pick", payload: {}
  }));
  assert.equal(frames(socket, "error")[0].payload.code, "unknown_command");
  assert.equal(JSON.stringify(storage.map.get("room")), before);
});

test("a closing socket marks its identity disconnected and tells the room", async () => {
  const { room, socket, storage, ...context } = await openRoom();
  await room.webSocketMessage(socket, hello());
  const second = await connect({ room, ...context });
  await room.webSocketMessage(second.socket, hello());

  socket.closed = { code: 1001, reason: "gone" };
  await room.webSocketClose(socket);

  const snapshot = storage.map.get("room");
  assert.deepEqual(snapshot.participants.map((entry) => entry.connected), [false, true]);
  assert.equal(snapshot.feed.at(-1).type, "disconnect");
  assert.equal(frames(second.socket, "participants_changed").length, 1);
  assert.equal(snapshot.abandonAt, null, "someone is still here");
});

test("the lobby's last disconnect books the abandonment appointment", async () => {
  const { room, socket, storage, clock } = await openRoom();
  await room.webSocketMessage(socket, hello());
  clock.now = CREATED_AT + 60_000;

  socket.closed = { code: 1001, reason: "gone" };
  await room.webSocketClose(socket);

  const snapshot = storage.map.get("room");
  assert.equal(snapshot.abandonAt, CREATED_AT + 60_000 + LOBBY_ABANDONMENT_MS);
  assert.equal(storage.alarms.at(-1), snapshot.abandonAt);
});

test("a superseded socket's close cannot mark the newer connection dead", async () => {
  const { room, socket, storage, ...context } = await openRoom();
  await room.webSocketMessage(socket, hello());
  const credential = frames(socket, "hello_ack")[0].payload.credential;
  const second = await connect({ room, ...context });
  await room.webSocketMessage(second.socket, hello({ credential }));

  await room.webSocketClose(socket);
  assert.equal(storage.map.get("room").participants[0].connected, true);
  assert.equal(storage.map.get("room").abandonAt, null);
});

test("a socket that never passed the gate closes without a trace", async () => {
  const { room, socket, storage } = await openRoom();
  const before = JSON.stringify(storage.map.get("room"));
  await room.webSocketClose(socket);
  assert.equal(JSON.stringify(storage.map.get("room")), before);
});

test("the due cleanup deletes an abandoned lobby whole and closes its doors", async () => {
  const { room, socket, storage, clock, sockets } = await openRoom();
  await room.webSocketMessage(socket, hello());
  clock.now = CREATED_AT + 60_000;
  socket.closed = { code: 1001, reason: "gone" };
  await room.webSocketClose(socket);

  clock.now = storage.map.get("room").abandonAt;
  await room.alarm();
  assert.equal(storage.map.size, 0, "nothing of the room survives");
  assert.ok(sockets.every((entry) => entry.closed !== null));
});

test("a reconnect cancels abandonment and a late alarm stays harmless", async () => {
  const { room, socket, storage, clock, ...context } = await openRoom();
  await room.webSocketMessage(socket, hello());
  const credential = frames(socket, "hello_ack")[0].payload.credential;
  clock.now = CREATED_AT + 60_000;
  socket.closed = { code: 1001, reason: "gone" };
  await room.webSocketClose(socket);
  const appointment = storage.map.get("room").abandonAt;

  const second = await connect({ room, ...context });
  await room.webSocketMessage(second.socket, hello({ credential }));
  assert.equal(storage.map.get("room").abandonAt, null);

  clock.now = appointment + 1;
  await room.alarm();
  assert.ok(storage.map.has("room"), "the reconnect saved the room");
});

test("an early cleanup wake rebooks the appointment instead of losing it", async () => {
  const { room, storage, clock } = await openRoom();
  const booked = storage.alarms.length;
  clock.now = CREATED_AT + LOBBY_ABANDONMENT_MS - 1;

  await room.alarm();
  assert.ok(storage.map.has("room"), "the lobby still has time");
  assert.equal(storage.alarms.length, booked + 1, "the early wake books the appointment again");
  assert.equal(storage.alarms.at(-1), CREATED_AT + LOBBY_ABANDONMENT_MS, "for the same moment, not a later one");
});

test("a never-joined lobby is deleted at its original appointment", async () => {
  const { room, storage, clock } = await openRoom();
  clock.now = CREATED_AT + LOBBY_ABANDONMENT_MS;
  await room.alarm();
  assert.equal(storage.map.size, 0);
});

test("cleanup leaves a connected lobby and a started draft alone", async () => {
  const occupied = await openRoom();
  await occupied.room.webSocketMessage(occupied.socket, hello());
  occupied.clock.now = CREATED_AT + LOBBY_ABANDONMENT_MS + 1;
  await occupied.room.alarm();
  assert.ok(occupied.storage.map.has("room"), "a connected lobby is not abandoned");

  const started = await openRoom();
  started.storage.map.set("room", { ...started.storage.map.get("room"), phase: "picking" });
  started.clock.now = CREATED_AT + LOBBY_ABANDONMENT_MS + 1;
  await started.room.alarm();
  assert.ok(started.storage.map.has("room"), "a started draft is not the lobby reaper's business");
});

test("two hellos arriving at once both join, one at a time", async () => {
  const { room, socket, ...context } = await openRoom();
  const second = await connect({ room, ...context });
  await Promise.all([
    room.webSocketMessage(socket, hello()),
    room.webSocketMessage(second.socket, hello())
  ]);

  const snapshot = context.storage.map.get("room");
  assert.equal(snapshot.participants.length, 2, "neither join was lost to the other");
  assert.deepEqual(snapshot.participants.map((entry) => entry.seat), [0, 1]);
  assert.deepEqual(snapshot.participants.map((entry) => entry.name), ["Drafter 1", "Drafter 2"]);
});

test("the host claim cannot be double-spent by a race", async () => {
  const { room, socket, created, ...context } = await openRoom();
  const second = await connect({ room, ...context });
  await Promise.all([
    room.webSocketMessage(socket, hello({ hostClaim: created.hostClaim })),
    room.webSocketMessage(second.socket, hello({ hostClaim: created.hostClaim }))
  ]);

  const hosts = context.storage.map.get("room").participants.filter((entry) => entry.host);
  assert.equal(hosts.length, 1, "exactly one host, however close the race");
  const refusals = [...frames(socket, "error"), ...frames(second.socket, "error")];
  assert.equal(refusals.length, 1);
  assert.equal(refusals[0].payload.code, "invalid_claim");
});

test("two initializes arriving at once mint exactly one room", async () => {
  const { room } = makeRoom();
  const [first, second] = await Promise.all([
    initialize(room, { name: "First" }),
    initialize(room, { name: "Second" })
  ]);
  assert.deepEqual([first.status, second.status].sort(), [201, 409]);
});

test("a join books the standing liveness appointment", async () => {
  const { room, socket, storage, clock } = await openRoom();
  clock.now = CREATED_AT + 1_000;
  await room.webSocketMessage(socket, hello());
  assert.equal(storage.alarms.at(-1), CREATED_AT + 1_000 + LOBBY_ABANDONMENT_MS);
});

test("a lobby whose sockets died without goodbyes is still reaped", async () => {
  const { room, socket, storage, clock } = await openRoom();
  await room.webSocketMessage(socket, hello());
  // The deploy scenario: the socket is simply gone, and no close event ever arrives.
  socket.closed = { code: 1006, reason: "" };

  clock.now = CREATED_AT + LOBBY_ABANDONMENT_MS;
  await room.alarm();
  const swept = storage.map.get("room");
  assert.equal(swept.participants[0].connected, false, "the ghost is found out");
  assert.equal(swept.abandonAt, clock.now + LOBBY_ABANDONMENT_MS, "and the abandonment clock starts");
  assert.equal(storage.alarms.at(-1), swept.abandonAt);

  clock.now = swept.abandonAt;
  await room.alarm();
  assert.equal(storage.map.size, 0, "the leak is closed");
});

test("the liveness sweep leaves a live lobby alone and keeps watching", async () => {
  const { room, socket, storage, clock } = await openRoom();
  await room.webSocketMessage(socket, hello());

  clock.now = CREATED_AT + LOBBY_ABANDONMENT_MS;
  await room.alarm();
  const snapshot = storage.map.get("room");
  assert.equal(snapshot.participants[0].connected, true);
  assert.equal(snapshot.abandonAt, null);
  assert.equal(storage.alarms.at(-1), clock.now + LOBBY_ABANDONMENT_MS, "the watch continues");
});

test("duplicate due alarms cannot resurrect or damage anything", async () => {
  const { room, storage, clock } = await openRoom();
  clock.now = CREATED_AT + LOBBY_ABANDONMENT_MS + 1;
  await room.alarm();
  await room.alarm();
  assert.equal(storage.map.size, 0);
});
