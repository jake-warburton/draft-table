/**
 * Creating a room and addressing its socket — the only HTTP the client ever speaks.
 *
 * One POST creates a room and returns its code with the one-time host claim; one URL shape
 * addresses the room's socket on the page's own host. Both talk exclusively to the origin the
 * page came from, and the fetch arrives injected so tests drive this without a network.
 */

import { normalizeRoomCode } from "@draft-table/contracts";

export interface RoomOptions {
  readonly password?: string;
  readonly timers?: boolean;
  readonly poolHidden?: boolean;
  readonly spectators?: boolean;
}

export type CreateOutcome =
  | { readonly ok: true; readonly code: string; readonly hostClaim: string }
  | { readonly ok: false; readonly reason: "invalid" | "unavailable" | "failed" };

export type Fetcher = (path: string, init: {
  method: string;
  headers: Record<string, string>;
  body: string;
}) => Promise<{ status: number; json(): Promise<unknown> }>;

/** Creates one room through the page's own origin; refusals come back as reasons, not throws. */
export const createRoom = async (options: RoomOptions, fetcher: Fetcher): Promise<CreateOutcome> => {
  let response: { status: number; json(): Promise<unknown> };
  try {
    response = await fetcher("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(options)
    });
  } catch {
    return { ok: false, reason: "failed" };
  }
  if (response.status === 400) return { ok: false, reason: "invalid" };
  if (response.status === 503) return { ok: false, reason: "unavailable" };
  if (response.status !== 201) return { ok: false, reason: "failed" };
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, reason: "failed" };
  }
  if (typeof body !== "object" || body === null) return { ok: false, reason: "failed" };
  const { code, hostClaim } = body as Record<string, unknown>;
  if (typeof code !== "string" || typeof hostClaim !== "string") return { ok: false, reason: "failed" };
  return { ok: true, code, hostClaim };
};

/**
 * Reads whatever spelling of a code a drafter typed and returns the canonical one, or null.
 * The refused text never travels anywhere; it is the caller's to re-prompt with.
 */
export const readTypedCode = (typed: string): string | null => {
  try {
    return normalizeRoomCode(typed);
  } catch {
    return null;
  }
};

/** The room's socket lives on the page's own host, and nowhere else, ever. */
export const socketPath = (code: string): string => `/api/rooms/${code}/socket`;

export const socketUrl = (pageProtocol: string, host: string, code: string): string =>
  `${pageProtocol === "http:" ? "ws:" : "wss:"}//${host}${socketPath(code)}`;
