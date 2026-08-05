# Web playable shell

## Fixture scope

`apps/web` is a dependency-free, playable static shell using unmistakably synthetic `Fixture A` through `Fixture I` card names only. It renders three deterministic, invented packs for each of two fixture seats. Selecting one native button records that card, removes the old pack, and advances; six selections complete the two-seat walkthrough. A reload resets it. It does not use card evidence, runtime collation, entropy, network access, authentication, or imports from another workspace.

## Interaction and accessibility contract

Cards are labelled native buttons, so mouse click and standard Enter/Space button activation choose a card. A captured pack index rejects stale and repeated activation. The picked pool is an ordered list. The live status names the current fixture pack and announces completion; completion moves focus to that status. Regions and lists have labels, keyboard focus has a high-contrast visible outline, the layout changes from a three-card desktop/tablet grid to one column on phones, and reduced-motion preferences disable animation and transition.

## Build ownership and evidence

`apps/web/index.html`, `apps/web/main.js`, and `apps/web/styles.css` are readable, structured source files. The dependency-free static build deterministically emits uncommitted `apps/web/dist` output: `index.html` with the application inlined and `styles.css` copied from its readable source.

```sh
npm --workspace @draft-table/web test
npm run build
node scripts/bundle-size.mjs
npm run size
```

The root size report measures only the completed `apps/web/dist/index.html` and `apps/web/dist/styles.css` artifacts; it reports their total and rejects missing built artifacts rather than reading committed source. The previously proposed 2,048-byte cap is superseded: optimizing for it caused accessibility and responsive-layout regressions, so it must not be reintroduced. The web contract checks deterministic repeated output, inline-only output, source readability, retained accessibility and responsive behavior, and cleanup; the root contract distinguishes built-output measurement from source measurement, permits deliberately large built output, and requires the expected artifacts.

## Integration owed

The unofficial and non-affiliation notice is permanent; fixture-only playability is temporary pending integration. The shell has no engine or `set-omens` integration. Replacing fixtures through a reviewed engine/`set-omens` runtime-facing boundary is later work. A future real-pack UI must show 14 visible cards and draw down 14/13/12/...; two rear markers are removed from the conceptual 16 before visibility, and future timers use the existing table. This is a future invariant, not fixture-shell implementation scope. Real card identities/images, draft authority, multiplayer state, entropy, persistence, and product treatment semantics remain out of scope.
