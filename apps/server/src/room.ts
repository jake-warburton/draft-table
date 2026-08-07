/**
 * The room Durable Object: initialize, hibernating sockets, and the lobby hello.
 *
 * One room code names one object. The router forwards exactly two shapes of request here: the
 * internal initialize (answered 201 exactly once, 409 ever after) and the WebSocket upgrade. A
 * socket receives nothing private before its hello succeeds: the first message carries the
 * optional password, an optional returning credential, an optional display name, and the
 * creator's one-time host claim, and the gate refuses in one generic shape without mutating
 * anything. Identities and secrets are stored only as salted digests, compared in constant time.
 *
 * Every handler rebuilds its world from canonical storage and socket attachments, never from
 * instance memory, because a hibernating object forgets everything between events. Storage is
 * persisted before anything is answered or broadcast. The object's one alarm serves the
 * abandoned-lobby rule: thirty minutes after creation or after the lobby's last connection
 * closes, a lobby with nobody connected is deleted whole; a reconnect cancels the appointment.
 */

import { normalizeRoomCode } from "@draft-table/contracts";

/** The slice of the Durable Object storage API this room uses. */
export interface RoomStorageSlice {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
  deleteAll(): Promise<void>;
  setAlarm(scheduledTimeMs: number): Promise<void>;
}

/** The slice of a hibernatable server WebSocket this room uses. */
export interface RoomSocketSlice {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
}

/** The slice of the Durable Object state this room uses. */
export interface RoomStateSlice {
  readonly storage: RoomStorageSlice;
  acceptWebSocket(socket: RoomSocketSlice): void;
  getWebSockets(): readonly RoomSocketSlice[];
}

/**
 * Injectable time, entropy, and the two platform-specific upgrade steps, so tests can drive the
 * whole object without a Cloudflare runtime.
 */
export interface RoomTools {
  now(): number;
  randomBytes(byteCount: number): Uint8Array;
  openSocketPair(): { readonly client: unknown; readonly server: RoomSocketSlice };
  upgradeResponse(client: unknown): Response;
}

/** A lobby with nobody connected is deleted this long after creation or its last disconnect. */
export const LOBBY_ABANDONMENT_MS = 30 * 60 * 1000;

/** The creator's one-time proof of hostship, presented by the first hello over the socket. */
export const HOST_CLAIM_BYTES = 32;

/** Identity credentials carry at least 256 random bits, per the security notes. */
export const CREDENTIAL_BYTES = 32;

export const PROTOCOL_VERSION = 1;
export const MAX_MESSAGE_BYTES = 16384;
export const MAX_PARTICIPANTS = 16;
export const LOBBY_SEAT_COUNT = 8;

/** An older socket for the same identity is closed with this code when a newer one arrives. */
export const SUPERSEDED_CLOSE_CODE = 4000;

/** A socket refused at the hello gate is closed with this code after its one error message. */
export const REFUSED_CLOSE_CODE = 4001;

const PASSWORD_SALT_BYTES = 16;
const MAX_NAME_LENGTH = 60;
const MAX_DISPLAY_NAME_LENGTH = 30;
const MAX_PASSWORD_LENGTH = 128;
const MAX_INITIALIZE_BODY_BYTES = 4096;
const MAX_FEED_EVENTS = 100;
const MAX_COMMAND_ID_LENGTH = 64;

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

interface Participant {
  readonly id: string;
  readonly credential: StoredVerifier;
  readonly name: string;
  readonly host: boolean;
  readonly connected: boolean;
  readonly generation: number;
  readonly seat: number | null;
}

interface FeedEvent {
  readonly at: number;
  readonly type: "join" | "reconnect" | "disconnect";
  readonly name: string;
}

interface RoomSnapshot {
  readonly schema: 1;
  readonly code: string;
  readonly phase: "lobby";
  readonly stateVersion: number;
  readonly createdAt: number;
  readonly config: RoomConfig;
  readonly password: StoredVerifier | null;
  readonly hostClaim: StoredVerifier;
  readonly hostClaimSpent: boolean;
  readonly participants: readonly Participant[];
  readonly feed: readonly FeedEvent[];
  readonly abandonAt: number | null;
  readonly alarmGeneration: number;
}

/** What a socket remembers about itself across hibernation: who it is, and which claim it holds. */
interface SocketAttachment {
  readonly participantId: string;
  readonly generation: number;
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
const makeVerifier = async (salt: Uint8Array, plaintext: string): Promise<StoredVerifier> => {
  const material = new TextEncoder().encode(`${hex(salt)}:${plaintext}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", material));
  return { salt: hex(salt), digest: hex(digest) };
};

/** Whether the plaintext proves the stored digest, taking the same time either way. */
const verifies = async (stored: StoredVerifier, plaintext: string): Promise<boolean> => {
  const material = new TextEncoder().encode(`${stored.salt}:${plaintext}`);
  const digest = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", material)));
  if (digest.length !== stored.digest.length) return false;
  let difference = 0;
  for (let index = 0; index < digest.length; index += 1) {
    difference |= digest.charCodeAt(index) ^ stored.digest.charCodeAt(index);
  }
  return difference === 0;
};

const isCanonicalCode = (segment: string): boolean => {
  try {
    return normalizeRoomCode(segment) === segment;
  } catch {
    return false;
  }
};

/**
 * Short plain text refuses control characters and the invisible format and direction-override
 * characters that let a name render as nothing or spoof its own reading order.
 */
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/u;

const isPlainText = (value: string): boolean => !INVISIBLE.test(value);

/** A name must hold something that renders: a letter, number, punctuation, or symbol. */
const hasVisibleText = (value: string): boolean => /[\p{L}\p{N}\p{P}\p{S}]/u.test(value);

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
    if (name.length === 0 || name.length > MAX_NAME_LENGTH) return { ok: false };
    if (!isPlainText(name) || !hasVisibleText(name)) return { ok: false };
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

/** The client envelope, read strictly; anything else is a structured error, never a mutation. */
interface ClientCommand {
  readonly commandId: string;
  readonly type: string;
  readonly payload: Record<string, unknown>;
}

const readCommand = (message: string): ClientCommand | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(message);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const envelope = parsed as Record<string, unknown>;
  const known = new Set(["protocolVersion", "commandId", "type", "payload"]);
  for (const field of Object.keys(envelope)) {
    if (!known.has(field)) return null;
  }
  if (envelope.protocolVersion !== PROTOCOL_VERSION) return null;
  if (typeof envelope.commandId !== "string" || envelope.commandId.length === 0
    || envelope.commandId.length > MAX_COMMAND_ID_LENGTH) return null;
  if (typeof envelope.type !== "string") return null;
  const payload = envelope.payload === undefined ? {} : envelope.payload;
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  return { commandId: envelope.commandId, type: envelope.type, payload: payload as Record<string, unknown> };
};

/** The public face of a participant: exactly what the visibility matrix lets everyone see. */
const publicParticipant = (participant: Participant) => ({
  id: participant.id,
  name: participant.name,
  host: participant.host,
  connected: participant.connected,
  seat: participant.seat
});

const realTools: RoomTools = {
  now: () => Date.now(),
  randomBytes: (byteCount) => crypto.getRandomValues(new Uint8Array(byteCount)),
  openSocketPair: () => {
    const pair = new (globalThis as unknown as { WebSocketPair: new () => Record<0 | 1, unknown> }).WebSocketPair();
    return { client: pair[0], server: pair[1] as RoomSocketSlice };
  },
  // The 101-with-socket response shape exists only on the Cloudflare runtime.
  upgradeResponse: (client) =>
    new Response(null, { status: 101, webSocket: client } as ResponseInit)
};

/** One room. Everything it knows lives in storage and socket attachments, never in memory. */
export class RoomObject {
  private readonly state: RoomStateSlice;
  private readonly storage: RoomStorageSlice;
  private readonly tools: RoomTools;

  constructor(state: RoomStateSlice, _env: unknown = undefined, tools: RoomTools = realTools) {
    this.state = state;
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
      const room = await this.room();
      if (room === undefined) return refuse(404, "not_found");
      if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return refuse(426, "upgrade_required");
      // Accepted, attached to nothing: the socket is nobody until its hello succeeds.
      const pair = this.tools.openSocketPair();
      this.state.acceptWebSocket(pair.server);
      return this.tools.upgradeResponse(pair.client);
    }

    return refuse(404, "not_found");
  }

  private async room(): Promise<RoomSnapshot | undefined> {
    return await this.storage.get("room") as RoomSnapshot | undefined;
  }

  /**
   * Creates the room exactly once. A 409 is the one answer that tells the router the code is
   * taken; every other failure leaves no room behind and reveals nothing the caller sent.
   */
  private async initialize(codeSegment: string, request: Request): Promise<Response> {
    const existing = await this.room();
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
        : await makeVerifier(this.tools.randomBytes(PASSWORD_SALT_BYTES), read.password),
      hostClaim: await makeVerifier(this.tools.randomBytes(PASSWORD_SALT_BYTES), hostClaim),
      hostClaimSpent: false,
      participants: [],
      feed: [],
      abandonAt: createdAt + LOBBY_ABANDONMENT_MS,
      alarmGeneration: 1
    };

    // Storage first, then the alarm that reaps a lobby nobody ever joins, then the answer.
    await this.storage.put("room", snapshot);
    await this.storage.setAlarm(snapshot.abandonAt as number);

    return new Response(JSON.stringify({ code: codeSegment, hostClaim }), {
      status: 201,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff"
      }
    });
  }

  /** One server message in the protocol envelope. */
  private send(socket: RoomSocketSlice, stateVersion: number, type: string, payload: unknown, commandId?: string): void {
    socket.send(JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      stateVersion,
      type,
      ...(commandId === undefined ? {} : { commandId }),
      serverNow: this.tools.now(),
      payload
    }));
  }

  /**
   * A structured refusal. Before a socket is anyone, it also carries no state version, because
   * the gate reveals nothing about the room to a caller who has not passed it.
   */
  private sendError(socket: RoomSocketSlice, stateVersion: number, code: string, commandId?: string): void {
    this.send(socket, stateVersion, "error", { code }, commandId);
  }

  /** Refuses an unauthenticated socket: one generic error, then the door closes. */
  private turnAway(socket: RoomSocketSlice, code: string, commandId?: string): void {
    this.sendError(socket, 0, code, commandId);
    socket.close(REFUSED_CLOSE_CODE, code);
  }

  private attachmentOf(socket: RoomSocketSlice): SocketAttachment | null {
    const attachment = socket.deserializeAttachment();
    if (typeof attachment !== "object" || attachment === null) return null;
    const { participantId, generation } = attachment as Record<string, unknown>;
    if (typeof participantId !== "string" || typeof generation !== "number") return null;
    return { participantId, generation };
  }

  /** Every live socket that has passed the gate, with the identity it carries. */
  private authenticatedSockets(): readonly { socket: RoomSocketSlice; attachment: SocketAttachment }[] {
    return this.state.getWebSockets().flatMap((socket) => {
      const attachment = this.attachmentOf(socket);
      return attachment === null ? [] : [{ socket, attachment }];
    });
  }

  private broadcast(room: RoomSnapshot, type: string, payload: unknown, except?: RoomSocketSlice): void {
    for (const { socket } of this.authenticatedSockets()) {
      if (socket !== except) this.send(socket, room.stateVersion, type, payload);
    }
  }

  /** The role-safe lobby view: no verifier, no claim, no secret ever enters this shape. */
  private snapshotPayload(room: RoomSnapshot, selfId: string) {
    return {
      phase: room.phase,
      config: room.config,
      passwordProtected: room.password !== null,
      participants: room.participants.map(publicParticipant),
      feed: room.feed,
      self: selfId
    };
  }

  async webSocketMessage(socket: RoomSocketSlice, message: unknown): Promise<void> {
    if (typeof message !== "string" || message.length > MAX_MESSAGE_BYTES) {
      this.turnAway(socket, "malformed_message");
      return;
    }

    const room = await this.room();
    if (room === undefined) {
      socket.close(REFUSED_CLOSE_CODE, "room_closed");
      return;
    }

    const command = readCommand(message);
    const attachment = this.attachmentOf(socket);

    if (attachment === null) {
      // The gate: the first message is a well-formed hello or the socket is done.
      if (command === null || command.type !== "hello") {
        this.turnAway(socket, "hello_required", command?.commandId);
        return;
      }
      await this.hello(socket, room, command);
      return;
    }

    if (command === null) {
      this.sendError(socket, room.stateVersion, "malformed_message");
      return;
    }
    if (command.type === "hello") {
      this.sendError(socket, room.stateVersion, "already_authenticated", command.commandId);
      return;
    }
    // Lobby commands, the start transaction, and the draft arrive in later slices.
    this.sendError(socket, room.stateVersion, "unknown_command", command.commandId);
  }

  /**
   * The hello transaction: password gate, then identity, then hostship, all before any room
   * data leaves. A refusal is one generic error and the closed door; nothing mutates.
   */
  private async hello(socket: RoomSocketSlice, room: RoomSnapshot, command: ClientCommand): Promise<void> {
    const known = new Set(["credential", "name", "password", "hostClaim"]);
    for (const field of Object.keys(command.payload)) {
      if (!known.has(field)) {
        this.turnAway(socket, "malformed_message", command.commandId);
        return;
      }
    }
    const { credential, name, password, hostClaim } = command.payload;
    for (const value of [credential, name, password, hostClaim]) {
      if (value !== undefined && typeof value !== "string") {
        this.turnAway(socket, "malformed_message", command.commandId);
        return;
      }
    }

    // The password gate comes first and answers wrong and missing the same way.
    if (room.password !== null) {
      if (typeof password !== "string" || !(await verifies(room.password, password))) {
        this.turnAway(socket, "wrong_password", command.commandId);
        return;
      }
    }

    // A returning credential reclaims its identity; anything else is a fresh join.
    let returning: Participant | undefined;
    if (typeof credential === "string" && credential.length > 0) {
      for (const participant of room.participants) {
        if (await verifies(participant.credential, credential)) {
          returning = participant;
          break;
        }
      }
    }

    // The host claim is one-time: valid on a fresh room, spent forever after.
    let claimsHost = false;
    if (typeof hostClaim === "string") {
      if (room.hostClaimSpent || !(await verifies(room.hostClaim, hostClaim))) {
        this.turnAway(socket, "invalid_claim", command.commandId);
        return;
      }
      claimsHost = true;
    }

    let displayName: string | null = null;
    if (typeof name === "string") {
      const trimmed = name.trim();
      if (trimmed.length === 0 || trimmed.length > MAX_DISPLAY_NAME_LENGTH
        || !isPlainText(trimmed) || !hasVisibleText(trimmed)) {
        this.turnAway(socket, "invalid_name", command.commandId);
        return;
      }
      displayName = trimmed;
    }

    let mintedCredential: string | null = null;
    let self: Participant;
    let participants: readonly Participant[];

    if (returning !== undefined) {
      self = {
        ...returning,
        name: displayName ?? returning.name,
        host: returning.host || claimsHost,
        connected: true,
        generation: returning.generation + 1
      };
      participants = room.participants.map((participant) => (participant.id === self.id ? self : participant));
    } else {
      if (room.participants.length >= MAX_PARTICIPANTS) {
        this.turnAway(socket, "room_full", command.commandId);
        return;
      }
      mintedCredential = base64url(this.tools.randomBytes(CREDENTIAL_BYTES));
      const taken = new Set(room.participants.map((participant) => participant.seat));
      let seat: number | null = null;
      for (let position = 0; position < LOBBY_SEAT_COUNT; position += 1) {
        if (!taken.has(position)) {
          seat = position;
          break;
        }
      }
      self = {
        id: base64url(this.tools.randomBytes(9)),
        credential: await makeVerifier(this.tools.randomBytes(PASSWORD_SALT_BYTES), mintedCredential),
        name: displayName ?? this.freshName(room),
        host: claimsHost,
        connected: true,
        generation: 1,
        seat
      };
      participants = [...room.participants, self];
    }

    const event: FeedEvent = {
      at: this.tools.now(),
      type: returning === undefined ? "join" : "reconnect",
      name: self.name
    };
    const updated: RoomSnapshot = {
      ...room,
      stateVersion: room.stateVersion + 1,
      hostClaimSpent: room.hostClaimSpent || claimsHost,
      participants,
      feed: [...room.feed, event].slice(-MAX_FEED_EVENTS),
      // Someone is here now; the abandonment appointment is off.
      abandonAt: null
    };
    await this.storage.put("room", updated);

    // An older socket for the same identity loses to this one, after the state is safe.
    for (const { socket: other, attachment } of this.authenticatedSockets()) {
      if (other !== socket && attachment.participantId === self.id && attachment.generation < self.generation) {
        other.close(SUPERSEDED_CLOSE_CODE, "superseded");
      }
    }

    socket.serializeAttachment({ participantId: self.id, generation: self.generation });
    this.send(socket, updated.stateVersion, "hello_ack", {
      ...(mintedCredential === null ? {} : { credential: mintedCredential }),
      self: publicParticipant(self)
    }, command.commandId);
    this.send(socket, updated.stateVersion, "snapshot", this.snapshotPayload(updated, self.id));
    this.broadcast(updated, "participants_changed", {
      participants: updated.participants.map(publicParticipant)
    }, socket);
  }

  /** A fresh default name that is not already at the table. */
  private freshName(room: RoomSnapshot): string {
    for (let count = 1; ; count += 1) {
      const candidate = `Drafter ${count}`;
      if (!room.participants.some((participant) => participant.name === candidate)) return candidate;
    }
  }

  async webSocketClose(socket: RoomSocketSlice): Promise<void> {
    const attachment = this.attachmentOf(socket);
    if (attachment === null) return;
    const room = await this.room();
    if (room === undefined) return;

    const participant = room.participants.find(({ id }) => id === attachment.participantId);
    // A superseded socket closing must not mark the identity's newer connection dead.
    if (participant === undefined || participant.generation !== attachment.generation) return;

    const participants = room.participants.map((entry) =>
      entry.id === participant.id ? { ...entry, connected: false } : entry);
    const nobodyConnected = participants.every((entry) => !entry.connected);
    const abandonAt = nobodyConnected ? this.tools.now() + LOBBY_ABANDONMENT_MS : room.abandonAt;
    const updated: RoomSnapshot = {
      ...room,
      stateVersion: room.stateVersion + 1,
      participants,
      feed: [...room.feed, { at: this.tools.now(), type: "disconnect" as const, name: participant.name }]
        .slice(-MAX_FEED_EVENTS),
      abandonAt,
      alarmGeneration: nobodyConnected ? room.alarmGeneration + 1 : room.alarmGeneration
    };
    await this.storage.put("room", updated);
    if (nobodyConnected && abandonAt !== null) await this.storage.setAlarm(abandonAt);

    this.broadcast(updated, "participants_changed", {
      participants: updated.participants.map(publicParticipant)
    });
  }

  /**
   * Alarms are at-least-once and carry no trusted data; canonical storage decides. The one
   * scheduled event is abandoned-lobby cleanup: a lobby with nobody connected at its recorded
   * deadline is deleted whole, and deleting storage is what cancels the room. Early wakes
   * rebook the appointment; late and duplicate wakes are harmless; a reconnect has already
   * cleared the deadline before any of them fire.
   */
  async alarm(): Promise<void> {
    const room = await this.room();
    if (room === undefined) return;
    if (room.phase !== "lobby") return;
    if (room.participants.some((participant) => participant.connected)) return;
    if (room.abandonAt === null) return;
    if (this.tools.now() < room.abandonAt) {
      // Fired early: keep the appointment rather than losing it.
      await this.storage.setAlarm(room.abandonAt);
      return;
    }
    for (const socket of this.state.getWebSockets()) {
      socket.close(REFUSED_CLOSE_CODE, "room_closed");
    }
    await this.storage.deleteAll();
  }
}
