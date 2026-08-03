import {
  type VerifiedOmensBytes,
  verifyOmensBytesAgainstDigest
} from "./checksum.ts";

export { OmensRecipeChecksumError } from "./checksum.ts";

export const OMENS_RECIPE = Object.freeze({
  id: "rantaways-omn-draft-3.8-fixed-layout-probabilities",
  filename: "OMN_Draft_3.8 - Fixed New Layout Probabilities.txt",
  sha256: "97a964c8c5b6a962404398ca2b57c9ceeeb2dfb714512e61ff22e07ea1ec2328",
  provenance: "community-not-official",
  visibleCardScope: 14
});

export type VerifiedOmensRecipe = Readonly<{
  descriptor: typeof OMENS_RECIPE;
  verification: VerifiedOmensBytes;
}>;

export const verifyOmensRecipeBytes = (bytes: Uint8Array): VerifiedOmensRecipe =>
  Object.freeze({
    descriptor: OMENS_RECIPE,
    verification: verifyOmensBytesAgainstDigest(bytes, OMENS_RECIPE.sha256)
  });
