import { stat } from "node:fs/promises";

const clientFiles = ["apps/web/dist/index.html", "apps/web/dist/styles.css", "apps/web/dist/main.js"];
const sizes = await Promise.all(clientFiles.map(async (path) => (await stat(path)).size));
const total = sizes.reduce((sum, size) => sum + size, 0);

console.log(`Client bundle: ${total} bytes (${clientFiles.join(", ")})`);
console.log("Server bundle: 0 bytes (not yet emitted; boundary typechecked only)");
