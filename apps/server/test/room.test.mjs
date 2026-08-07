import assert from "node:assert/strict";
import test from "node:test";

import {
  HOST_CLAIM_BYTES,
  LOBBY_ABANDONMENT_MS,
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

/** Deterministic time and entropy; every draw differs, and differently seeded rooms differ. */
const makeTools = (start = CREATED_AT) => {
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
      }
    }
  };
};

const makeRoom = (start = CREATED_AT) => {
  const storage = makeStorage();
  const { state, tools } = makeTools(start);
  const room = new RoomObject({ storage }, undefined, tools);
  return { room, storage, clock: state };
};

const initialize = (room, body, code = CODE) =>
  room.fetch(new Request(`https://rooms.invalid/rooms/${code}/initialize`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body)
  }));

const errorCode = async (response) => (await response.json()).error;

test("initialize answers 201 with the code and a one-time host claim", async () => {
  const { room, storage } = makeRoom();
  const response = await initialize(room, {});

  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
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
  const { config, password, phase, stateVersion, schema, code, createdAt } = storage.map.get("room");

  assert.equal(schema, 1);
  assert.equal(code, CODE);
  assert.equal(phase, "lobby");
  assert.equal(stateVersion, 0);
  assert.equal(createdAt, CREATED_AT);
  assert.equal(password, null);
  assert.deepEqual(config, {
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
  const { config } = storage.map.get("room");

  assert.deepEqual(config, {
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

test("only POST initializes; the socket route says the room is not ready; the rest is unknown", async () => {
  const { room } = makeRoom();

  const got = await room.fetch(new Request(`https://rooms.invalid/rooms/${CODE}/initialize`));
  assert.equal(got.status, 405);

  const socket = await room.fetch(new Request(`https://example.com/api/rooms/${CODE}/socket`));
  assert.equal(socket.status, 501);
  assert.equal(await errorCode(socket), "room_not_ready");

  const stray = await room.fetch(new Request("https://rooms.invalid/rooms"));
  assert.equal(stray.status, 404);
});

test("the due cleanup alarm deletes a never-joined lobby whole", async () => {
  const { room, storage, clock } = makeRoom();
  await initialize(room, { password: "secret words" });
  clock.now = CREATED_AT + LOBBY_ABANDONMENT_MS;

  await room.alarm();
  assert.equal(storage.map.size, 0, "nothing of the room survives");
});

test("an early alarm keeps the appointment instead of losing it", async () => {
  const { room, storage, clock } = makeRoom();
  await initialize(room, {});
  const booked = storage.alarms.length;
  clock.now = CREATED_AT + LOBBY_ABANDONMENT_MS - 1;

  await room.alarm();
  assert.ok(storage.map.has("room"), "the lobby still has time");
  assert.equal(storage.alarms.length, booked + 1, "the early wake books the appointment again");
  assert.equal(storage.alarms.at(-1), CREATED_AT + LOBBY_ABANDONMENT_MS, "for the same moment, not a later one");
});

test("a late or duplicate alarm cannot resurrect or damage anything", async () => {
  const { room, storage, clock } = makeRoom();
  await initialize(room, {});
  clock.now = CREATED_AT + LOBBY_ABANDONMENT_MS + 1;
  await room.alarm();
  await room.alarm();
  assert.equal(storage.map.size, 0);
});

test("the cleanup alarm leaves a room alone once it is out of the lobby or occupied", async () => {
  const occupied = makeRoom();
  await initialize(occupied.room, {});
  occupied.storage.map.set("room", { ...occupied.storage.map.get("room"), participants: [{ id: "p1" }] });
  occupied.clock.now = CREATED_AT + LOBBY_ABANDONMENT_MS + 1;
  await occupied.room.alarm();
  assert.ok(occupied.storage.map.has("room"), "an occupied lobby is not abandoned");

  const started = makeRoom();
  await initialize(started.room, {});
  started.storage.map.set("room", { ...started.storage.map.get("room"), phase: "picking" });
  started.clock.now = CREATED_AT + LOBBY_ABANDONMENT_MS + 1;
  await started.room.alarm();
  assert.ok(started.storage.map.has("room"), "a started draft is not the lobby reaper's business");
});
