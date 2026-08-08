/**
 * The pure half of talking to a room: envelopes out, frames in, clocks and backoff.
 *
 * Nothing here owns a socket, a timer, or any state. Commands are built and validated as plain
 * data, incoming frames are read strictly and refused quietly, the server's clock is estimated
 * from round trips, and reconnect pacing is a pure function of the attempt number. The stateful
 * driver in `room-client.ts` composes these; tests exercise them directly.
 */

export const PROTOCOL_VERSION = 1;

/** The application's own command ceiling, well under the socket frame limit. */
export const MAX_COMMAND_BYTES = 16384;

/** Reconnect pacing: bounded exponential backoff, deterministic for a given attempt. */
export const RECONNECT_BASE_MS = 500;
export const RECONNECT_MAX_MS = 15_000;

export interface ServerFrame {
  readonly stateVersion: number;
  readonly type: string;
  readonly commandId?: string;
  readonly serverNow: number;
  readonly payload: Record<string, unknown>;
}

/** Builds one client command envelope as text, refusing anything oversized. */
export const buildCommand = (
  commandId: string,
  type: string,
  payload: Record<string, unknown>
): string => {
  const text = JSON.stringify({ protocolVersion: PROTOCOL_VERSION, commandId, type, payload });
  if (text.length > MAX_COMMAND_BYTES) {
    throw new RangeError("A command this large has no business existing.");
  }
  return text;
};

/**
 * Reads one server frame strictly: exactly the envelope fields, a version this client speaks,
 * and a payload that is one object. Anything else is null — the caller drops it and may resync.
 */
export const readFrame = (data: unknown): ServerFrame | null => {
  if (typeof data !== "string" || data.length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const frame = parsed as Record<string, unknown>;
  if (frame.protocolVersion !== PROTOCOL_VERSION) return null;
  if (typeof frame.stateVersion !== "number" || !Number.isFinite(frame.stateVersion)) return null;
  if (typeof frame.type !== "string" || frame.type.length === 0) return null;
  if (frame.commandId !== undefined && typeof frame.commandId !== "string") return null;
  if (typeof frame.serverNow !== "number" || !Number.isFinite(frame.serverNow)) return null;
  const payload = frame.payload;
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  return {
    stateVersion: frame.stateVersion,
    type: frame.type,
    ...(frame.commandId === undefined ? {} : { commandId: frame.commandId }),
    serverNow: frame.serverNow,
    payload: payload as Record<string, unknown>
  };
};

/**
 * Tracks the gap between the server's clock and ours from each frame's send-time stamp. The
 * estimate deliberately prefers the smallest observed latency: a frame that arrived fast has
 * the least room to be wrong about when it was stamped.
 */
export interface ClockEstimate {
  readonly offsetMs: number;
  readonly bestLatencyMs: number;
}

export const initialClock = (): ClockEstimate =>
  Object.freeze({ offsetMs: 0, bestLatencyMs: Number.POSITIVE_INFINITY });

/**
 * Folds one observation into the estimate. `sentAt` is when we sent whatever provoked this
 * frame (or the frame's arrival time again for unprovoked frames, giving a latency of the
 * round trip or zero respectively); `receivedAt` is our clock on arrival.
 */
export const observeClock = (
  clock: ClockEstimate,
  serverNow: number,
  sentAt: number,
  receivedAt: number
): ClockEstimate => {
  const latency = Math.max(0, receivedAt - sentAt) / 2;
  if (latency > clock.bestLatencyMs) return clock;
  return Object.freeze({ offsetMs: serverNow + latency - receivedAt, bestLatencyMs: latency });
};

/**
 * Folds in a frame we did not provoke. Its arrival bounds nothing, so it may only seed a
 * provisional offset while no genuine round trip has ever been measured; it never competes
 * with one, because an absence of information is not a fast measurement.
 */
export const observeCoarse = (
  clock: ClockEstimate,
  serverNowMs: number,
  receivedAt: number
): ClockEstimate =>
  clock.bestLatencyMs === Number.POSITIVE_INFINITY
    ? Object.freeze({ offsetMs: serverNowMs - receivedAt, bestLatencyMs: Number.POSITIVE_INFINITY })
    : clock;

/** What the server's clock reads now, by our best estimate. */
export const serverNow = (clock: ClockEstimate, localNow: number): number =>
  localNow + clock.offsetMs;

/** Milliseconds until a server deadline, never negative. */
export const remainingMs = (clock: ClockEstimate, deadlineAt: number, localNow: number): number =>
  Math.max(0, deadlineAt - serverNow(clock, localNow));

/** The wait before reconnect attempt `attempt` (1-based): doubling, capped, deterministic. */
export const backoffMs = (attempt: number): number => {
  if (!Number.isInteger(attempt) || attempt < 1) return RECONNECT_BASE_MS;
  return Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** (attempt - 1));
};

/**
 * Whether a frame's state version means the client fell behind and must resync rather than
 * patch. The first frame after connecting accepts any version.
 */
export const fellBehind = (lastSeen: number | null, incoming: number): boolean =>
  lastSeen !== null && incoming > lastSeen + 1;

/** Room-scoped browser storage keys for the identity credential; one room, one identity. */
export const credentialStorageKey = (code: string): string => `draft-table:credential:${code}`;
