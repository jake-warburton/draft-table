import { stat } from "node:fs/promises";
import { join } from "node:path";

const clientCeiling = 2048;
const clientDirectory = process.env.BUNDLE_SIZE_CLIENT_DIR ?? "apps/web/dist";
const clientFiles = ["index.html", "styles.css", "main.js"].map((file) => join(clientDirectory, file));
const sizes = await Promise.all(clientFiles.map(async (path) => (await stat(path)).size));
const total = sizes.reduce((sum, size) => sum + size, 0);

console.log(`Client bundle: ${total} bytes (${clientFiles.join(", ")})`);
console.log("Server bundle: 0 bytes (not yet emitted; boundary typechecked only)");

if (total > clientCeiling) {
  console.error(`Client bundle exceeds ${clientCeiling}-byte ceiling.`);
  process.exitCode = 1;
}
