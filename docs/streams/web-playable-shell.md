# Web playable shell

## Fixture scope

`apps/web` is a dependency-free, playable static shell using unmistakably synthetic `Fixture A` through `Fixture I` card names only. It renders three deterministic, invented packs for each of two fixture seats. Selecting one native button records that card, removes the old pack, and advances; six selections complete the two-seat walkthrough. A reload resets it. It does not use card evidence, runtime collation, entropy, network access, authentication, or imports from another workspace.

## Interaction and accessibility contract

Cards are labelled native buttons, so mouse click and standard Enter/Space button activation choose a card. A captured pack index rejects stale and repeated activation. The picked pool is an ordered list. The live status names the current fixture pack and announces completion; completion moves focus to that status. Regions and lists have labels, keyboard focus has a high-contrast visible outline, the layout changes from a three-card desktop/tablet grid to one column on phones, and reduced-motion preferences disable animation and transition.

## Commands and evidence

```sh
npm --workspace @draft-table/web test
npm run build
npm run size
```

The web contract test checks initial render, click and keyboard activation, reload reset, removal/recording, the two-seat three-pack progression, stale/double rejection, completion/focus, labels/status/focus styling, reduced motion, deterministic output, no network calls, no app imports, and inline-only output. The emitted client is **1,977 bytes** against the root 2,048-byte ceiling (71 bytes spare); the build emits `index.html` and `styles.css` only.

## Integration owed

The shell has no engine or `set-omens` integration. Replacing fixtures through a reviewed engine/`set-omens` runtime-facing boundary is later work. Real packs, card identities/images, draft authority, multiplayer state, entropy, persistence, and product treatment semantics remain out of scope.
