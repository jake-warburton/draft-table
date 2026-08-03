import { readFileSync } from "node:fs";
import { parseVerifiedOmensCustomCards, verifyOmensRecipeBytes } from "../src/index.ts";

const evidencePath = process.env.OMENS_RECIPE_EVIDENCE_PATH;
if (evidencePath === undefined) {
  process.exitCode = 1;
} else {
  try {
    parseVerifiedOmensCustomCards(verifyOmensRecipeBytes(readFileSync(evidencePath)));
    console.log("private CustomCards parse passed");
  } catch {
    process.exitCode = 1;
  }
}
