import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const clientCeiling = 2048;
const clientDirectory = process.env.BUNDLE_SIZE_CLIENT_DIR ?? "apps/web/dist";

const listFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? listFiles(path) : entry.isFile() ? [path] : [];
    })
  );
  return files.flat();
};

const clientFiles = (await listFiles(clientDirectory)).sort();
const sizes = await Promise.all(clientFiles.map(async (path) => (await stat(path)).size));
const total = sizes.reduce((sum, size) => sum + size, 0);

console.log(`Client bundle: ${total} bytes (${clientFiles.join(", ")})`);
console.log("Server bundle: 0 bytes (not yet emitted; boundary typechecked only)");

if (total > clientCeiling) {
  console.error(`Client bundle exceeds ${clientCeiling}-byte ceiling.`);
  process.exitCode = 1;
}
