import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesIn(path) : [path];
  }));
  return nested.flat();
}

const files = (await Promise.all(process.argv.slice(2).map(filesIn))).flat()
  .filter((path) => path.endsWith(".ts"));

for (const path of files) {
  const source = await readFile(path, "utf8");
  if (/\t| +$/m.test(source)) {
    throw new Error(`${path} contains tabs or trailing whitespace`);
  }
}
