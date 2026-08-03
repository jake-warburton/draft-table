import {
  type VerifiedOmensBytes,
  verifyPinnedOmensBytes
} from "./checksum.ts";
import { OMENS_RECIPE } from "./descriptor.ts";

export { OmensRecipeChecksumError } from "./checksum.ts";
export { OMENS_RECIPE } from "./descriptor.ts";

export type VerifiedOmensRecipe = Readonly<{
  descriptor: typeof OMENS_RECIPE;
  verification: VerifiedOmensBytes;
}>;

export const verifyOmensRecipeBytes = (bytes: Uint8Array): VerifiedOmensRecipe =>
  Object.freeze({
    descriptor: OMENS_RECIPE,
    verification: verifyPinnedOmensBytes(bytes)
  });
