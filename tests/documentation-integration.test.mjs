import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const retiredStreamNotes = [
  "docs/streams/card-presentation.md",
  "docs/streams/draft-runtime.md",
  "docs/streams/entropy-and-retry.md",
  "docs/streams/pack-construction.md",
  "docs/streams/web-playable-shell.md"
];

const markdownDocuments = [
  "AGENTS.md",
  "README.md",
  ...readdirSync(new URL("../docs", import.meta.url), { recursive: true })
    .filter((path) => path.endsWith(".md"))
    .map((path) => `docs/${path}`)
];

const permanentNotice = `## Unofficial product notice

Draft Table is in no way affiliated with Legend Story Studios. Legend Story Studios®, Flesh and Blood™, and set names are trademarks of Legend Story Studios. Flesh and Blood characters, cards, logos, and art are property of Legend Story Studios. Card images are © Legend Story Studios.`;

test("shared documentation replaces all five retired stream notes without references to them", () => {
  for (const path of retiredStreamNotes) {
    assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), false, `${path} must be removed`);
  }

  for (const path of markdownDocuments) {
    const document = read(path);
    for (const retired of retiredStreamNotes) {
      assert.doesNotMatch(document, new RegExp(retired.replace("docs/", "(?:docs/)?").replace(".", "\\.")));
    }
  }
});

test("the permanent README notice and integrated product contracts remain explicit", () => {
  const readme = read("README.md");
  assert.ok(readme.includes(permanentNotice));
  assert.match(readme, /conceptual physical booster remains 16 positions[\s\S]*complete 14-card recipe layout[\s\S]*two opaque rear markers[\s\S]*Visible packs always start at \*\*14\*\*/);
  assert.match(readme, /finite caller-provided batches[\s\S]*no entropy ownership/);
  assert.match(readme, /Same official identities may legally occur in normal and Rainbow Foil positions/);
  assert.match(readme, /replay-only[\s\S]*non-cryptographic[\s\S]*Production source custody, stream separation, and any cryptographic source remain a later architecture decision/);
  assert.match(readme, /fixture-only playable shell/);
  assert.match(readme, /completed `apps\/web\/dist` bytes[\s\S]*no client byte ceiling[\s\S]*size gate[\s\S]*accessibility and responsive declarations/);
});

test("shared evidence authorities preserve the accepted exact heads", () => {
  const collation = read("docs/rules-and-collation.md");
  assert.match(collation, /PR 63[\s\S]*4dbef5dd63c7e655f2cf9b4674d4238b0f1cac4b/);
  assert.match(collation, /PR 66[\s\S]*aa825b18b5c455d253af9c0c45842b0b21a4d4bd[\s\S]*captain comment plus merge/);
});
