/**
 * The router's bounds, in their own module because the Worker entry cannot export them: the
 * Workers runtime requires every runtime export of the entry module to be a handler or a
 * Durable Object class, and refuses to boot over a plain number.
 */

/**
 * A room's configuration is a name, an optional password, and a handful of flags. The 16 KiB cap
 * in the architecture notes is for WebSocket protocol commands; a create request has no reason to
 * come near it.
 */
export const MAX_CREATE_BODY_BYTES = 4096;

/**
 * Forty random bits make a collision a curiosity rather than an expectation, so a few attempts is
 * generous. Giving up beats spinning while the day's request allowance drains.
 */
export const ROOM_CREATE_ATTEMPTS = 5;
