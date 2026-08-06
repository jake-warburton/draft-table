import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Copies the official Omens card art into our own storage so it can be served from our host.
 *
 * The reviewed set snapshot is the only source of truth about which images exist and where each
 * one lives: this utility invents no URL, follows no redirect, and stores nothing it has not first
 * proven to be a real WebP served as one. Every copied byte is recorded by digest in a committed
 * manifest, while the images themselves stay out of version control.
 *
 * It copies to a local directory and uploads nothing. Publishing is a separate, deliberate step.
 *
 *   npm run migrate:card-images        # copy, then write the manifest
 *   npm run verify:card-images         # re-hash the local copies against the manifest, no network
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Where copied art lives, relative to the repository root. It is gitignored, never committed. */
export const CARD_IMAGE_DIRECTORY = "apps/server/card-images";

/** The committed record of exactly what was copied. It holds digests and sizes, never content. */
export const CARD_IMAGE_MANIFEST = "apps/server/card-image-manifest.json";

/** Art may only ever be copied from Legend Story Studios' own public host. */
export const PINNED_ORIGIN = "https://legendstory-production-s3-public.s3.amazonaws.com";

/** Four at a time keeps our own request rate modest against a host that owes us nothing. */
const DEFAULT_CONCURRENCY = 4;

/** A collector identifier that is safe to use as a file name without further escaping. */
const SAFE_IDENTIFIER = /^[A-Z]{3}[0-9]{3}$/u;

export class CardImageMigrationError extends Error {
  constructor(reason) {
    super(`Card image migration failed: ${reason}`);
    this.name = "CardImageMigrationError";
    this.code = "CARD_IMAGE_MIGRATION_FAILED";
    this.reason = reason;
  }
}

const fail = (reason) => { throw new CardImageMigrationError(reason); };

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

/**
 * Derives the copy plan from the reviewed snapshot alone.
 *
 * The identifier is checked before it is ever joined to a path, so a snapshot cannot direct a write
 * outside the output directory, and the source is checked against the pinned origin, so a snapshot
 * cannot redirect the copy at some other host.
 */
export const planCardImageMigration = (snapshot) => {
  const identities = snapshot?.identities;
  if (!Array.isArray(identities) || identities.length === 0) fail("the snapshot lists no identities");

  const planned = identities.map((identity) => {
    const { id, image } = identity;
    if (typeof id !== "string" || !SAFE_IDENTIFIER.test(id)) fail(`identity ${JSON.stringify(id)} is not a safe collector identifier`);
    if (typeof image !== "string" || image !== `${PINNED_ORIGIN}/media/cards/normal/${id}.webp`) {
      fail(`identity ${id} does not carry its own image on the pinned origin`);
    }
    return Object.freeze({ id, source: image, fileName: `${id}.webp` });
  });

  const names = new Set(planned.map(({ fileName }) => fileName));
  if (names.size !== planned.length) fail("two identities would be copied to the same file");
  return Object.freeze([...planned].sort((left, right) => (left.id < right.id ? -1 : 1)));
};

/**
 * Accepts one response only when it is unambiguously the image we asked for. A redirect, an error
 * page, or another RIFF format would otherwise be stored under a card's name and served as its art.
 */
export const verifyCardImageResponse = (id, response) => {
  const { status, contentType, bytes } = response ?? {};
  if (status !== 200) fail(`${id} answered with status ${status} rather than 200`);
  if (typeof contentType !== "string" || !contentType.startsWith("image/webp")) {
    fail(`${id} was served as ${JSON.stringify(contentType)} rather than image/webp`);
  }
  const body = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
  if (body.length === 0) fail(`${id} answered with an empty body`);
  if (body.length < 12 || body.subarray(0, 4).toString("ascii") !== "RIFF" || body.subarray(8, 12).toString("ascii") !== "WEBP") {
    fail(`${id} answered with a body that is not a WebP image`);
  }
  return { sha256: digest(body), byteLength: body.length, bytes: body };
};

/** Runs the tasks with never more than `limit` in flight, failing the whole run on the first error. */
const boundedAll = async (items, limit, run) => {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await run(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
};

const readIfPresent = async (path) => {
  try {
    return await readFile(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
};

/** The real fetcher. It is injected so every contract above is testable without a network. */
const fetchOfficialImage = async ({ source }) => {
  const response = await fetch(source, { redirect: "manual", headers: { accept: "image/webp" } });
  return {
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
    bytes: Buffer.from(await response.arrayBuffer())
  };
};

/**
 * Copies every planned image into `directory`.
 *
 * Given a previous manifest, an image whose local copy still matches its recorded digest is left
 * alone rather than refetched, and one that no longer matches stops the run instead of being
 * quietly replaced: a local file that drifted is a question, not something to paper over.
 */
export const migrateCardImages = async ({ plan, directory, fetchImage = fetchOfficialImage, concurrency = DEFAULT_CONCURRENCY, manifest, onCopied }) => {
  const output = resolve(directory);
  await mkdir(output, { recursive: true });
  const recorded = new Map((manifest?.images ?? []).map((entry) => [entry.id, entry]));

  const images = await boundedAll(plan, concurrency, async (entry) => {
    const target = join(output, entry.fileName);
    if (!target.startsWith(`${output}/`)) fail(`${entry.id} would be written outside the output directory`);

    const known = recorded.get(entry.id);
    if (known !== undefined) {
      const existing = await readIfPresent(target);
      if (existing !== null) {
        if (digest(existing) !== known.sha256) fail(`${entry.id} no longer matches the digest the manifest records`);
        return { id: entry.id, fileName: entry.fileName, source: entry.source, sha256: known.sha256, byteLength: existing.length };
      }
    }

    const verified = verifyCardImageResponse(entry.id, await fetchImage(entry));
    await writeFile(target, verified.bytes);
    onCopied?.(entry.id);
    return { id: entry.id, fileName: entry.fileName, source: entry.source, sha256: verified.sha256, byteLength: verified.byteLength };
  });

  return { images: [...images].sort((left, right) => (left.id < right.id ? -1 : 1)) };
};

/** Serializes the manifest deterministically, so an unchanged copy produces an unchanged file. */
export const buildCardImageManifest = (images) => `${JSON.stringify({
  origin: PINNED_ORIGIN,
  directory: CARD_IMAGE_DIRECTORY,
  images: [...images]
    .sort((left, right) => (left.id < right.id ? -1 : 1))
    .map(({ id, fileName, source, sha256, byteLength }) => ({ id, fileName, source, sha256, byteLength }))
}, null, 2)}\n`;

/** Re-reads every stored file and reports anything that is missing, empty, or no longer the same. */
export const verifyMigratedCardImages = async ({ manifest, directory }) => {
  const output = resolve(directory);
  const problems = [];
  let verified = 0;

  for (const entry of [...manifest.images].sort((left, right) => (left.id < right.id ? -1 : 1))) {
    const stored = await readIfPresent(join(output, entry.fileName));
    if (stored === null) {
      problems.push(`${entry.id}: missing from ${directory}`);
    } else if (digest(stored) !== entry.sha256) {
      problems.push(`${entry.id}: digest no longer matches the manifest`);
    } else {
      verified += 1;
    }
  }
  return { verified, problems };
};

const isEntryPoint = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntryPoint) {
  const directory = join(repoRoot, CARD_IMAGE_DIRECTORY);
  const manifestPath = join(repoRoot, CARD_IMAGE_MANIFEST);
  const { OMENS_SET_SNAPSHOT } = await import("../packages/set-omens/src/set-snapshot.generated.ts");
  const plan = planCardImageMigration(OMENS_SET_SNAPSHOT);
  const previous = JSON.parse((await readIfPresent(manifestPath))?.toString("utf8") ?? "null");

  if (process.argv[2] === "--verify") {
    if (previous === null) { console.error("Card image verification failed: no manifest has been written yet"); process.exit(1); }
    const report = await verifyMigratedCardImages({ manifest: previous, directory });
    if (report.problems.length > 0) {
      console.error(`Card image verification failed for ${report.problems.length} of ${previous.images.length} images:`);
      for (const problem of report.problems) console.error(`  ${problem}`);
      process.exit(1);
    }
    console.log(`card image verification passed: ${report.verified} images`);
  } else {
    let copied = 0;
    const manifest = await migrateCardImages({ plan, directory, manifest: previous, onCopied: () => { copied += 1; } });
    await writeFile(manifestPath, buildCardImageManifest(manifest.images));
    const bytes = manifest.images.reduce((total, entry) => total + entry.byteLength, 0);
    const existing = new Set(await readdir(directory));
    const extra = [...existing].filter((name) => !manifest.images.some((entry) => entry.fileName === name));
    console.log(`card images copied: ${copied} fetched, ${manifest.images.length - copied} already held, ${manifest.images.length} total, ${bytes} bytes in ${CARD_IMAGE_DIRECTORY}`);
    if (extra.length > 0) console.log(`unreferenced files still in ${CARD_IMAGE_DIRECTORY}: ${extra.join(", ")}`);
  }
}
