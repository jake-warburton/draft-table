# Draft Table

Draft Table is a planned public, free-to-host multiplayer draft simulator for Flesh and Blood. The MVP is scoped to **Omens of the Third Age**, with 2–8 human drafters and up to 16 total room participants including spectators.

> **Status: walking skeleton implementation begun.** Phase 2 checksum verification plus strict Settings-envelope and CustomCards-schema parsing exist for the captain-approved community Omens recipe; aggregate fixtures, source reconciliation, layouts, pools, import, and snapshots remain unimplemented. The repository otherwise contains only a neutral browser shell and workspace boundaries. Draft behavior, rooms, networking, deployment, Fabrary integration, and product UI have not begun.

## Walking skeleton setup

Requires Node.js 22.6+ and npm 10+.

```sh
npm install
npm run build
npm run typecheck
npm run lint
npm test
npm run size
```

Pull requests and pushes to `main` install with `npm ci` and run every quality command listed above. `npm run size` enforces a 2,048-byte total emitted-client ceiling; the server boundary is not emitted yet and reports as zero bytes.

Open `apps/web/dist/index.html` in a browser after `npm run build`. The page is an accessible, plain-HTML Draft Table scaffold; no playable draft behavior exists yet.

## Planning documents

- [Product and MVP specification](docs/product.md)
- [Verified draft rules and booster collation](docs/rules-and-collation.md)
- [Source, card-data, Fabrary, and platform research](docs/research.md)
- [UX flows and accessibility](docs/ux-and-accessibility.md)
- [Domain and data model](docs/domain-model.md)
- [Room state machine and realtime protocol](docs/room-state-and-protocol.md)
- [Cloudflare architecture and free-tier budget](docs/architecture.md)
- [Security and privacy boundaries](docs/security-and-privacy.md)
- [TDD strategy and test matrix](docs/testing.md)
- [Phased implementation plan](docs/implementation-plan.md)
- [Accepted decisions, external unknowns, and risks](docs/risks-and-decisions.md)

## Unofficial product notice

Draft Table is in no way affiliated with Legend Story Studios. Legend Story Studios®, Flesh and Blood™, and set names are trademarks of Legend Story Studios. Flesh and Blood characters, cards, logos, and art are property of Legend Story Studios. Card images are © Legend Story Studios.

The product must not use Flesh and Blood or Legend Story Studios logos, set logos, or imitated trade dress. The official asset terms are summarized and cited in [the research](docs/research.md#legend-story-studios-image-and-app-terms).

## License

Draft Table's own software is licensed under the [MIT License](LICENSE). Third-party card data, images, names, trademarks, and other Legend Story Studios property are not relicensed by that file and remain subject to their respective terms.
