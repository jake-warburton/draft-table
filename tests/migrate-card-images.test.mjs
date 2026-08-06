import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  CARD_IMAGE_DIRECTORY,
  CardImageMigrationError,
  buildCardImageManifest,
  migrateCardImages,
  planCardImageMigration,
  verifyCardImageResponse,
  verifyMigratedCardImages
} from "../scripts/migrate-card-images.mjs";
import { OMENS_SET_SNAPSHOT } from "../packages/set-omens/src/set-snapshot.generated.ts";

/** A real minimal WebP: the RIFF container the migration insists on before storing any bytes. */
const webp = (payload) => {
  const body = Buffer.concat([Buffer.from("WEBPVP8 "), Buffer.from(payload)]);
  const header = Buffer.alloc(8);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
};

const digestOf = (bytes) => createHash("sha256").update(bytes).digest("hex");

const workspace = (t) => {
  const directory = mkdtempSync(join(tmpdir(), "draft-table-card-images-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
};

const respond = (bytes) => ({ status: 200, contentType: "image/webp", bytes });

/** A tiny stand-in snapshot; the migration must never invent a source of its own. */
const snapshotOf = (...ids) => ({
  identities: ids.map((id) => ({
    id,
    name: `Card ${id}`,
    pitch: 1,
    rarity: "common",
    image: `https://legendstory-production-s3-public.s3.amazonaws.com/media/cards/normal/${id}.webp`
  }))
});

test("the plan copies exactly the images the reviewed snapshot already names", () => {
  const plan = planCardImageMigration(OMENS_SET_SNAPSHOT);

  assert.equal(plan.length, OMENS_SET_SNAPSHOT.identities.length);
  assert.equal(plan.length, 209);
  for (const entry of plan) {
    const identity = OMENS_SET_SNAPSHOT.identities.find(({ id }) => id === entry.id);
    assert.equal(entry.source, identity.image, "the migration invents no URL of its own");
    assert.equal(entry.fileName, `${entry.id}.webp`);
  }
  assert.equal(new Set(plan.map(({ fileName }) => fileName)).size, plan.length, "one file per identity");
});

test("the plan refuses a source that is not on the pinned official origin", () => {
  const hostile = snapshotOf("OMN001");
  hostile.identities[0].image = "https://cards.example.test/media/cards/normal/OMN001.webp";

  assert.throws(() => planCardImageMigration(hostile), CardImageMigrationError);
});

test("the plan refuses an identifier that could escape the output directory", () => {
  for (const id of ["../OMN001", "OMN/001", "OMN001/../../etc", ""]) {
    const hostile = snapshotOf("OMN001");
    hostile.identities[0].id = id;
    assert.throws(() => planCardImageMigration(hostile), CardImageMigrationError, id);
  }
});

test("only a real WebP body served as one is ever stored", () => {
  const bytes = webp("art");
  assert.equal(verifyCardImageResponse("OMN001", respond(bytes)).byteLength, bytes.length);

  const rejects = (response, reason) =>
    assert.throws(() => verifyCardImageResponse("OMN001", response), CardImageMigrationError, reason);

  rejects({ ...respond(bytes), status: 404 }, "a missing image");
  rejects({ ...respond(bytes), status: 302 }, "a redirect the caller did not follow");
  rejects({ ...respond(bytes), contentType: "text/html" }, "an error page served as art");
  rejects({ ...respond(bytes), contentType: "image/svg+xml" }, "a scriptable image format");
  rejects(respond(Buffer.from("<!doctype html><title>Denied</title>")), "a body that is not a WebP");
  rejects(respond(Buffer.alloc(0)), "an empty body");
  rejects(respond(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("PNG ")])), "another RIFF format");
});

test("a whole migration writes every image once and records what it stored", async (t) => {
  const directory = workspace(t);
  const bodies = new Map([["OMN001", webp("one")], ["OMN002", webp("two")]]);
  const requested = [];

  const manifest = await migrateCardImages({
    plan: planCardImageMigration(snapshotOf("OMN001", "OMN002")),
    directory,
    fetchImage: async ({ source, id }) => { requested.push(source); return respond(bodies.get(id)); }
  });

  assert.deepEqual(readdirSync(directory).sort(), ["OMN001.webp", "OMN002.webp"]);
  assert.equal(requested.length, 2);
  assert.deepEqual(manifest.images.map(({ id }) => id), ["OMN001", "OMN002"], "the manifest is in a stable order");
  for (const entry of manifest.images) {
    const stored = readFileSync(join(directory, entry.fileName));
    assert.equal(entry.sha256, digestOf(stored));
    assert.equal(entry.byteLength, stored.length);
    assert.equal(entry.source, `https://legendstory-production-s3-public.s3.amazonaws.com/media/cards/normal/${entry.id}.webp`);
  }
  assert.equal(manifest.images.length, 2);
});

test("the manifest holds no image byte of its own", async (t) => {
  const directory = workspace(t);
  const manifest = await migrateCardImages({
    plan: planCardImageMigration(snapshotOf("OMN001")),
    directory,
    fetchImage: async () => respond(webp("art"))
  });

  const serialized = JSON.stringify(manifest);
  assert.doesNotMatch(serialized, /RIFF|WEBP|base64|data:image/, "a manifest records digests, never content");
  assert.ok(serialized.length < 4096);
});

test("a second run refetches nothing it already holds intact", async (t) => {
  const directory = workspace(t);
  const plan = planCardImageMigration(snapshotOf("OMN001", "OMN002"));
  const bodies = new Map([["OMN001", webp("one")], ["OMN002", webp("two")]]);
  const fetched = [];
  const fetchImage = async ({ id }) => { fetched.push(id); return respond(bodies.get(id)); };

  const first = await migrateCardImages({ plan, directory, fetchImage });
  const second = await migrateCardImages({ plan, directory, fetchImage, manifest: first });

  assert.deepEqual(fetched, ["OMN001", "OMN002"], "an intact local copy is never requested again");
  assert.deepEqual(second.images, first.images, "resuming reproduces the same manifest");
});

test("a local file that no longer matches its digest stops the migration", async (t) => {
  const directory = workspace(t);
  const plan = planCardImageMigration(snapshotOf("OMN001"));
  const first = await migrateCardImages({ plan, directory, fetchImage: async () => respond(webp("art")) });
  writeFileSync(join(directory, "OMN001.webp"), webp("tampered"));

  await assert.rejects(
    () => migrateCardImages({ plan, directory, fetchImage: async () => respond(webp("art")), manifest: first }),
    CardImageMigrationError,
    "a changed local file is never silently overwritten"
  );
});

test("the migration keeps its own request rate bounded", async (t) => {
  const directory = workspace(t);
  const ids = Array.from({ length: 12 }, (unused, index) => `OMN${String(index + 1).padStart(3, "0")}`);
  let inFlight = 0;
  let peak = 0;

  await migrateCardImages({
    plan: planCardImageMigration(snapshotOf(...ids)),
    directory,
    concurrency: 3,
    fetchImage: async ({ id }) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return respond(webp(id));
    }
  });

  assert.ok(peak <= 3, `never more than three requests at once, saw ${peak}`);
  assert.ok(peak > 1, "the bound is a limit rather than a single-file crawl");
});

test("one failed image fails the whole migration rather than shipping a gap", async (t) => {
  const directory = workspace(t);
  await assert.rejects(
    () => migrateCardImages({
      plan: planCardImageMigration(snapshotOf("OMN001", "OMN002")),
      directory,
      fetchImage: async ({ id }) => (id === "OMN002" ? { status: 500, contentType: "text/plain", bytes: Buffer.from("no") } : respond(webp("one")))
    }),
    CardImageMigrationError
  );
});

test("verification re-reads the stored bytes and names anything that drifted", async (t) => {
  const directory = workspace(t);
  const plan = planCardImageMigration(snapshotOf("OMN001", "OMN002"));
  const manifest = await migrateCardImages({ plan, directory, fetchImage: async ({ id }) => respond(webp(id)) });

  assert.deepEqual(await verifyMigratedCardImages({ manifest, directory }), { verified: 2, problems: [] });

  writeFileSync(join(directory, "OMN002.webp"), webp("different"));
  rmSync(join(directory, "OMN001.webp"));
  const report = await verifyMigratedCardImages({ manifest, directory });

  assert.equal(report.verified, 0);
  assert.equal(report.problems.length, 2);
  assert.match(report.problems.join("\n"), /OMN001[\s\S]*missing/i);
  assert.match(report.problems.join("\n"), /OMN002[\s\S]*digest/i);
});

test("the manifest a build writes is byte-for-byte stable", async (t) => {
  const directory = workspace(t);
  const plan = planCardImageMigration(snapshotOf("OMN002", "OMN001"));
  const manifest = await migrateCardImages({ plan, directory, fetchImage: async ({ id }) => respond(webp(id)) });

  assert.equal(buildCardImageManifest(manifest.images), buildCardImageManifest([...manifest.images].reverse()));
  assert.match(buildCardImageManifest(manifest.images), /\n$/, "a generated file ends with a newline");
});

test("the copied images stay out of version control", () => {
  const ignored = readFileSync(new URL("../.gitignore", import.meta.url), "utf8");
  assert.ok(ignored.split("\n").includes(`${CARD_IMAGE_DIRECTORY}/`), "copied card art is never committed");
});
