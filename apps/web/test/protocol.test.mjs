import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_COMMAND_BYTES,
  RECONNECT_BASE_MS,
  RECONNECT_MAX_MS,
  backoffMs,
  buildCommand,
  credentialStorageKey,
  fellBehind,
  initialClock,
  observeClock,
  readFrame,
  remainingMs,
  serverNow
} from "../src/protocol.ts";

test("a command travels as exactly the envelope and nothing more", () => {
  const text = buildCommand("c7", "queue_pick", { round: 1, pick: 2, cardInstanceId: "r1s1-3" });
  assert.deepEqual(JSON.parse(text), {
    protocolVersion: 1,
    commandId: "c7",
    type: "queue_pick",
    payload: { round: 1, pick: 2, cardInstanceId: "r1s1-3" }
  });
});

test("a command past the ceiling refuses to exist", () => {
  assert.throws(() => buildCommand("c1", "hello", { name: "n".repeat(MAX_COMMAND_BYTES) }), RangeError);
});

test("frames are read strictly and anything else is quietly nothing", () => {
  const sound = JSON.stringify({
    protocolVersion: 1, stateVersion: 4, type: "ack", commandId: "c1", serverNow: 1000, payload: { applied: true }
  });
  assert.deepEqual(readFrame(sound), {
    stateVersion: 4, type: "ack", commandId: "c1", serverNow: 1000, payload: { applied: true }
  });

  for (const wrong of [
    undefined,
    "",
    "not json",
    JSON.stringify([]),
    JSON.stringify({ protocolVersion: 2, stateVersion: 1, type: "ack", serverNow: 1, payload: {} }),
    JSON.stringify({ protocolVersion: 1, stateVersion: "4", type: "ack", serverNow: 1, payload: {} }),
    JSON.stringify({ protocolVersion: 1, stateVersion: 1, type: "", serverNow: 1, payload: {} }),
    JSON.stringify({ protocolVersion: 1, stateVersion: 1, type: "ack", serverNow: 1, payload: [] }),
    JSON.stringify({ protocolVersion: 1, stateVersion: 1, type: "ack", commandId: 9, serverNow: 1, payload: {} })
  ]) {
    assert.equal(readFrame(wrong), null, String(wrong));
  }
});

test("the clock estimate prefers the fastest observation it has ever made", () => {
  let clock = initialClock();
  clock = observeClock(clock, 10_000, 0, 200);
  assert.equal(clock.bestLatencyMs, 100);
  assert.equal(clock.offsetMs, 10_100 - 200);

  const slower = observeClock(clock, 20_000, 1000, 1600);
  assert.equal(slower, clock, "a slower observation teaches nothing");

  const faster = observeClock(clock, 30_000, 2000, 2010);
  assert.equal(faster.bestLatencyMs, 5);
  assert.equal(faster.offsetMs, 30_005 - 2010);
});

test("server time and remaining time follow the estimated offset and never go negative", () => {
  const clock = observeClock(initialClock(), 50_000, 1000, 1000);
  assert.equal(serverNow(clock, 2000), 51_000);
  assert.equal(remainingMs(clock, 60_000, 2000), 9_000);
  assert.equal(remainingMs(clock, 40_000, 2000), 0, "a passed deadline is simply now");
});

test("backoff doubles from its base to its cap and tolerates nonsense", () => {
  assert.equal(backoffMs(1), RECONNECT_BASE_MS);
  assert.equal(backoffMs(2), RECONNECT_BASE_MS * 2);
  assert.equal(backoffMs(3), RECONNECT_BASE_MS * 4);
  assert.equal(backoffMs(30), RECONNECT_MAX_MS);
  assert.equal(backoffMs(0), RECONNECT_BASE_MS);
  assert.equal(backoffMs(-2), RECONNECT_BASE_MS);
});

test("falling behind is a gap, not merely a new version", () => {
  assert.equal(fellBehind(null, 50), false, "the first frame is whatever it is");
  assert.equal(fellBehind(4, 5), false);
  assert.equal(fellBehind(4, 4), false);
  assert.equal(fellBehind(4, 6), true);
});

test("credentials are stored one room apart", () => {
  assert.notEqual(credentialStorageKey("A1B2C3D4"), credentialStorageKey("B2C3D4E5"));
  assert.match(credentialStorageKey("A1B2C3D4"), /A1B2C3D4/);
});
