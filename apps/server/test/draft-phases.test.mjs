import assert from "node:assert/strict";
import test from "node:test";

import {
  COMPLETED_ROOM_TTL_MS,
  CONFIRMATION_SECONDS,
  PICK_SECONDS,
  REVIEW_SECONDS,
  RoomObject
} from "../src/room.ts";
import { PACK_SIZE } from "../src/packs.ts";

const CODE = "A1B2C3D4";
const CREATED_AT = 1_700_000_000_000;

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

const makeSocket = () => ({
  sent: [],
  closed: null,
  attachment: null,
  send(data) { this.sent.push(JSON.parse(data)); },
  close(code, reason) { this.closed = { code, reason }; },
  serializeAttachment(value) { this.attachment = value; },
  deserializeAttachment() { return this.attachment; }
});

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

const initialize = (room, body) =>
  room.fetch(new Request(`https://rooms.invalid/rooms/${CODE}/initialize`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  }));

const connect = async (context) => {
  const response = await context.room.fetch(new Request(`https://draft.example/api/rooms/${CODE}/socket`, {
    headers: { upgrade: "websocket" }
  }));
  return { response, socket: context.sockets.at(-1) };
};

let commandCounter = 0;
const envelope = (type, payload = {}) => JSON.stringify({
  protocolVersion: 1,
  commandId: `cmd-${(commandCounter += 1)}`,
  type,
  payload
});

const frames = (socket, type) => socket.sent.filter((frame) => frame.type === type);
const lastError = (socket) => frames(socket, "error").at(-1);

/** A lobby with a bound host and one guest, both seated, ready to start. These tests pin the
 * pure human mechanics, so the table stays botless unless a test says otherwise. */
const openLobby = async (config = {}) => {
  const context = makeRoom();
  const created = await (await initialize(context.room, { bots: false, ...config })).json();
  const { socket: host } = await connect(context);
  await context.room.webSocketMessage(host, envelope("hello", { hostClaim: created.hostClaim }));
  const { socket: guest } = await connect(context);
  await context.room.webSocketMessage(guest, envelope("hello", {}));
  return {
    ...context,
    created,
    host,
    guest,
    hostId: frames(host, "hello_ack")[0].payload.self.id,
    guestId: frames(guest, "hello_ack")[0].payload.self.id
  };
};

const startDraft = async (lobby) => {
  const version = lobby.storage.map.get("room").stateVersion;
  await lobby.room.webSocketMessage(lobby.host, envelope("start_draft", { expectedStateVersion: version }));
};

const privateViews = (socket) => frames(socket, "private_pack_pool");

test("starting the draft needs the host, the current room, and a real table", async () => {
  const lobby = await openLobby();
  const version = lobby.storage.map.get("room").stateVersion;

  await lobby.room.webSocketMessage(lobby.guest, envelope("start_draft", { expectedStateVersion: version }));
  assert.equal(lastError(lobby.guest).payload.code, "forbidden");

  await lobby.room.webSocketMessage(lobby.host, envelope("start_draft", { expectedStateVersion: version - 1 }));
  assert.equal(lastError(lobby.host).payload.code, "stale_state", "the host starts the room they are looking at");

  assert.equal(lobby.storage.map.get("room").phase, "lobby", "nothing started");
});

test("one seated drafter is a legal table of one", async () => {
  const context = makeRoom();
  const created = await (await initialize(context.room, { bots: false })).json();
  const { socket: host } = await connect(context);
  await context.room.webSocketMessage(host, envelope("hello", { hostClaim: created.hostClaim }));
  const version = context.storage.map.get("room").stateVersion;

  await context.room.webSocketMessage(host, envelope("start_draft", { expectedStateVersion: version }));
  assert.equal(context.storage.map.get("room").phase, "picking",
    "trying the room out alone is exactly what a table of one is for");
  assert.equal(context.storage.map.get("room").draft.seats.length, 1);
});

test("the start transaction deals the whole draft before anyone hears it began", async () => {
  const lobby = await openLobby();
  await startDraft(lobby);

  const snapshot = lobby.storage.map.get("room");
  assert.equal(snapshot.phase, "picking");
  assert.equal(snapshot.config.randomizeSeatsAtStart, false, "the pending shuffle is spent by starting");
  assert.equal(snapshot.feed.at(-1).type, "start");
  assert.equal(snapshot.deadlineAt, CREATED_AT + PICK_SECONDS[PACK_SIZE] * 1000);
  assert.equal(lobby.storage.alarms.at(-1), snapshot.deadlineAt, "the first pick's deadline is booked");

  const draft = snapshot.draft;
  assert.equal(draft.seats.length, 2);
  assert.deepEqual(draft.seats.map((seat) => seat.occupantId).sort(), [lobby.guestId, lobby.hostId].sort());
  assert.equal(draft.packsInFlight.length, 2);
  assert.ok(draft.packsInFlight.every((pack) => pack.cards.length === PACK_SIZE));
  assert.ok(draft.packsInFlight.every((pack) => pack.cards.every((card) => /^OMN\d+$/u.test(card.cardId))),
    "every dealt card is a real snapshot identity");
  assert.equal(draft.unopenedRounds.length, 2, "rounds two and three wait unopened");

  const [phase] = frames(lobby.guest, "phase_changed");
  assert.equal(phase.payload.phase, "picking");
  assert.equal(phase.payload.packSize, PACK_SIZE);
  assert.ok(phase.payload.seats.every((seat) => seat.hasQueued === false));
  const [deadline] = frames(lobby.guest, "deadline_changed");
  assert.equal(deadline.payload.deadlineAt, snapshot.deadlineAt);

  const [hostView] = privateViews(lobby.host);
  const [guestView] = privateViews(lobby.guest);
  assert.equal(hostView.payload.pack.cards.length, PACK_SIZE);
  assert.equal(guestView.payload.pack.cards.length, PACK_SIZE);
  assert.equal(guestView.payload.pool, null, "the default pool option is face down while picking");
  assert.equal(guestView.payload.queued, null);
  assert.notEqual(hostView.payload.seatId, guestView.payload.seatId);
});

test("a second start has no lobby to start", async () => {
  const lobby = await openLobby();
  await startDraft(lobby);
  await lobby.room.webSocketMessage(lobby.host, envelope("start_draft", {
    expectedStateVersion: lobby.storage.map.get("room").stateVersion
  }));
  assert.equal(lastError(lobby.host).payload.code, "wrong_phase");
});

test("with the shuffle disarmed, the ring is exactly the lobby order", async () => {
  const lobby = await openLobby();
  await lobby.room.webSocketMessage(lobby.host, envelope("set_seat_randomization", {
    mode: "randomize_at_start", enabled: false
  }));
  await startDraft(lobby);

  const draft = lobby.storage.map.get("room").draft;
  assert.deepEqual(draft.seats.map((seat) => seat.occupantId), [lobby.hostId, lobby.guestId],
    "seat zero leads the ring, exactly as arranged");
});

test("queueing a pick answers the drafter and tells the table only that they queued", async () => {
  const lobby = await openLobby();
  await startDraft(lobby);
  const view = privateViews(lobby.guest)[0].payload;
  const chosen = view.pack.cards[3].instanceId;

  await lobby.room.webSocketMessage(lobby.guest, envelope("queue_pick", {
    round: 1, pick: 1, cardInstanceId: chosen
  }));

  assert.equal(frames(lobby.guest, "ack").at(-1).payload.queued, chosen);
  const snapshot = lobby.storage.map.get("room");
  assert.equal(snapshot.draft.provisionalPicks.length, 1);
  assert.equal(snapshot.draft.provisionalPicks[0].cardInstanceId, chosen);
  const status = frames(lobby.host, "queue_status_changed").at(-1);
  assert.equal(status.payload.seatId, view.seatId);
  assert.equal(status.payload.hasQueued, true);
  assert.ok(!JSON.stringify(frames(lobby.host, "queue_status_changed")).includes(chosen),
    "the queued identity is the drafter's own business");
});

test("a replacement pick replaces; a foreign or stale pick does not land", async () => {
  const lobby = await openLobby();
  await startDraft(lobby);
  const view = privateViews(lobby.guest)[0].payload;

  await lobby.room.webSocketMessage(lobby.guest, envelope("queue_pick", {
    round: 1, pick: 1, cardInstanceId: view.pack.cards[0].instanceId
  }));
  await lobby.room.webSocketMessage(lobby.guest, envelope("queue_pick", {
    round: 1, pick: 1, cardInstanceId: view.pack.cards[1].instanceId
  }));
  const picks = lobby.storage.map.get("room").draft.provisionalPicks;
  assert.equal(picks.length, 1, "one seat, one queue");
  assert.equal(picks[0].cardInstanceId, view.pack.cards[1].instanceId);

  await lobby.room.webSocketMessage(lobby.guest, envelope("queue_pick", {
    round: 1, pick: 1, cardInstanceId: "not-a-card-here"
  }));
  assert.equal(lastError(lobby.guest).payload.code, "invalid_target");

  await lobby.room.webSocketMessage(lobby.guest, envelope("queue_pick", {
    round: 1, pick: 7, cardInstanceId: view.pack.cards[2].instanceId
  }));
  assert.equal(lastError(lobby.guest).payload.code, "stale_state");
});

test("when every connected drafter has queued, the pick closes in five seconds, once", async () => {
  const lobby = await openLobby();
  await startDraft(lobby);
  const before = lobby.storage.map.get("room").deadlineAt;
  const hostView = privateViews(lobby.host)[0].payload;
  const guestView = privateViews(lobby.guest)[0].payload;

  await lobby.room.webSocketMessage(lobby.host, envelope("queue_pick", {
    round: 1, pick: 1, cardInstanceId: hostView.pack.cards[0].instanceId
  }));
  assert.equal(lobby.storage.map.get("room").deadlineAt, before, "one queue is not everyone");

  await lobby.room.webSocketMessage(lobby.guest, envelope("queue_pick", {
    round: 1, pick: 1, cardInstanceId: guestView.pack.cards[0].instanceId
  }));
  const accelerated = lobby.storage.map.get("room");
  assert.equal(accelerated.deadlineAt, CREATED_AT + CONFIRMATION_SECONDS * 1000);
  assert.equal(accelerated.deadlineAccelerated, true);
  assert.equal(lobby.storage.alarms.at(-1), accelerated.deadlineAt);

  lobby.clock.now += 1000;
  await lobby.room.webSocketMessage(lobby.guest, envelope("queue_pick", {
    round: 1, pick: 1, cardInstanceId: guestView.pack.cards[1].instanceId
  }));
  assert.equal(lobby.storage.map.get("room").deadlineAt, accelerated.deadlineAt,
    "a replacement never extends the confirmation, even a second later");
});

test("the deadline commits the queued and draws for the silent", async () => {
  const lobby = await openLobby();
  await startDraft(lobby);
  const guestView = privateViews(lobby.guest)[0].payload;
  const chosen = guestView.pack.cards[5].instanceId;
  await lobby.room.webSocketMessage(lobby.guest, envelope("queue_pick", {
    round: 1, pick: 1, cardInstanceId: chosen
  }));

  lobby.clock.now = lobby.storage.map.get("room").deadlineAt;
  await lobby.room.alarm();

  const snapshot = lobby.storage.map.get("room");
  assert.equal(snapshot.draft.pick, 2);
  assert.ok(snapshot.draft.pickedPools.every((pool) => pool.cards.length === 1),
    "the silent seat drew its fate too");
  const guestPool = snapshot.draft.pickedPools.find((pool) =>
    snapshot.draft.seats.find((seat) => seat.id === pool.seatId).occupantId === lobby.guestId);
  assert.equal(guestPool.cards[0].instanceId, chosen, "the queued card is the committed card");
  assert.equal(snapshot.deadlineAt, lobby.clock.now + PICK_SECONDS[PACK_SIZE - 1] * 1000);
  assert.equal(snapshot.deadlineAccelerated, false);

  const phase = frames(lobby.guest, "phase_changed").at(-1);
  assert.equal(phase.payload.pick, 2);
  assert.equal(phase.payload.packSize, PACK_SIZE - 1);
  assert.ok(phase.payload.seats.every((seat) => seat.hasQueued === false));
  const fresh = privateViews(lobby.guest).at(-1).payload;
  assert.equal(fresh.pack.cards.length, PACK_SIZE - 1, "the passed pack arrives");
});

test("packs pass: the card you see next pick came from your neighbour", async () => {
  const lobby = await openLobby();
  await startDraft(lobby);
  const hostPackId = privateViews(lobby.host)[0].payload.pack.id;

  lobby.clock.now = lobby.storage.map.get("room").deadlineAt;
  await lobby.room.alarm();

  const guestNext = privateViews(lobby.guest).at(-1).payload;
  assert.equal(guestNext.pack.id, hostPackId, "round one passes left");
});

test("before any commit, a drafter has never seen a card of the other pack", async () => {
  const lobby = await openLobby();
  await startDraft(lobby);
  const hostInstances = privateViews(lobby.host)[0].payload.pack.cards.map((card) => card.instanceId);
  const guestFrames = JSON.stringify(lobby.guest.sent);
  assert.ok(hostInstances.every((instance) => !guestFrames.includes(instance)),
    "the other seat's pack is invisible until it is passed");
  assert.ok(!guestFrames.includes("digest"));
  assert.ok(!guestFrames.includes("salt"));
});

test("a whole draft runs to completion on deadlines alone and then the room expires", async () => {
  const lobby = await openLobby();
  await startDraft(lobby);

  let guard = 0;
  for (;;) {
    const snapshot = lobby.storage.map.get("room");
    if (snapshot.phase === "complete") break;
    assert.ok(guard < 60, "the draft must complete");
    guard += 1;
    lobby.clock.now = snapshot.deadlineAt;
    await lobby.room.alarm();
  }

  const finished = lobby.storage.map.get("room");
  assert.ok(finished.draft.pickedPools.every((pool) => pool.cards.length === 3 * PACK_SIZE),
    "two drafters, three packs each, every card accounted for");
  assert.equal(finished.feed.at(-1).type, "completion");
  assert.equal(finished.deadlineAt, lobby.clock.now + COMPLETED_ROOM_TTL_MS);

  const reviews = frames(lobby.guest, "phase_changed")
    .filter((frame) => frame.payload.phase === "review");
  assert.equal(reviews.length, 2, "one review after pack one, one after pack two");

  const finalView = privateViews(lobby.guest).at(-1).payload;
  assert.equal(finalView.pool.length, 3 * PACK_SIZE, "the finished pile is face up");

  lobby.clock.now = finished.deadlineAt;
  await lobby.room.alarm();
  assert.equal(lobby.storage.map.size, 0, "the finished room expires whole");
  await lobby.room.alarm();
  assert.equal(lobby.storage.map.size, 0);
});

test("the review pauses the table for a minute and shows the pile face up", async () => {
  const lobby = await openLobby();
  await startDraft(lobby);

  for (let commit = 0; commit < PACK_SIZE - 1; commit += 1) {
    lobby.clock.now = lobby.storage.map.get("room").deadlineAt;
    await lobby.room.alarm();
  }

  const review = lobby.storage.map.get("room");
  assert.equal(review.phase, "review");
  assert.equal(review.draft.round, 2, "the draft itself has already advanced");
  assert.equal(review.deadlineAt, lobby.clock.now + REVIEW_SECONDS * 1000);
  const reviewView = privateViews(lobby.guest).at(-1).payload;
  assert.equal(reviewView.pool.length, PACK_SIZE, "the pile turns face up for the review");

  lobby.clock.now = review.deadlineAt;
  await lobby.room.alarm();
  const resumed = lobby.storage.map.get("room");
  assert.equal(resumed.phase, "picking");
  assert.equal(resumed.deadlineAt, lobby.clock.now + PICK_SECONDS[PACK_SIZE] * 1000);
  const nextView = privateViews(lobby.guest).at(-1).payload;
  assert.equal(nextView.pack.cards.length, PACK_SIZE, "pack two is dealt fresh");
  assert.equal(nextView.pool, null, "and the pile is face down again");
});

test("with timers off, the pick waits for everyone and then closes in five seconds", async () => {
  const lobby = await openLobby({ timers: false });
  await startDraft(lobby);
  assert.equal(lobby.storage.map.get("room").deadlineAt, null, "no clock until everyone queues");

  const hostView = privateViews(lobby.host)[0].payload;
  const guestView = privateViews(lobby.guest)[0].payload;
  await lobby.room.webSocketMessage(lobby.host, envelope("queue_pick", {
    round: 1, pick: 1, cardInstanceId: hostView.pack.cards[0].instanceId
  }));
  assert.equal(lobby.storage.map.get("room").deadlineAt, null);

  await lobby.room.webSocketMessage(lobby.guest, envelope("queue_pick", {
    round: 1, pick: 1, cardInstanceId: guestView.pack.cards[0].instanceId
  }));
  const confirmed = lobby.storage.map.get("room");
  assert.equal(confirmed.deadlineAt, CREATED_AT + CONFIRMATION_SECONDS * 1000);

  lobby.clock.now = confirmed.deadlineAt;
  await lobby.room.alarm();
  const next = lobby.storage.map.get("room");
  assert.equal(next.draft.pick, 2);
  assert.equal(next.deadlineAt, null, "the next pick waits again");
});

test("a disconnect shrinks the table's patience to the ones still here", async () => {
  const lobby = await openLobby();
  await startDraft(lobby);
  const hostView = privateViews(lobby.host)[0].payload;
  await lobby.room.webSocketMessage(lobby.host, envelope("queue_pick", {
    round: 1, pick: 1, cardInstanceId: hostView.pack.cards[0].instanceId
  }));

  lobby.guest.closed = { code: 1001, reason: "gone" };
  await lobby.room.webSocketClose(lobby.guest);

  const snapshot = lobby.storage.map.get("room");
  assert.equal(snapshot.deadlineAt, CREATED_AT + CONFIRMATION_SECONDS * 1000,
    "everyone still here has queued, so the pick closes");
  const seat = snapshot.draft.seats.find((entry) => entry.occupantId === lobby.guestId);
  assert.equal(seat.connected, false, "the seat notes the absence and is never vacated");
});

test("a drafter reconnecting mid-draft gets the draft back, not a lobby", async () => {
  const lobby = await openLobby();
  await startDraft(lobby);
  const credential = frames(lobby.guest, "hello_ack")[0].payload.credential;
  lobby.guest.closed = { code: 1001, reason: "gone" };
  await lobby.room.webSocketClose(lobby.guest);

  const bookedBefore = lobby.storage.alarms.at(-1);
  const { socket: back } = await connect(lobby);
  await lobby.room.webSocketMessage(back, envelope("hello", { credential }));
  assert.equal(lobby.storage.alarms.at(-1), bookedBefore,
    "a reconnect never overwrites the draft's own deadline");

  const snapshot = frames(back, "snapshot")[0];
  assert.equal(snapshot.payload.phase, "picking");
  assert.equal(snapshot.payload.draft.packSize, PACK_SIZE);
  const view = privateViews(back)[0].payload;
  assert.equal(view.pack.cards.length, PACK_SIZE, "their pack is waiting where they left it");
  const seat = lobby.storage.map.get("room").draft.seats.find((entry) => entry.occupantId === lobby.guestId);
  assert.equal(seat.connected, true);
});

test("a stranger mid-draft is a spectator, or nothing where spectators are off", async () => {
  const open = await openLobby();
  await startDraft(open);
  const { socket: watcher } = await connect(open);
  await open.room.webSocketMessage(watcher, envelope("hello", {}));
  const ack = frames(watcher, "hello_ack")[0];
  assert.equal(ack.payload.self.seat, null, "no seat is created after start");
  assert.equal(privateViews(watcher).length, 0, "a spectator holds no seat and sees no private pack");
  await open.room.webSocketMessage(watcher, envelope("queue_pick", {
    round: 1, pick: 1, cardInstanceId: "anything"
  }));
  assert.equal(lastError(watcher).payload.code, "forbidden");

  const closed = await openLobby({ spectators: false });
  await startDraft(closed);
  const { socket: refused } = await connect(closed);
  await closed.room.webSocketMessage(refused, envelope("hello", {}));
  assert.equal(lastError(refused).payload.code, "spectators_disabled");
  assert.equal(refused.closed?.code, 4001);
});

test("bots fill the empty seats by default and the lone host drafts a full pod", async () => {
  const context = makeRoom();
  const created = await (await initialize(context.room, {})).json();
  const { socket: host } = await connect(context);
  await context.room.webSocketMessage(host, envelope("hello", { hostClaim: created.hostClaim }));
  const version = context.storage.map.get("room").stateVersion;
  await context.room.webSocketMessage(host, envelope("start_draft", { expectedStateVersion: version }));

  const snapshot = context.storage.map.get("room");
  assert.equal(snapshot.phase, "picking");
  assert.equal(snapshot.draft.seats.length, 8, "the table fills to a full pod");
  assert.equal(snapshot.draft.seats.filter((seat) => seat.controller === "bot").length, 7);
  assert.equal(snapshot.draft.provisionalPicks.length, 7, "every bot queued before anyone heard the start");

  const announced = frames(host, "phase_changed").at(-1);
  const botSeats = announced.payload.seats.filter((seat) => seat.bot === true);
  assert.equal(botSeats.length, 7, "the table can see which seats are bots");
  assert.ok(botSeats.every((seat) => seat.participantId === null), "a bot seat names no participant");
  assert.ok(botSeats.every((seat) => seat.hasQueued === true), "and every bot shows as picked");

  const view = privateViews(host).at(-1);
  assert.equal(view.payload.pack.cards.length, 14, "the human's pack is untouched by bot queues");
});

test("after the human queues, the confirmation closes the pick and the bots queue again", async () => {
  const context = makeRoom();
  const created = await (await initialize(context.room, {})).json();
  const { socket: host } = await connect(context);
  await context.room.webSocketMessage(host, envelope("hello", { hostClaim: created.hostClaim }));
  const version = context.storage.map.get("room").stateVersion;
  await context.room.webSocketMessage(host, envelope("start_draft", { expectedStateVersion: version }));

  const view = privateViews(host).at(-1);
  await context.room.webSocketMessage(host, envelope("queue_pick", {
    round: 1, pick: 1, cardInstanceId: view.payload.pack.cards[0].instanceId
  }));
  const queuedRoom = context.storage.map.get("room");
  assert.ok(queuedRoom.deadlineAt <= context.clock.now + 5_000,
    "with the whole table queued, the confirmation floor is the only wait");

  context.clock.now = queuedRoom.deadlineAt;
  await context.room.alarm();
  const advanced = context.storage.map.get("room");
  assert.equal(advanced.draft.pick, 2, "the pick resolved");
  assert.equal(advanced.draft.provisionalPicks.length, 7, "the bots queued for the fresh pick at once");
  assert.equal(advanced.draft.provisionalPicks.filter((entry) => entry.seatId === "seat-1").length, 0,
    "and the human has not");
});

test("bots off is a humans-only table, exactly as before", async () => {
  const lobby = await openLobby();
  await startDraft(lobby);
  const snapshot = lobby.storage.map.get("room");
  assert.equal(snapshot.draft.seats.length, 2);
  assert.ok(snapshot.draft.seats.every((seat) => seat.controller === "human"));
  assert.equal(snapshot.draft.provisionalPicks.length, 0, "nobody queues on anyone's behalf");
});
