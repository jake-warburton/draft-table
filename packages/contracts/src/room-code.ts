/**
 * Room codes.
 *
 * A code is the unlisted address of a room, not authorization for it: eight Crockford-Base32
 * symbols carrying exactly forty random bits. Five entropy bytes become eight five-bit symbols
 * with nothing left over, so every code is exactly as likely as every other and no rejection
 * sampling is needed.
 *
 * Reading follows Crockford's own rules, because people retype these from a phone screen: case is
 * ignored, `I` and `L` read as one, `O` reads as zero, and hyphens added for readability are
 * dropped. `U` is excluded from the alphabet rather than aliased, so it is refused.
 *
 * A refusal never echoes the rejected text: codes are unlisted addresses and do not belong in
 * error messages, logs, or stack traces.
 */

const freeze: typeof Object.freeze = Object.freeze;
const defineOwnDataProperty: typeof Object.defineProperty = Object.defineProperty;

/** Crockford-Base32: the digits and the letters, less `I`, `L`, `O`, and `U`. */
export const ROOM_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export const ROOM_CODE_LENGTH = 8;

/** Forty bits: exactly `ROOM_CODE_LENGTH` symbols of five bits each. */
export const ROOM_CODE_ENTROPY_BYTES = 5;

/** Stable, address-free failure for anything that is not a room code. */
export class RoomCodeError extends Error {
  declare readonly code: "ROOM_CODE_INVALID";

  constructor() {
    super("That is not a room code.");
    defineOwnDataProperty(this, "name", { value: "RoomCodeError", writable: true, enumerable: true, configurable: true });
    defineOwnDataProperty(this, "code", { value: "ROOM_CODE_INVALID", writable: true, enumerable: true, configurable: true });
    defineOwnDataProperty(this, "stack", { value: "RoomCodeError: That is not a room code.", writable: true, enumerable: false, configurable: true });
  }
}

freeze(RoomCodeError.prototype);
freeze(RoomCodeError);

const fail = (): never => { throw new RoomCodeError(); };

/** Reading aliases, applied after upper-casing. Hyphens are dropped before this point. */
const ALIASES = new Map([["I", "1"], ["L", "1"], ["O", "0"]]);

/** Supplies the entropy. Callers own randomness here exactly as they do in the draft engine. */
export type RoomCodeEntropy = (byteCount: number) => Uint8Array;

/**
 * Mints one code from caller-supplied entropy.
 *
 * A source that returns anything other than exactly `ROOM_CODE_ENTROPY_BYTES` bytes is refused
 * rather than padded, truncated, or retried: a code minted from less entropy than it appears to
 * carry is worse than no code.
 */
export const createRoomCode = (entropy: RoomCodeEntropy): string => {
  let supplied: unknown;
  try {
    supplied = entropy(ROOM_CODE_ENTROPY_BYTES);
  } catch {
    return fail();
  }
  if (!(supplied instanceof Uint8Array) || supplied.length !== ROOM_CODE_ENTROPY_BYTES) fail();

  const source = supplied as Uint8Array;
  let bits = 0;
  for (const byte of source) bits = bits * 256 + byte;

  let code = "";
  for (let symbol = ROOM_CODE_LENGTH - 1; symbol >= 0; symbol -= 1) {
    // 2 ** (5 * symbol) rather than a shift: forty bits do not fit in a 32-bit integer.
    const place = 2 ** (5 * symbol);
    const index = Math.floor(bits / place) % 32;
    code += ROOM_CODE_ALPHABET[index];
  }
  return code;
};

/**
 * Reads one code the way a person might have typed it and returns its canonical form, or refuses.
 */
export const normalizeRoomCode = (candidate: unknown): string => {
  if (typeof candidate !== "string") fail();

  const trimmed = (candidate as string).trim();
  let normalized = "";
  for (const character of trimmed.toUpperCase()) {
    if (character === "-") continue;
    const symbol = ALIASES.get(character) ?? character;
    if (!ROOM_CODE_ALPHABET.includes(symbol)) fail();
    normalized += symbol;
  }

  if (normalized.length !== ROOM_CODE_LENGTH) fail();
  return normalized;
};

/** Whether this is a code, without throwing. */
export const isRoomCode = (candidate: unknown): boolean => {
  try {
    normalizeRoomCode(candidate);
    return true;
  } catch {
    return false;
  }
};
