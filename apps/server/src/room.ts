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
import {
  DraftRuleError,
  createDraft,
  disconnectSeat,
  pickCard,
  reconnectSeat,
  resolveTimeout,
  type DraftState
} from "@draft-table/draft";

import { OMENS_SET_SNAPSHOT, PACK_SIZE, buildPacksByRound } from "./packs.ts";

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
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
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

/** The official judge schedule by visible pack size; the single last card is automatic. */
export const PICK_SECONDS: Readonly<Record<number, number>> = Object.freeze({
  14: 50, 13: 50, 12: 50, 11: 40, 10: 40, 9: 30, 8: 30, 7: 20, 6: 20, 5: 10, 4: 10, 3: 5, 2: 5
});

/** Reviews between packs are always timed, even when pick timers are off. */
export const REVIEW_SECONDS = 60;

/** Once every readiness-eligible drafter has queued, the pick closes this soon. */
export const CONFIRMATION_SECONDS = 5;

/** A finished draft keeps its room readable this long, then everything is deleted. */
export const COMPLETED_ROOM_TTL_MS = 60 * 60 * 1000;

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
  readonly type: "join" | "reconnect" | "disconnect" | "leave" | "removed" | "seats"
    | "start" | "review" | "completion";
  readonly name: string;
}

type RoomPhase = "lobby" | "picking" | "review" | "complete";

interface RoomSnapshot {
  readonly schema: 1;
  readonly code: string;
  readonly phase: RoomPhase;
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
  /** The pure draft state once started; the room adds packs, deadlines, and visibility. */
  readonly draft: DraftState | null;
  /** The current phase deadline: a pick, a review, or a finished room's deletion. */
  readonly deadlineAt: number | null;
  /** Whether this pick's five-second all-queued confirmation has already been applied. */
  readonly deadlineAccelerated: boolean;
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

  /**
   * The platform's input gate holds new events only across storage awaits, and these handlers
   * also await crypto digests between reading the snapshot and writing it back. Every handler
   * therefore runs whole inside the concurrency gate, which is what actually delivers the
   * protocol's promise that the room serializes all commands.
   */
  private serialized<T>(work: () => Promise<T>): Promise<T> {
    return this.state.blockConcurrencyWhile(work);
  }

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;

    const initialize = INITIALIZE_PATH.exec(path);
    if (initialize !== null) {
      if (request.method !== "POST") return refuse(405, "method_not_allowed");
      return this.serialized(() => this.initialize(initialize[1], request));
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
      alarmGeneration: 1,
      draft: null,
      deadlineAt: null,
      deadlineAccelerated: false
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

  /**
   * One server message in the protocol envelope, delivered if the socket can still hear it. The
   * runtime throws on send() once a socket has closed — including one this object closed moments
   * ago in the same handler, because a closing socket stays listed until its goodbye completes.
   * A recipient that has gone away is bookkeeping for the close event and the liveness sweep,
   * never a reason to throw: an uncaught throw inside the concurrency gate resets the whole
   * object and drops every connection in the room.
   */
  private send(socket: RoomSocketSlice, stateVersion: number, type: string, payload: unknown, commandId?: string): void {
    try {
      socket.send(JSON.stringify({
        protocolVersion: PROTOCOL_VERSION,
        stateVersion,
        type,
        ...(commandId === undefined ? {} : { commandId }),
        serverNow: this.tools.now(),
        payload
      }));
    } catch {
      // The recipient is gone; the close event or the liveness sweep owns the ledger.
    }
  }

  /** Closing a socket that is already closing throws for the same reason sending does. */
  private close(socket: RoomSocketSlice, code: number, reason: string): void {
    try {
      socket.close(code, reason);
    } catch {
      // Already closing or already gone — which is what was wanted.
    }
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
    this.close(socket, REFUSED_CLOSE_CODE, code);
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

  /** The role-safe room view: no verifier, no claim, and no other seat's cards ever enter it. */
  private snapshotPayload(room: RoomSnapshot, selfId: string) {
    return {
      phase: room.phase,
      config: room.config,
      passwordProtected: room.password !== null,
      participants: room.participants.map(publicParticipant),
      feed: room.feed,
      self: selfId,
      ...(room.draft === null ? {} : { draft: this.publicDraft(room.draft), deadlineAt: room.deadlineAt })
    };
  }

  webSocketMessage(socket: RoomSocketSlice, message: unknown): Promise<void> {
    return this.serialized(() => this.handleMessage(socket, message));
  }

  private async handleMessage(socket: RoomSocketSlice, message: unknown): Promise<void> {
    if (typeof message !== "string" || message.length > MAX_MESSAGE_BYTES) {
      this.turnAway(socket, "malformed_message");
      return;
    }

    const room = await this.room();
    if (room === undefined) {
      this.close(socket, REFUSED_CLOSE_CODE, "room_closed");
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

    const self = room.participants.find(({ id }) => id === attachment.participantId);
    if (self === undefined) {
      // Removed while this socket was still open: it is nobody again.
      this.close(socket, REFUSED_CLOSE_CODE, "removed");
      return;
    }

    if (command.type === "resync") {
      this.send(socket, room.stateVersion, "snapshot", this.snapshotPayload(room, self.id), command.commandId);
      this.sendPrivateView(room, self.id, socket);
      return;
    }

    if (command.type === "queue_pick") {
      if (room.phase !== "picking") {
        this.sendError(socket, room.stateVersion, "wrong_phase", command.commandId);
        return;
      }
      await this.queuePick(socket, room, self, command);
      return;
    }

    if (command.type === "start_draft") {
      if (room.phase !== "lobby") {
        this.sendError(socket, room.stateVersion, "wrong_phase", command.commandId);
        return;
      }
      await this.startDraft(socket, room, self, command);
      return;
    }

    // Every remaining command is the lobby's.
    if (room.phase !== "lobby") {
      this.sendError(socket, room.stateVersion, "wrong_phase", command.commandId);
      return;
    }

    switch (command.type) {
      case "update_profile":
        await this.updateProfile(socket, room, self, command);
        return;
      case "update_config":
        await this.updateConfig(socket, room, self, command);
        return;
      case "move_participant":
        await this.moveParticipant(socket, room, self, command);
        return;
      case "set_seat_randomization":
        await this.setSeatRandomization(socket, room, self, command);
        return;
      case "remove_participant":
        await this.removeParticipant(socket, room, self, command);
        return;
      case "leave":
        await this.leave(socket, room, self, command);
        return;
      default:
        // The start transaction and the draft arrive in later slices.
        this.sendError(socket, room.stateVersion, "unknown_command", command.commandId);
    }
  }

  /** Persists a command's outcome, acknowledges its sender, and tells everyone else. */
  private async commit(
    socket: RoomSocketSlice,
    updated: RoomSnapshot,
    command: ClientCommand,
    broadcasts: readonly { type: string; payload: unknown }[]
  ): Promise<void> {
    await this.storage.put("room", updated);
    this.send(socket, updated.stateVersion, "ack", { applied: true }, command.commandId);
    // The sender hears the broadcast too: a command like a server-owned shuffle has an outcome
    // the sender cannot know from its own request, and outgoing frames cost nothing.
    for (const { type, payload } of broadcasts) {
      this.broadcast(updated, type, payload);
    }
  }

  private layout(room: RoomSnapshot) {
    return { participants: room.participants.map(publicParticipant) };
  }

  private async updateProfile(
    socket: RoomSocketSlice, room: RoomSnapshot, self: Participant, command: ClientCommand
  ): Promise<void> {
    const { name } = command.payload;
    if (Object.keys(command.payload).length !== 1 || typeof name !== "string") {
      this.sendError(socket, room.stateVersion, "malformed_message", command.commandId);
      return;
    }
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_DISPLAY_NAME_LENGTH
      || !isPlainText(trimmed) || !hasVisibleText(trimmed)) {
      this.sendError(socket, room.stateVersion, "invalid_name", command.commandId);
      return;
    }
    const updated: RoomSnapshot = {
      ...room,
      stateVersion: room.stateVersion + 1,
      participants: room.participants.map((entry) =>
        entry.id === self.id ? { ...entry, name: trimmed } : entry)
    };
    await this.commit(socket, updated, command, [
      { type: "participants_changed", payload: this.layout(updated) }
    ]);
  }

  /**
   * The safe options travel as one complete object: partial patches invite two hosts' worth of
   * confusion about what the room is. Seat randomization has its own verb below, and password
   * changes wait for their own reviewed slice.
   */
  private async updateConfig(
    socket: RoomSocketSlice, room: RoomSnapshot, self: Participant, command: ClientCommand
  ): Promise<void> {
    if (!self.host) {
      this.sendError(socket, room.stateVersion, "forbidden", command.commandId);
      return;
    }
    const known = new Set(["name", "timers", "poolHidden", "spectators"]);
    const fields = Object.keys(command.payload);
    if (fields.length !== known.size || fields.some((field) => !known.has(field))) {
      this.sendError(socket, room.stateVersion, "malformed_message", command.commandId);
      return;
    }
    const { name, timers, poolHidden, spectators } = command.payload;
    if (typeof name !== "string" || typeof timers !== "boolean"
      || typeof poolHidden !== "boolean" || typeof spectators !== "boolean") {
      this.sendError(socket, room.stateVersion, "malformed_message", command.commandId);
      return;
    }
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH
      || !isPlainText(trimmed) || !hasVisibleText(trimmed)) {
      this.sendError(socket, room.stateVersion, "malformed_message", command.commandId);
      return;
    }
    const updated: RoomSnapshot = {
      ...room,
      stateVersion: room.stateVersion + 1,
      config: { ...room.config, name: trimmed, timers, poolHidden, spectators }
    };
    await this.commit(socket, updated, command, [
      { type: "config_changed", payload: { config: updated.config } }
    ]);
  }

  private async moveParticipant(
    socket: RoomSocketSlice, room: RoomSnapshot, self: Participant, command: ClientCommand
  ): Promise<void> {
    if (!self.host) {
      this.sendError(socket, room.stateVersion, "forbidden", command.commandId);
      return;
    }
    const { participantId, destination } = command.payload;
    if (Object.keys(command.payload).length !== 2 || typeof participantId !== "string") {
      this.sendError(socket, room.stateVersion, "malformed_message", command.commandId);
      return;
    }
    const seatDestination = destination === "spectators"
      ? null
      : (typeof destination === "number" && Number.isInteger(destination)
        && destination >= 0 && destination < LOBBY_SEAT_COUNT ? destination : undefined);
    if (seatDestination === undefined) {
      this.sendError(socket, room.stateVersion, "malformed_message", command.commandId);
      return;
    }
    const moved = room.participants.find(({ id }) => id === participantId);
    if (moved === undefined) {
      this.sendError(socket, room.stateVersion, "invalid_target", command.commandId);
      return;
    }

    // Dragging onto an occupied seat swaps; the displaced participant takes the mover's place.
    const displaced = seatDestination === null
      ? undefined
      : room.participants.find((entry) => entry.seat === seatDestination && entry.id !== moved.id);
    const participants = room.participants.map((entry) => {
      if (entry.id === moved.id) return { ...entry, seat: seatDestination };
      if (displaced !== undefined && entry.id === displaced.id) return { ...entry, seat: moved.seat };
      return entry;
    });

    const updated: RoomSnapshot = {
      ...room,
      stateVersion: room.stateVersion + 1,
      // The first manual move or swap visibly cancels the pending start-time shuffle.
      config: { ...room.config, randomizeSeatsAtStart: false },
      participants,
      feed: [...room.feed, { at: this.tools.now(), type: "seats" as const, name: moved.name }]
        .slice(-MAX_FEED_EVENTS)
    };
    await this.commit(socket, updated, command, [
      { type: "seat_layout_changed", payload: this.layout(updated) },
      ...(room.config.randomizeSeatsAtStart
        ? [{ type: "config_changed", payload: { config: updated.config } }]
        : [])
    ]);
  }

  private async setSeatRandomization(
    socket: RoomSocketSlice, room: RoomSnapshot, self: Participant, command: ClientCommand
  ): Promise<void> {
    if (!self.host) {
      this.sendError(socket, room.stateVersion, "forbidden", command.commandId);
      return;
    }
    const { mode, enabled } = command.payload;

    if (mode === "randomize_at_start") {
      if (Object.keys(command.payload).length !== 2 || typeof enabled !== "boolean") {
        this.sendError(socket, room.stateVersion, "malformed_message", command.commandId);
        return;
      }
      const updated: RoomSnapshot = {
        ...room,
        stateVersion: room.stateVersion + 1,
        config: { ...room.config, randomizeSeatsAtStart: enabled }
      };
      await this.commit(socket, updated, command, [
        { type: "config_changed", payload: { config: updated.config } }
      ]);
      return;
    }

    if (mode !== "randomize_now" || Object.keys(command.payload).length !== 1) {
      this.sendError(socket, room.stateVersion, "malformed_message", command.commandId);
      return;
    }

    // A server-owned shuffle of the seated participants across their own occupied positions,
    // which also spends the pending start-time shuffle.
    const updated: RoomSnapshot = {
      ...room,
      stateVersion: room.stateVersion + 1,
      config: { ...room.config, randomizeSeatsAtStart: false },
      participants: this.shuffleSeated(room.participants),
      feed: [...room.feed, { at: this.tools.now(), type: "seats" as const, name: self.name }]
        .slice(-MAX_FEED_EVENTS)
    };
    await this.commit(socket, updated, command, [
      { type: "seat_layout_changed", payload: this.layout(updated) },
      { type: "config_changed", payload: { config: updated.config } }
    ]);
  }

  /** One caller-owned uint32 sample for the engine's unbiased bounded mapping. */
  private uint32(): number {
    const bytes = this.tools.randomBytes(4);
    return (((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0);
  }

  /** An unbiased index below the bound, by rejection rather than modulo. */
  private uniformIndex(bound: number): number {
    const span = 0x100000000;
    const limit = Math.floor(span / bound) * bound;
    for (;;) {
      const value = this.uint32();
      if (value < limit) return value % bound;
    }
  }

  /** Redistributes the seated participants across their own occupied positions, unbiased. */
  private shuffleSeated(participants: readonly Participant[]): readonly Participant[] {
    const seated = participants.filter((entry) => entry.seat !== null);
    const positions = seated.map((entry) => entry.seat as number);
    for (let index = positions.length - 1; index > 0; index -= 1) {
      const swap = this.uniformIndex(index + 1);
      [positions[index], positions[swap]] = [positions[swap], positions[index]];
    }
    const assigned = new Map(seated.map((entry, index) => [entry.id, positions[index]]));
    return participants.map((entry) =>
      assigned.has(entry.id) ? { ...entry, seat: assigned.get(entry.id) as number } : entry);
  }

  /**
   * The start transaction: the host turns the lobby into a draft. Pending seat randomization is
   * applied first, the occupied positions compact into the ring in position order, and every
   * pack of all three rounds is dealt here and now from the reviewed snapshot — the draft's
   * whole future is decided and persisted before anyone hears it began.
   */
  private async startDraft(
    socket: RoomSocketSlice, room: RoomSnapshot, self: Participant, command: ClientCommand
  ): Promise<void> {
    if (!self.host) {
      this.sendError(socket, room.stateVersion, "forbidden", command.commandId);
      return;
    }
    const { expectedStateVersion } = command.payload;
    if (Object.keys(command.payload).length !== 1 || typeof expectedStateVersion !== "number") {
      this.sendError(socket, room.stateVersion, "malformed_message", command.commandId);
      return;
    }
    // The host starts the room they are looking at, not the room as it has quietly become.
    if (expectedStateVersion !== room.stateVersion) {
      this.sendError(socket, room.stateVersion, "stale_state", command.commandId);
      return;
    }
    const participants = room.config.randomizeSeatsAtStart
      ? this.shuffleSeated(room.participants)
      : room.participants;
    const seated = participants
      .filter((entry) => entry.seat !== null)
      .sort((left, right) => (left.seat as number) - (right.seat as number));
    if (seated.length < 2 || seated.length > LOBBY_SEAT_COUNT) {
      this.sendError(socket, room.stateVersion, "invalid_seat_count", command.commandId);
      return;
    }

    let draft: DraftState;
    try {
      draft = createDraft({
        seats: seated.map((entry, index) => ({
          id: `seat-${index + 1}`,
          controller: "human" as const,
          occupantId: entry.id,
          connected: entry.connected
        })),
        packsByRound: buildPacksByRound(seated.length, OMENS_SET_SNAPSHOT, () => this.uint32())
      });
    } catch {
      this.sendError(socket, room.stateVersion, "server_error", command.commandId);
      return;
    }

    const now = this.tools.now();
    const deadlineAt = room.config.timers ? now + PICK_SECONDS[PACK_SIZE] * 1000 : null;
    const updated: RoomSnapshot = {
      ...room,
      stateVersion: room.stateVersion + 1,
      phase: "picking",
      config: { ...room.config, randomizeSeatsAtStart: false },
      participants,
      draft,
      deadlineAt,
      deadlineAccelerated: false,
      abandonAt: null,
      alarmGeneration: room.alarmGeneration + 1,
      feed: [...room.feed, { at: now, type: "start" as const, name: self.name }].slice(-MAX_FEED_EVENTS)
    };
    await this.storage.put("room", updated);
    if (deadlineAt !== null) await this.storage.setAlarm(deadlineAt);

    this.send(socket, updated.stateVersion, "ack", { applied: true }, command.commandId);
    this.announcePhase(updated);
    this.sendAllPrivateViews(updated);
  }

  /**
   * Queues or replaces one provisional pick. The engine owns legality; the room resolves which
   * seat and pack the drafter means, answers the sender with what it queued, and tells the
   * table only that the seat has queued.
   */
  private async queuePick(
    socket: RoomSocketSlice, room: RoomSnapshot, self: Participant, command: ClientCommand
  ): Promise<void> {
    const draft = room.draft as DraftState;
    const { round, pick, cardInstanceId } = command.payload;
    if (Object.keys(command.payload).length !== 3 || typeof round !== "number"
      || typeof pick !== "number" || typeof cardInstanceId !== "string") {
      this.sendError(socket, room.stateVersion, "malformed_message", command.commandId);
      return;
    }
    const seat = draft.seats.find((entry) => entry.occupantId === self.id);
    if (seat === undefined) {
      this.sendError(socket, room.stateVersion, "forbidden", command.commandId);
      return;
    }
    const pack = draft.packsInFlight.find((entry) => entry.atSeatId === seat.id);
    if (pack === undefined) {
      this.sendError(socket, room.stateVersion, "invalid_target", command.commandId);
      return;
    }

    let next: DraftState;
    try {
      next = pickCard(draft, {
        round: round as 1 | 2 | 3,
        pick,
        seatId: seat.id,
        occupantId: self.id,
        packId: pack.id,
        cardInstanceId
      });
    } catch (error) {
      const code = error instanceof DraftRuleError
        ? (error.code === "STALE_ACTION" ? "stale_state"
          : error.code === "MALFORMED_ACTION" ? "malformed_message"
          : "invalid_target")
        : "server_error";
      this.sendError(socket, room.stateVersion, code, command.commandId);
      return;
    }

    const timing = this.confirmationAfter(room, next);
    const updated: RoomSnapshot = { ...room, stateVersion: room.stateVersion + 1, draft: next, ...timing };
    await this.storage.put("room", updated);
    if (timing.deadlineAt !== room.deadlineAt && timing.deadlineAt !== null) {
      await this.storage.setAlarm(timing.deadlineAt);
    }
    this.send(socket, updated.stateVersion, "ack", { queued: cardInstanceId }, command.commandId);
    this.broadcast(updated, "queue_status_changed", { seatId: seat.id, hasQueued: true });
  }

  /**
   * The all-queued confirmation. With timers on, a deadline more than five seconds out is
   * shortened once; with timers off, a confirmation starts only when a complete, non-empty,
   * connected readiness set has queued. An existing confirmation is never extended or replaced.
   */
  private confirmationAfter(
    room: RoomSnapshot, draft: DraftState
  ): { deadlineAt: number | null; deadlineAccelerated: boolean } {
    const current = { deadlineAt: room.deadlineAt, deadlineAccelerated: room.deadlineAccelerated };
    if (draft.status !== "picking" || room.phase !== "picking") return current;
    const readiness = draft.seats.filter((entry) => entry.occupantId !== null && entry.connected);
    if (readiness.length === 0) return current;
    const queued = new Set(draft.provisionalPicks.map((entry) => entry.seatId));
    if (!readiness.every((entry) => queued.has(entry.id))) return current;
    const now = this.tools.now();
    if (room.config.timers) {
      if (room.deadlineAt === null) return current;
      // A deadline within five seconds is never shortened — which also makes the confirmation
      // one-shot, because an applied confirmation is itself always within five seconds. The
      // recorded accelerated flag is bookkeeping for pause and resume, not a guard here.
      if (room.deadlineAt - now <= CONFIRMATION_SECONDS * 1000) return current;
      return { deadlineAt: now + CONFIRMATION_SECONDS * 1000, deadlineAccelerated: true };
    }
    if (room.deadlineAt !== null) return current;
    return { deadlineAt: now + CONFIRMATION_SECONDS * 1000, deadlineAccelerated: true };
  }

  /** The public face of a started draft: everything in the visibility matrix's public rows. */
  private publicDraft(draft: DraftState) {
    return {
      status: draft.status,
      round: draft.round,
      pick: draft.pick,
      passDirection: draft.passDirection,
      packSize: Math.max(0, PACK_SIZE - (draft.pick - 1)),
      seats: draft.seats.map((seat) => ({
        seatId: seat.id,
        participantId: seat.occupantId,
        connected: seat.connected,
        hasQueued: draft.provisionalPicks.some((entry) => entry.seatId === seat.id)
      }))
    };
  }

  private announcePhase(room: RoomSnapshot): void {
    if (room.draft === null) return;
    this.broadcast(room, "phase_changed", { phase: room.phase, ...this.publicDraft(room.draft) });
    this.broadcast(room, "deadline_changed", { phase: room.phase, deadlineAt: room.deadlineAt });
  }

  /**
   * One drafter's own private view: their current pack, their queued instance, and their pool —
   * the pool only when the room's pool-hiding option or the phase allows it. Nobody else's
   * cards ever enter this shape.
   */
  private privateView(room: RoomSnapshot, participantId: string) {
    const draft = room.draft;
    if (draft === null) return null;
    const seat = draft.seats.find((entry) => entry.occupantId === participantId);
    if (seat === undefined) return null;
    const choice = draft.legalChoices.find((entry) => entry.seatId === seat.id);
    const pool = draft.pickedPools.find((entry) => entry.seatId === seat.id);
    const queued = draft.provisionalPicks.find((entry) => entry.seatId === seat.id);
    const poolFaceDown = room.config.poolHidden && room.phase === "picking";
    return {
      seatId: seat.id,
      pack: choice === undefined ? null : { id: choice.packId, cards: choice.cards },
      pool: poolFaceDown ? null : (pool?.cards ?? []),
      queued: queued?.cardInstanceId ?? null
    };
  }

  private sendPrivateView(room: RoomSnapshot, participantId: string, socket: RoomSocketSlice): void {
    const view = this.privateView(room, participantId);
    if (view === null) return;
    this.send(socket, room.stateVersion, "private_pack_pool", view);
  }

  private sendAllPrivateViews(room: RoomSnapshot): void {
    for (const { socket, attachment } of this.authenticatedSockets()) {
      this.sendPrivateView(room, attachment.participantId, socket);
    }
  }

  private async removeParticipant(
    socket: RoomSocketSlice, room: RoomSnapshot, self: Participant, command: ClientCommand
  ): Promise<void> {
    if (!self.host) {
      this.sendError(socket, room.stateVersion, "forbidden", command.commandId);
      return;
    }
    const { participantId } = command.payload;
    if (Object.keys(command.payload).length !== 1 || typeof participantId !== "string") {
      this.sendError(socket, room.stateVersion, "malformed_message", command.commandId);
      return;
    }
    const target = room.participants.find(({ id }) => id === participantId);
    if (target === undefined) {
      this.sendError(socket, room.stateVersion, "invalid_target", command.commandId);
      return;
    }
    if (target.host) {
      // The permanent host cannot be removed, least of all by themselves.
      this.sendError(socket, room.stateVersion, "invalid_target", command.commandId);
      return;
    }
    await this.withdraw(socket, room, target, "removed", command);
  }

  private async leave(
    socket: RoomSocketSlice, room: RoomSnapshot, self: Participant, command: ClientCommand
  ): Promise<void> {
    if (Object.keys(command.payload).length !== 0) {
      this.sendError(socket, room.stateVersion, "malformed_message", command.commandId);
      return;
    }
    await this.withdraw(socket, room, self, "leave", command);
  }

  /**
   * Takes one participant out of the lobby entirely: the slot opens, the credential no longer
   * reclaims anything, and their sockets close. When the last participant goes on purpose, the
   * room goes with them — explicit desertion deletes immediately, per the lifecycle contract.
   */
  private async withdraw(
    socket: RoomSocketSlice,
    room: RoomSnapshot,
    departing: Participant,
    reason: "leave" | "removed",
    command: ClientCommand
  ): Promise<void> {
    const participants = room.participants.filter(({ id }) => id !== departing.id);

    if (reason === "leave" && participants.length === 0) {
      this.send(socket, room.stateVersion + 1, "ack", { applied: true }, command.commandId);
      for (const open of this.state.getWebSockets()) {
        this.close(open, REFUSED_CLOSE_CODE, "room_closed");
      }
      await this.storage.deleteAll();
      return;
    }

    const nobodyConnected = participants.every((entry) => !entry.connected);
    const updated: RoomSnapshot = {
      ...room,
      stateVersion: room.stateVersion + 1,
      participants,
      feed: [...room.feed, { at: this.tools.now(), type: reason, name: departing.name }]
        .slice(-MAX_FEED_EVENTS),
      abandonAt: nobodyConnected ? this.tools.now() + LOBBY_ABANDONMENT_MS : room.abandonAt,
      alarmGeneration: nobodyConnected ? room.alarmGeneration + 1 : room.alarmGeneration
    };
    await this.storage.put("room", updated);
    if (nobodyConnected && updated.abandonAt !== null) await this.storage.setAlarm(updated.abandonAt);

    this.send(socket, updated.stateVersion, "ack", { applied: true }, command.commandId);
    for (const { socket: open, attachment } of this.authenticatedSockets()) {
      if (attachment.participantId === departing.id) {
        this.close(open, REFUSED_CLOSE_CODE, reason);
      }
    }
    this.broadcast(updated, "participants_changed", this.layout(updated));
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
      // A new identity mid-draft is a spectator, and only where the room allows spectators.
      if (room.phase !== "lobby" && !room.config.spectators) {
        this.turnAway(socket, "spectators_disabled", command.commandId);
        return;
      }
      mintedCredential = base64url(this.tools.randomBytes(CREDENTIAL_BYTES));
      const taken = new Set(room.participants.map((participant) => participant.seat));
      let seat: number | null = null;
      for (let position = 0; room.phase === "lobby" && position < LOBBY_SEAT_COUNT; position += 1) {
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

    // A returning drafter's seat hears they are back; the ring itself never changes.
    let draft = room.draft;
    if (draft !== null && draft.status === "picking" && returning !== undefined) {
      const seat = draft.seats.find((entry) => entry.occupantId === self.id);
      if (seat !== undefined && !seat.connected) {
        try {
          draft = reconnectSeat(draft, {
            round: draft.round, pick: draft.pick, seatId: seat.id, occupantId: self.id
          });
        } catch {
          // A finished or mid-transition draft has nothing to note.
        }
      }
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
      draft,
      feed: [...room.feed, event].slice(-MAX_FEED_EVENTS),
      // Someone is here now; the abandonment appointment is off.
      abandonAt: null
    };
    await this.storage.put("room", updated);
    // In the lobby, the standing appointment becomes the liveness sweep. A started room keeps
    // whatever deadline it already booked; overwriting it here would silence the draft.
    if (updated.phase === "lobby") {
      await this.storage.setAlarm(this.tools.now() + LOBBY_ABANDONMENT_MS);
    }

    // An older socket for the same identity loses to this one, after the state is safe.
    for (const { socket: other, attachment } of this.authenticatedSockets()) {
      if (other !== socket && attachment.participantId === self.id && attachment.generation < self.generation) {
        this.close(other, SUPERSEDED_CLOSE_CODE, "superseded");
      }
    }

    socket.serializeAttachment({ participantId: self.id, generation: self.generation });
    this.send(socket, updated.stateVersion, "hello_ack", {
      ...(mintedCredential === null ? {} : { credential: mintedCredential }),
      self: publicParticipant(self)
    }, command.commandId);
    this.send(socket, updated.stateVersion, "snapshot", this.snapshotPayload(updated, self.id));
    this.sendPrivateView(updated, self.id, socket);
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

  webSocketClose(socket: RoomSocketSlice): Promise<void> {
    return this.serialized(() => this.handleClose(socket));
  }

  private async handleClose(socket: RoomSocketSlice): Promise<void> {
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
    const inLobby = room.phase === "lobby";
    const abandonAt = inLobby && nobodyConnected
      ? this.tools.now() + LOBBY_ABANDONMENT_MS
      : room.abandonAt;

    // A drafter's seat notes the absence; deadlines keep running, and the seat is never vacated.
    let draft = room.draft;
    if (draft !== null && draft.status === "picking") {
      const seat = draft.seats.find((entry) => entry.occupantId === participant.id);
      if (seat !== undefined && seat.connected) {
        try {
          draft = disconnectSeat(draft, {
            round: draft.round, pick: draft.pick, seatId: seat.id, occupantId: participant.id
          });
        } catch {
          // A finished or mid-transition draft has nothing to note.
        }
      }
    }
    // A shrunken readiness set can complete the all-queued condition and start the confirmation.
    const timing = draft === null
      ? { deadlineAt: room.deadlineAt, deadlineAccelerated: room.deadlineAccelerated }
      : this.confirmationAfter(room, draft);

    const updated: RoomSnapshot = {
      ...room,
      stateVersion: room.stateVersion + 1,
      participants,
      draft,
      ...timing,
      feed: [...room.feed, { at: this.tools.now(), type: "disconnect" as const, name: participant.name }]
        .slice(-MAX_FEED_EVENTS),
      abandonAt,
      alarmGeneration: inLobby && nobodyConnected ? room.alarmGeneration + 1 : room.alarmGeneration
    };
    await this.storage.put("room", updated);
    if (inLobby && nobodyConnected && abandonAt !== null) await this.storage.setAlarm(abandonAt);
    if (timing.deadlineAt !== room.deadlineAt && timing.deadlineAt !== null) {
      await this.storage.setAlarm(timing.deadlineAt);
    }

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
  alarm(): Promise<void> {
    return this.serialized(() => this.handleAlarm());
  }

  private async handleAlarm(): Promise<void> {
    const room = await this.room();
    if (room === undefined) return;
    if (room.phase === "lobby") {
      await this.lobbyAlarm(room);
      return;
    }
    await this.deadlineAlarm(room);
  }

  private async lobbyAlarm(room: RoomSnapshot): Promise<void> {
    // The recorded deadline is the abandonment authority: it is only ever set while nobody is
    // connected, and any join clears it and books the liveness sweep below instead.
    if (room.abandonAt === null) {
      await this.reconcileLiveness(room);
      return;
    }
    if (this.tools.now() < room.abandonAt) {
      // Fired early: keep the appointment rather than losing it.
      await this.storage.setAlarm(room.abandonAt);
      return;
    }
    for (const socket of this.state.getWebSockets()) {
      this.close(socket, REFUSED_CLOSE_CODE, "room_closed");
    }
    await this.storage.deleteAll();
  }

  /**
   * The started room's one appointment: a pick commits, a review ends, or a finished room is
   * deleted. Alarms are at-least-once and carry nothing; canonical storage names the deadline,
   * an early wake rebooks it, and a room whose deadline has passed transitions exactly once
   * because the transition itself moves the recorded deadline forward.
   */
  private async deadlineAlarm(room: RoomSnapshot): Promise<void> {
    if (room.deadlineAt === null) return;
    const now = this.tools.now();
    if (now < room.deadlineAt) {
      await this.storage.setAlarm(room.deadlineAt);
      return;
    }

    if (room.phase === "complete") {
      for (const socket of this.state.getWebSockets()) {
        this.close(socket, REFUSED_CLOSE_CODE, "room_closed");
      }
      await this.storage.deleteAll();
      return;
    }

    if (room.phase === "review") {
      const updated: RoomSnapshot = {
        ...room,
        stateVersion: room.stateVersion + 1,
        phase: "picking",
        deadlineAt: this.pickDeadlineFor(room, room.draft as DraftState),
        deadlineAccelerated: false,
        alarmGeneration: room.alarmGeneration + 1
      };
      await this.storage.put("room", updated);
      if (updated.deadlineAt !== null) await this.storage.setAlarm(updated.deadlineAt);
      this.announcePhase(updated);
      this.sendAllPrivateViews(updated);
      return;
    }

    // A pick closes: queued choices commit, and every seat without one draws its fate from the
    // server's entropy — empty and disconnected seats included, which is timeout resolution,
    // not a bot.
    const draft = room.draft as DraftState;
    const queued = new Set(draft.provisionalPicks.map((entry) => entry.seatId));
    const fallbacks = draft.seats
      .filter((seat) => !queued.has(seat.id))
      .map((seat) => ({
        type: "random-fallback" as const,
        round: draft.round,
        pick: draft.pick,
        seatId: seat.id,
        packId: (draft.packsInFlight.find((pack) => pack.atSeatId === seat.id) as { id: string }).id
      }));
    let next: DraftState;
    try {
      next = resolveTimeout(
        draft,
        { type: "timeout", round: draft.round, pick: draft.pick },
        fallbacks,
        { nextUint32: () => this.uint32() }
      );
    } catch {
      // A commit that cannot happen leaves the room exactly as it was.
      return;
    }

    const finished = next.status === "complete";
    const newRound = !finished && next.round !== draft.round;
    const phase: RoomPhase = finished ? "complete" : newRound ? "review" : "picking";
    const deadlineAt = finished
      ? now + COMPLETED_ROOM_TTL_MS
      : newRound
        ? now + REVIEW_SECONDS * 1000
        : this.pickDeadlineFor(room, next);
    const updated: RoomSnapshot = {
      ...room,
      stateVersion: room.stateVersion + 1,
      phase,
      draft: next,
      deadlineAt,
      deadlineAccelerated: false,
      alarmGeneration: room.alarmGeneration + 1,
      feed: finished || newRound
        ? [...room.feed, {
            at: now,
            type: finished ? "completion" as const : "review" as const,
            name: room.config.name
          }].slice(-MAX_FEED_EVENTS)
        : room.feed
    };
    await this.storage.put("room", updated);
    if (updated.deadlineAt !== null) await this.storage.setAlarm(updated.deadlineAt);
    this.announcePhase(updated);
    this.sendAllPrivateViews(updated);
  }

  /** The judge schedule for the draft's current visible pack size, or nothing with timers off. */
  private pickDeadlineFor(room: RoomSnapshot, draft: DraftState): number | null {
    if (!room.config.timers) return null;
    const seconds = PICK_SECONDS[PACK_SIZE - (draft.pick - 1)];
    return seconds === undefined ? null : this.tools.now() + seconds * 1000;
  }

  /**
   * A socket can die without its close event — a deploy tears every connection down at once —
   * so while the lobby believes anyone is connected, the object keeps a standing appointment
   * and, when it fires, checks that belief against the sockets that actually exist. Ghosts are
   * marked disconnected; a lobby that turns out to be empty starts its abandonment clock.
   */
  private async reconcileLiveness(room: RoomSnapshot): Promise<void> {
    const live = new Map(
      this.authenticatedSockets().map(({ attachment }) => [attachment.participantId, attachment.generation])
    );
    const participants = room.participants.map((entry) =>
      entry.connected && live.get(entry.id) !== entry.generation ? { ...entry, connected: false } : entry);
    const changed = participants.some((entry, index) => entry !== room.participants[index]);
    const nobodyConnected = participants.every((entry) => !entry.connected);

    if (!changed && !nobodyConnected) {
      // The belief held; keep watching.
      await this.storage.setAlarm(this.tools.now() + LOBBY_ABANDONMENT_MS);
      return;
    }

    const abandonAt = nobodyConnected ? this.tools.now() + LOBBY_ABANDONMENT_MS : null;
    const updated: RoomSnapshot = {
      ...room,
      stateVersion: room.stateVersion + 1,
      participants,
      abandonAt,
      alarmGeneration: room.alarmGeneration + 1
    };
    await this.storage.put("room", updated);
    await this.storage.setAlarm(abandonAt ?? this.tools.now() + LOBBY_ABANDONMENT_MS);
    if (changed) {
      this.broadcast(updated, "participants_changed", {
        participants: updated.participants.map(publicParticipant)
      });
    }
  }
}
