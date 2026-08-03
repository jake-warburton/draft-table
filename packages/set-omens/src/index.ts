import { sha256Hex } from "./sha256.ts";

export const OMENS_RECIPE = Object.freeze({
  id: "rantaways-omn-draft-3.8-fixed-layout-probabilities",
  filename: "OMN_Draft_3.8 - Fixed New Layout Probabilities.txt",
  sha256: "97a964c8c5b6a962404398ca2b57c9ceeeb2dfb714512e61ff22e07ea1ec2328",
  provenance: "community-not-official",
  visibleCardScope: 14
});

export class OmensRecipeChecksumError extends Error {
  readonly code = "OMENS_RECIPE_CHECKSUM_MISMATCH";

  constructor() {
    super("Omens recipe checksum mismatch.");
    this.name = "OmensRecipeChecksumError";
  }
}

export type VerifiedOmensRecipe = Readonly<{
  descriptor: typeof OMENS_RECIPE;
  bytes: Uint8Array;
}>;

export const verifyOmensRecipeBytes = (bytes: Uint8Array): VerifiedOmensRecipe => {
  if (sha256Hex(bytes) !== OMENS_RECIPE.sha256) {
    throw new OmensRecipeChecksumError();
  }

  return Object.freeze({ descriptor: OMENS_RECIPE, bytes: bytes.slice() });
};
