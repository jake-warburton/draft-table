/**
 * The Worker's dynamic routes.
 *
 * There are only two: create a room, and open a socket into one. Everything else a browser asks
 * for is a static asset, so this file stays deliberately small. It mints and reads room codes,
 * turns away traffic a room object should never have to see, and then gets out of the way. Room
 * state, passwords, identity credentials, and every rule of the draft belong to the object.
 *
 * Two habits run through it. Nothing a caller sent is ever repeated back, because a create
 * request may carry a room password and a code is an unlisted address. And an invalid request is
 * answered here rather than forwarded, because a rejected request that reaches the object spends
 * two of the day's requests instead of one.
 */

import { createRoomCode, normalizeRoomCode } from "@draft-table/contracts";

import { MAX_CREATE_BODY_BYTES, ROOM_CREATE_ATTEMPTS } from "./limits.ts";

// The runtime finds Durable Object classes on the Worker entry module.
export { RoomObject } from "./room.ts";

/** The slice of Cloudflare's Durable Object namespace binding this router uses. */
export interface RoomNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}

/** The slice of the Workers static-assets binding this router uses. */
export interface AssetBinding {
  fetch(request: Request): Promise<Response> | Response;
}

/** Bindings are optional here so that a half-configured deployment refuses instead of throwing. */
export interface RouterEnv {
  ROOMS?: RoomNamespace;
  ASSETS?: AssetBinding;
}

// The Workers runtime refuses an entry module whose runtime exports are anything but handlers
// and Durable Object classes, so the router's bounds live in ./limits.ts rather than here.

/** Durable Object requests need an absolute URL; this host is reserved and never resolves. */
const INTERNAL_ORIGIN = "https://rooms.invalid";

const SOCKET_PATH = /^\/api\/rooms\/([^/]+)\/socket$/u;

const randomBytes = (byteCount: number): Uint8Array => crypto.getRandomValues(new Uint8Array(byteCount));

/** Stable, non-secret refusal codes: enough for a client to act on, not enough to probe with. */
const refuse = (status: number, error: string, extra: Record<string, string> = {}): Response =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extra
    }
  });

/**
 * Same-origin only, on both routes. The socket check is the one the security notes call for, and
 * applying it to room creation costs a header comparison. Nothing here answers a preflight, so no
 * other site is invited to read a response either.
 */
const sameOrigin = (request: Request, url: URL): boolean => request.headers.get("origin") === url.origin;

const isJsonContentType = (request: Request): boolean => {
  const header = request.headers.get("content-type");
  if (header === null) return false;
  return header.split(";")[0].trim().toLowerCase() === "application/json";
};

type BodyRead =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly reason: "too_large" | "malformed" };

/**
 * Reads a request body, stopping at the limit rather than trusting the declared length. A client
 * that declares nothing, or declares less than it sends, still cannot make this Worker hold more
 * than the limit in memory.
 */
const readBoundedBody = async (request: Request, limit: number): Promise<BodyRead> => {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    if (!/^[0-9]+$/u.test(declared)) return { ok: false, reason: "malformed" };
    if (Number(declared) > limit) return { ok: false, reason: "too_large" };
  }

  const body = request.body;
  if (body === null) return { ok: true, text: "" };

  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let seen = 0;
  let text = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      seen += chunk.value.byteLength;
      if (seen > limit) {
        await reader.cancel();
        return { ok: false, reason: "too_large" };
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } catch {
    // A stream that fails part way, or bytes that are not UTF-8 at all.
    return { ok: false, reason: "malformed" };
  }
  return { ok: true, text };
};

/** Whether this is one JSON object. Its contents are the object's business, not this router's. */
const isJsonObject = (text: string): boolean => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return false;
  }
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
};

const createRoom = async (request: Request, url: URL, rooms: RoomNamespace): Promise<Response> => {
  if (!sameOrigin(request, url)) return refuse(403, "forbidden_origin");
  if (!isJsonContentType(request)) return refuse(415, "unsupported_media_type");

  const read = await readBoundedBody(request, MAX_CREATE_BODY_BYTES);
  if (!read.ok) {
    return read.reason === "too_large" ? refuse(413, "payload_too_large") : refuse(400, "malformed_request");
  }
  if (!isJsonObject(read.text)) return refuse(400, "malformed_request");

  for (let attempt = 0; attempt < ROOM_CREATE_ATTEMPTS; attempt += 1) {
    const code = createRoomCode(randomBytes);
    let response: Response;
    try {
      response = await rooms.get(rooms.idFromName(code)).fetch(new Request(`${INTERNAL_ORIGIN}/rooms/${code}/initialize`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: read.text
      }));
    } catch {
      return refuse(500, "server_error");
    }

    // Only the object can say a code is taken, because only the object is serialized. It also
    // keeps the code it was initialized under, so no later request has to hand it back.
    if (response.status === 409) continue;
    // The object read the configuration and refused it; that verdict is the caller's to hear,
    // though in this router's own words rather than the object's body.
    if (response.status === 400) return refuse(400, "malformed_request");
    if (response.status !== 201) return refuse(500, "server_error");

    const created = new Response(response.body, response);
    // This body carries the host's identity credential; it belongs in no cache.
    created.headers.set("cache-control", "no-store");
    created.headers.set("x-content-type-options", "nosniff");
    return created;
  }

  return refuse(503, "room_unavailable");
};

const openRoomSocket = async (request: Request, url: URL, rooms: RoomNamespace, segment: string): Promise<Response> => {
  if (!sameOrigin(request, url)) return refuse(403, "forbidden_origin");
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return refuse(426, "upgrade_required");

  let code: string;
  try {
    // The path segment is read exactly as it arrived. A minted code never needs escaping, so a
    // percent-encoded spelling is a second name for the same room and is simply not one we know.
    code = normalizeRoomCode(segment);
  } catch {
    return refuse(404, "not_found");
  }

  try {
    // Forwarded untouched: a WebSocket upgrade does not survive being rebuilt.
    return await rooms.get(rooms.idFromName(code)).fetch(request);
  } catch {
    return refuse(500, "server_error");
  }
};

const route = async (request: Request, env: RouterEnv): Promise<Response> => {
  const url = new URL(request.url);
  const path = url.pathname;

  if (!path.startsWith("/api/")) {
    const assets = env.ASSETS;
    if (assets === undefined) return refuse(500, "server_error");
    return assets.fetch(request);
  }

  // A missing room binding is a broken deployment. There is no separate check for it because the
  // call into the object below already throws, and both routes answer that as our own failure.
  if (path === "/api/rooms") {
    if (request.method !== "POST") return refuse(405, "method_not_allowed", { allow: "POST" });
    return createRoom(request, url, env.ROOMS as RoomNamespace);
  }

  const socket = SOCKET_PATH.exec(path);
  if (socket !== null) {
    if (request.method !== "GET") return refuse(405, "method_not_allowed", { allow: "GET" });
    return openRoomSocket(request, url, env.ROOMS as RoomNamespace, socket[1]);
  }

  // A room route we do not have is refused here rather than falling through to the client, so the
  // single-page fallback can never answer for the API.
  return refuse(404, "not_found");
};

export default { fetch: route };
