/**
 * The stateful half of talking to a room: one connection, kept alive and honest.
 *
 * The driver owns exactly one socket at a time. It says hello with the room's stored credential,
 * keeps the identity the server returns, estimates the server's clock from every frame, notices
 * when it has fallen behind and asks to resync, and reconnects with bounded backoff when the
 * connection dies underneath it. It never reconnects over a refusal, a removal, or a newer
 * connection for the same identity — those are answers, not accidents.
 *
 * Every platform surface arrives injected: the socket factory, the clock, the scheduler, and
 * credential storage. Tests drive the whole lifecycle with fakes; the page passes the real ones.
 */

import {
  backoffMs,
  buildCommand,
  credentialStorageKey,
  fellBehind,
  initialClock,
  observeClock,
  observeCoarse,
  readFrame,
  type ClockEstimate,
  type ServerFrame
} from "./protocol.ts";

/** The slice of a browser WebSocket the driver uses; handlers are assigned, never added. */
export interface DriverSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
}

export interface DriverHooks {
  openSocket(code: string): DriverSocket;
  now(): number;
  /** Schedules a callback and returns its cancel. */
  schedule(callback: () => void, delayMs: number): () => void;
  loadStored(key: string): string | null;
  store(key: string, value: string): void;
  /** Every accepted frame, in arrival order, after the driver's own bookkeeping. */
  onFrame(frame: ServerFrame): void;
  /** Lifecycle announcements the page can render. */
  onStatus(status: DriverStatus): void;
}

export type DriverStatus =
  | { readonly state: "connecting" }
  | { readonly state: "connected" }
  | { readonly state: "reconnecting"; readonly attempt: number; readonly waitMs: number }
  | { readonly state: "superseded" }
  | { readonly state: "refused"; readonly reason: string }
  | { readonly state: "closed"; readonly reason: string };

/** Close codes that are answers, never accidents; the driver does not argue with them. */
const SUPERSEDED = 4000;
const REFUSED = 4001;

export interface HelloFields {
  readonly name?: string;
  readonly password?: string;
  readonly hostClaim?: string;
}

export class RoomClient {
  private readonly hooks: DriverHooks;
  private readonly code: string;
  private hello: HelloFields;
  private socket: DriverSocket | null = null;
  private clock: ClockEstimate = initialClock();
  private lastVersion: number | null = null;
  private readonly pendingSends = new Map<string, number>();
  private commandCounter = 0;
  private attempts = 0;
  private everConnected = false;
  private stopped = false;
  private cancelReconnect: (() => void) | null = null;

  constructor(code: string, hello: HelloFields, hooks: DriverHooks) {
    this.code = code;
    this.hello = hello;
    this.hooks = hooks;
  }

  /** Opens the connection; safe to call once. Reconnection is the driver's own business. */
  connect(): void {
    if (this.stopped || this.socket !== null) return;
    this.hooks.onStatus({ state: "connecting" });
    this.attach(this.hooks.openSocket(this.code));
  }

  /** One hello builder for first connections and reconnections alike; what it says is whatever
   * remains in `hello`, and the ack below is what retires the one-shot fields. */
  private attach(socket: DriverSocket): void {
    this.socket = socket;
    socket.onopen = () => {
      const credential = this.hooks.loadStored(credentialStorageKey(this.code));
      this.sendRaw("hello", {
        ...(credential === null ? {} : { credential }),
        ...(this.hello.name === undefined ? {} : { name: this.hello.name }),
        ...(this.hello.password === undefined ? {} : { password: this.hello.password }),
        ...(this.hello.hostClaim === undefined ? {} : { hostClaim: this.hello.hostClaim })
      });
    };
    socket.onmessage = (event) => this.receive(event.data);
    socket.onclose = (event) => this.closed(event.code, event.reason);
  }

  /** Sends one command; the ack will echo the returned command id. */
  send(type: string, payload: Record<string, unknown>): string {
    return this.sendRaw(type, payload);
  }

  /** The current clock estimate; the page renders deadlines through it. */
  clockEstimate(): ClockEstimate {
    return this.clock;
  }

  /** The last state version this driver has seen; commands that must name one use it. */
  lastSeenVersion(): number | null {
    return this.lastVersion;
  }

  /** Leaves on purpose: the room hears it, and the driver stops arguing with the close. */
  leave(): void {
    if (this.socket !== null) this.sendRaw("leave", {});
    this.stop("left");
  }

  /** Stops the driver entirely; no further frames, no reconnects. */
  stop(reason: string): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.cancelReconnect !== null) this.cancelReconnect();
    const socket = this.socket;
    this.socket = null;
    if (socket !== null) {
      socket.onclose = null;
      socket.close(1000, "done");
    }
    this.hooks.onStatus({ state: "closed", reason });
  }

  private sendRaw(type: string, payload: Record<string, unknown>): string {
    const socket = this.socket;
    if (socket === null) throw new Error("The room is not connected.");
    this.commandCounter += 1;
    const commandId = `c${this.commandCounter}`;
    this.pendingSends.set(commandId, this.hooks.now());
    socket.send(buildCommand(commandId, type, payload));
    return commandId;
  }

  private receive(data: unknown): void {
    const frame = readFrame(data);
    if (frame === null) return;
    const receivedAt = this.hooks.now();
    // A frame provoked by us bounds the clock by its own command's round trip; a frame we did
    // not provoke bounds nothing and may only seed a provisional offset.
    const sentAt = frame.commandId === undefined ? undefined : this.pendingSends.get(frame.commandId);
    if (frame.commandId !== undefined) this.pendingSends.delete(frame.commandId);
    this.clock = sentAt === undefined
      ? observeCoarse(this.clock, frame.serverNow, receivedAt)
      : observeClock(this.clock, frame.serverNow, sentAt, receivedAt);

    if (frame.type === "hello_ack") {
      this.everConnected = true;
      this.attempts = 0;
      // The claim is spent and the name is delivered; a reconnect carries only the password.
      this.hello = { password: this.hello.password };
      const credential = frame.payload.credential;
      if (typeof credential === "string") {
        this.hooks.store(credentialStorageKey(this.code), credential);
      }
      this.hooks.onStatus({ state: "connected" });
    }

    if (frame.type === "snapshot") {
      this.lastVersion = frame.stateVersion;
    } else if (fellBehind(this.lastVersion, frame.stateVersion)) {
      // A gap means missed frames; ask for the whole truth rather than guessing.
      this.lastVersion = frame.stateVersion;
      this.sendRaw("resync", {});
    } else {
      this.lastVersion = Math.max(this.lastVersion ?? frame.stateVersion, frame.stateVersion);
    }

    this.hooks.onFrame(frame);
  }

  private closed(closeCode: number, reason: string): void {
    this.socket = null;
    // Whatever was in flight died with the connection; its acks can never arrive.
    this.pendingSends.clear();
    if (this.stopped) return;
    if (closeCode === SUPERSEDED) {
      this.stopped = true;
      this.hooks.onStatus({ state: "superseded" });
      return;
    }
    if (closeCode === REFUSED) {
      this.stopped = true;
      this.hooks.onStatus({ state: "refused", reason });
      return;
    }
    if (!this.everConnected) {
      // Never in: one honest failure, no retry storm against a door that never opened.
      this.stopped = true;
      this.hooks.onStatus({ state: "closed", reason: reason === "" ? "unreachable" : reason });
      return;
    }
    this.attempts += 1;
    const waitMs = backoffMs(this.attempts);
    this.hooks.onStatus({ state: "reconnecting", attempt: this.attempts, waitMs });
    this.cancelReconnect = this.hooks.schedule(() => {
      this.cancelReconnect = null;
      if (this.stopped) return;
      this.hooks.onStatus({ state: "connecting" });
      this.attach(this.hooks.openSocket(this.code));
    }, waitMs);
  }
}
