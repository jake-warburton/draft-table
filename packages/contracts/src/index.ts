/**
 * Shared contracts between the browser client and the room server.
 *
 * Anything here is used by both sides. Nothing is added speculatively: a shape earns a place in
 * this package when a second real caller needs it, not when one might.
 */

export {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_ENTROPY_BYTES,
  ROOM_CODE_LENGTH,
  RoomCodeError,
  createRoomCode,
  isRoomCode,
  normalizeRoomCode,
  type RoomCodeEntropy
} from "./room-code.ts";
