import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const clientDirectory = "apps/web/dist";
const expectedClientFiles = ["index.html", "styles.css"];

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

const missingClientFiles = [];
for (const path of expectedClientFiles.map((file) => join(clientDirectory, file))) {
  try {
    await stat(path);
  } catch {
    missingClientFiles.push(path);
  }
}

if (missingClientFiles.length > 0) {
  console.error(`Built client output is incomplete: missing ${missingClientFiles.join(", ")}.`);
  process.exitCode = 1;
} else {
  const clientFiles = (await listFiles(clientDirectory)).sort();
  const sizes = await Promise.all(clientFiles.map(async (path) => (await stat(path)).size));
  const total = sizes.reduce((sum, size) => sum + size, 0);
  const emittedContents = await Promise.all(clientFiles.map((path) => readFile(path, "utf8")));
  const forbiddenBuildTimeModules = /\bajv(?:-draft-04)?\b/i;

  console.log(`Client bundle: ${total} bytes (${clientFiles.join(", ")})`);
  console.log("Server bundle: 0 bytes (not yet emitted; boundary typechecked only)");

  if (emittedContents.some((content) => forbiddenBuildTimeModules.test(content))) {
    console.error("Emitted client/server artifacts must not contain Ajv module identifiers.");
    process.exitCode = 1;
  }
}
