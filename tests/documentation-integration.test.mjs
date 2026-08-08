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
  assert.match(readme, /single-player draft client dealing \*\*real Omens cards\*\*[\s\S]*reviewed set snapshot[\s\S]*no image bytes and no upstream bytes are copied into this repository/);
  assert.match(readme, /pinned to that single origin by the page's content security policy[\s\S]*no referrer[\s\S]*replaced by the card's name if it fails/);
  assert.match(readme, /browser owns entropy through `crypto\.getRandomValues`/);
  assert.match(readme, /## Reviewed set snapshot[\s\S]*209 draftable identities[\s\S]*228 weighted 14-position layouts totalling 460,800/);
  assert.match(readme, /## Reading your drafted pool[\s\S]*Set number\*\*, \*\*Class\*\*, \*\*Colour\*\*, and \*\*Type[\s\S]*collector order inside every group/);
  assert.match(readme, /three rows of five, five, and four[\s\S]*shows only its top tenth[\s\S]*newest card sits on top of the pile in full/);
  assert.match(readme, /Pool hidden until the next review\*\*, and the cards are genuinely absent[\s\S]*Pack 1 review\*? or \*?Pack 2 review\*? heading[\s\S]*next pack waits until you continue/);
  assert.match(readme, /one-minute review timer[\s\S]*waits for multiplayer rooms/);
  assert.match(readme, /the validator derives each identity's `cardType` and `cardClass` from those tokens/);
  assert.match(readme, /## Handing your pool to Fabrary[\s\S]*pre-filled import link[\s\S]*copyable text list/);
  assert.match(readme, /The fallback is not optional[\s\S]*sign-in wall[\s\S]*DT-7/);
  assert.match(readme, /never calls Fabrary's private authenticated endpoints/);
  assert.match(readme, /## Room codes[\s\S]*eight Crockford-Base32 symbols[\s\S]*forty random bits/);
  assert.match(readme, /a refusal never echoes the rejected text/);
  assert.match(readme, /invite link[\s\S]*`\?join=<code>`[\s\S]*never enters the link/);
  assert.match(readme, /## Room routes[\s\S]*`POST \/api\/rooms`[\s\S]*`GET \/api\/rooms\/<code>\/socket` with `Upgrade: websocket`/);
  assert.match(readme, /a bad request forwarded to an object spends two of the day's requests instead of one/);
  assert.match(readme, /an upgrade does not survive being rebuilt/);
  assert.match(readme, /Not there yet: the room's sockets and lobby, the per-room and per-network rate limits[\s\S]*does not yet refuse repeated traffic/);
  assert.match(readme, /## The room object[\s\S]*Initialize happens exactly once[\s\S]*one-time \*\*host claim\*\*[\s\S]*leaving no room behind/);
  assert.match(readme, /stored only as salted digests[\s\S]*leaves the object exactly once/);
  assert.match(readme, /deleted whole[\s\S]*at-least-once[\s\S]*early wake rebooks the appointment/);
  assert.match(readme, /A socket is nobody until its hello[\s\S]*wrong and missing passwords answer identically[\s\S]*newest connection for an identity wins/);
  assert.match(readme, /eight numbered seats first and then the spectator row, up to sixteen participants/);
  assert.match(readme, /every handler runs whole inside the object's concurrency gate[\s\S]*host claim cannot be double-spent/);
  assert.match(readme, /standing liveness sweep[\s\S]*cannot leak forever on a swallowed goodbye/);
  assert.match(readme, /The lobby answers its commands[\s\S]*first manual move visibly spends the pending shuffle[\s\S]*deleted on the spot/);
  assert.match(readme, /The draft itself runs inside the room[\s\S]*whole future is decided and persisted before anyone hears it began[\s\S]*queued identity never enters a broadcast/);
  assert.match(readme, /official judge schedule by pack size[\s\S]*a floor no replacement can extend[\s\S]*timeout resolution, not a bot/);
  assert.match(readme, /Disconnection never vacates a seat[\s\S]*finds its pack waiting where it left it/);
  assert.match(readme, /## Talking to a room[\s\S]*answers, not accidents[\s\S]*solo table stands down[\s\S]*very same table/);
  assert.match(readme, /host arranges the table by hand[\s\S]*picker beside each name[\s\S]*same moves without a mouse/);
  assert.match(readme, /connections to 'self' and nowhere else/);
  assert.match(readme, /## Deploying[\s\S]*wrangler\.jsonc[\s\S]*Nothing in this repository deploys on its own/);
  assert.match(readme, /## One screen at a time[\s\S]*three screens, not one long scroll[\s\S]*finished draft turns the page to the results/);
  assert.match(readme, /## Reviewed set snapshot[\s\S]*neither CI nor the browser needs the captain-held recipe/);
  assert.match(readme, /set snapshot acceptance passed[\s\S]*compares byte for byte with the committed snapshot/);
  assert.match(readme, /completed `apps\/web\/dist` bytes[\s\S]*no client byte ceiling[\s\S]*size gate[\s\S]*accessibility and responsive declarations/);
});

test("shared evidence authorities preserve the accepted exact heads", () => {
  const collation = read("docs/rules-and-collation.md");
  assert.match(collation, /PR 63[\s\S]*4dbef5dd63c7e655f2cf9b4674d4238b0f1cac4b/);
  assert.match(collation, /PR 66[\s\S]*aa825b18b5c455d253af9c0c45842b0b21a4d4bd[\s\S]*captain comment plus merge/);
});
