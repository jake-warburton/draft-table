# Web playable shell

## Fixture scope

`apps/web` is a dependency-free, playable static shell using unmistakably synthetic `Fixture A` through `Fixture I` card names only. It renders three deterministic, invented packs for each of two fixture seats. Selecting one native button records that card, removes the old pack, and advances; six selections complete the two-seat walkthrough. A reload resets it. It does not use card evidence, runtime collation, entropy, network access, authentication, or imports from another workspace.

## Interaction and accessibility contract

Cards are labelled native buttons, so mouse click and standard Enter/Space button activation choose a card. A captured pack index rejects stale and repeated activation. The picked pool is an ordered list. The live status names the current fixture pack and announces completion; completion moves focus to that status. Regions and lists have labels, keyboard focus has a high-contrast visible outline, the layout changes from a three-card desktop/tablet grid to one column on phones, and reduced-motion preferences disable animation and transition.

## Build ownership and evidence

`apps/web/index.html`, `apps/web/main.js`, and `apps/web/styles.css` are readable, structured source files. The exact-versioned, root dev-only `html-minifier-terser` build dependency minifies HTML, inline module JavaScript, and CSS deterministically into the uncommitted `apps/web/dist` output; it is absent from emitted client files and runtime graphs. The build emits only `index.html` and `styles.css`, with the application inlined into the former.

```sh
npm --workspace @draft-table/web test
npm run build
node scripts/bundle-size.mjs
npm run size
```

The root size report measures only the completed `apps/web/dist/index.html` and `apps/web/dist/styles.css` artifacts; it rejects missing built artifacts rather than reading committed source. Current readable source totals **3,347 bytes** (`index.html` 999, `main.js` 1,768, `styles.css` 580). Current minified built output totals **2,043 bytes** (`index.html` 1,591, `styles.css` 452). The web contract checks deterministic repeated output, inline-only minification, source readability, and cleanup; the root contract distinguishes built-output measurement from source measurement and requires the expected artifacts.

## Integration owed

The unofficial and non-affiliation notice is permanent; fixture-only playability is temporary pending integration. The shell has no engine or `set-omens` integration. Replacing fixtures through a reviewed engine/`set-omens` runtime-facing boundary is later work. Real packs, card identities/images, draft authority, multiplayer state, entropy, persistence, and product treatment semantics remain out of scope. The future real draft UI must show exactly 14 visible cards for the active pack, keep both opaque removed-rear markers absent and unpickable, and expose the authoritative pick timer with text and progress semantics.
