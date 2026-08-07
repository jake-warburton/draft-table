/**
 * The room Durable Object's initialize transaction.
 *
 * One room code names one object, and this file is that object's whole current surface: it
 * accepts the router's internal initialize request exactly once, refuses it ever after with the
 * 409 the router treats as "code taken", and schedules the abandoned-lobby cleanup so an
 * initialized-but-never-joined room cannot squat on storage. Sockets, the lobby, and the draft
 * itself are deliberately absent; the socket route answers that it is not ready yet.
 *
 * The habits of the router hold here too. Nothing a caller sent is repeated back, the canonical
 * snapshot is persisted before anything is answered, and secrets are stored only as digests: the
 * room password and the host claim each become a salted SHA-256 verifier, and the plaintext
 * leaves this handler exactly once, inside the 201 body the router copies to the creator.
 */

import { normalizeRoomCode } from "@draft-table/contracts";

/** The slice of the Durable Object storage API this room uses. */
export interface RoomStorageSlice {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
  deleteAll(): Promise<void>;
  setAlarm(scheduledTimeMs: number): Promise<void>;
}

/** The slice of the Durable Object state this room uses. */
export interface RoomStateSlice {
  readonly storage: RoomStorageSlice;
}

/** Injectable time and entropy so tests can drive the object without a Cloudflare runtime. */
export interface RoomTools {
  now(): number;
  randomBytes(byteCount: number): Uint8Array;
}

/** A lobby nobody has ever connected to is deleted this long after creation. */
export const LOBBY_ABANDONMENT_MS = 30 * 60 * 1000;

/** The creator's one-time proof of hostship, presented by the first hello over the socket. */
export const HOST_CLAIM_BYTES = 32;

const PASSWORD_SALT_BYTES = 16;
const MAX_NAME_LENGTH = 60;
const MAX_PASSWORD_LENGTH = 128;
const MAX_INITIALIZE_BODY_BYTES = 4096;

const INITIALIZE_PATH = /^\/rooms\/([^/]+)\/initialize$/u;
const SOCKET_PATH = /^\/api\/rooms\/([^/]+)\/socket$/u;

/** One salted digest; the plaintext it proves is never stored. */
interface StoredVerifier {
  readonly salt: string;
  readonly digest: string;
}

/** The accepted room options, every one explicit after defaulting. */
interface RoomConfig {
  readonly name: string;
  readonly timers: boolean;
  readonly poolHidden: boolean;
  readonly spectators: boolean;
  readonly randomizeSeatsAtStart: boolean;
}

interface RoomSnapshot {
  readonly schema: 1;
  readonly code: string;
  readonly phase: "lobby";
  readonly stateVersion: 0;
  readonly createdAt: number;
  readonly config: RoomConfig;
  readonly password: StoredVerifier | null;
  readonly hostClaim: StoredVerifier;
  readonly participants: readonly never[];
  readonly feed: readonly never[];
  readonly alarmGeneration: number;
}

const refuse = (status: number, error: string): Response =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    }
  });

const base64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");

const hex = (bytes: Uint8Array): string =>
  [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");

/** Salted SHA-256 is a verifier for random high-entropy material, not a password KDF. */
const verifier = async (salt: Uint8Array, plaintext: string): Promise<StoredVerifier> => {
  const material = new TextEncoder().encode(`${hex(salt)}:${plaintext}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", material));
  return { salt: hex(salt), digest: hex(digest) };
};

const isCanonicalCode = (segment: string): boolean => {
  try {
    return normalizeRoomCode(segment) === segment;
  } catch {
    return false;
  }
};

const isPlainText = (value: string): boolean => !/[\u0000-\u001f\u007f-\u009f]/u.test(value);

type ConfigRead = { readonly ok: true; readonly config: RoomConfig; readonly password: string | null }
  | { readonly ok: false };

/**
 * Reads the creator's configuration strictly: only known fields, only sensible values. The
 * router already proved the body is one JSON object; the object still decides for itself.
 */
const readConfig = (parsed: Record<string, unknown>): ConfigRead => {
  const known = new Set(["name", "password", "timers", "poolHidden", "spectators", "randomizeSeatsAtStart"]);
  for (const field of Object.keys(parsed)) {
    if (!known.has(field)) return { ok: false };
  }

  const flag = (field: string, fallback: boolean): boolean | null => {
    const value = parsed[field];
    if (value === undefined) return fallback;
    return typeof value === "boolean" ? value : null;
  };

  let name = "Draft room";
  if (parsed.name !== undefined) {
    if (typeof parsed.name !== "string") return { ok: false };
    name = parsed.name.trim();
    if (name.length === 0 || name.length > MAX_NAME_LENGTH || !isPlainText(name)) return { ok: false };
  }

  let password: string | null = null;
  if (parsed.password !== undefined) {
    if (typeof parsed.password !== "string") return { ok: false };
    if (parsed.password.length === 0 || parsed.password.length > MAX_PASSWORD_LENGTH) return { ok: false };
    if (!isPlainText(parsed.password)) return { ok: false };
    password = parsed.password;
  }

  const timers = flag("timers", true);
  const poolHidden = flag("poolHidden", true);
  const spectators = flag("spectators", true);
  const randomizeSeatsAtStart = flag("randomizeSeatsAtStart", true);
  if (timers === null || poolHidden === null || spectators === null || randomizeSeatsAtStart === null) {
    return { ok: false };
  }

  return { ok: true, config: { name, timers, poolHidden, spectators, randomizeSeatsAtStart }, password };
};

const realTools: RoomTools = {
  now: () => Date.now(),
  randomBytes: (byteCount) => crypto.getRandomValues(new Uint8Array(byteCount))
};

/** One room. The router forwards exactly two shapes of request here. */
export class RoomObject {
  private readonly storage: RoomStorageSlice;
  private readonly tools: RoomTools;

  constructor(state: RoomStateSlice, _env: unknown = undefined, tools: RoomTools = realTools) {
    this.storage = state.storage;
    this.tools = tools;
  }

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;

    const initialize = INITIALIZE_PATH.exec(path);
    if (initialize !== null) {
      if (request.method !== "POST") return refuse(405, "method_not_allowed");
      return this.initialize(initialize[1], request);
    }

    if (SOCKET_PATH.exec(path) !== null) {
      // Honest interim answer: the room cannot hold a socket until the lobby exists.
      return refuse(501, "room_not_ready");
    }

    return refuse(404, "not_found");
  }

  /**
   * Creates the room exactly once. A 409 is the one answer that tells the router the code is
   * taken; every other failure leaves no room behind and reveals nothing the caller sent.
   */
  private async initialize(codeSegment: string, request: Request): Promise<Response> {
    const existing = await this.storage.get("room");
    if (existing !== undefined) return refuse(409, "room_taken");

    // The router mints canonical codes, so even a merely alternate spelling of a mintable code
    // did not come from our router and is refused.
    if (!isCanonicalCode(codeSegment)) return refuse(400, "malformed_request");

    const text = await request.text();
    if (text.length > MAX_INITIALIZE_BODY_BYTES) return refuse(400, "malformed_request");
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return refuse(400, "malformed_request");
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return refuse(400, "malformed_request");
    }

    const read = readConfig(parsed as Record<string, unknown>);
    if (!read.ok) return refuse(400, "malformed_request");

    const hostClaim = base64url(this.tools.randomBytes(HOST_CLAIM_BYTES));
    const createdAt = this.tools.now();
    const snapshot: RoomSnapshot = {
      schema: 1,
      code: codeSegment,
      phase: "lobby",
      stateVersion: 0,
      createdAt,
      config: read.config,
      password: read.password === null
        ? null
        : await verifier(this.tools.randomBytes(PASSWORD_SALT_BYTES), read.password),
      hostClaim: await verifier(this.tools.randomBytes(PASSWORD_SALT_BYTES), hostClaim),
      participants: [],
      feed: [],
      alarmGeneration: 1
    };

    // Storage first, then the alarm that reaps a lobby nobody ever joins, then the answer.
    await this.storage.put("room", snapshot);
    await this.storage.setAlarm(createdAt + LOBBY_ABANDONMENT_MS);

    return new Response(JSON.stringify({ code: codeSegment, hostClaim }), {
      status: 201,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff"
      }
    });
  }

  /**
   * Alarms are at-least-once and carry no trusted data; canonical storage decides. Today the
   * only scheduled event is abandoned-lobby cleanup: a room still in its never-joined lobby at
   * its deadline is deleted whole. Deleting storage is what cancels the room.
   */
  async alarm(): Promise<void> {
    const room = await this.storage.get("room") as RoomSnapshot | undefined;
    if (room === undefined) return;
    if (room.phase !== "lobby") return;
    if (room.participants.length > 0) return;
    const due = room.createdAt + LOBBY_ABANDONMENT_MS;
    if (this.tools.now() < due) {
      // Fired early: keep the appointment rather than losing it.
      await this.storage.setAlarm(due);
      return;
    }
    await this.storage.deleteAll();
  }
}
