# Product and MVP specification

External citation IDs in this document resolve in the [research source register](research.md#source-register).

## Product statement

Draft Table is an unlisted-room browser tool for running an authentic, server-authoritative Flesh and Blood booster draft without accounts, bots, chat, or a built-in deckbuilder. It is a public repository and must remain practical to self-host permanently for $0 on the current Cloudflare free tier.

This document is a product contract, not an implementation. No application code exists yet.

## MVP outcomes

A successful MVP lets a host:

1. Create an unlisted Omens of the Third Age room, optionally password-protected.
2. Arrange 2–8 human drafters and up to 16 total participants.
3. Run three authentic boosters per drafting seat with official left/right/left passing, official called-draft timing by default, provisional picks, pauses, and inter-pack reviews.
4. Allow spectators to join during the draft, switch player point of view, and inspect the chosen player's current pack and complete pool.
5. Finish with a pre-populated Fabrary import when the current public deep link still works, or a reliable copyable text-list fallback.

## Supported environment

- Primary: desktop browsers and tablets.
- Secondary: phones; core actions must work, but dense eight-seat and large-card-grid layouts may be less convenient.
- Browser target: current evergreen Safari, Chrome, Firefox, and Edge.
- Input target: pointer, touch, and keyboard. Draft cards and controls are reachable by Tab; Enter queues the focused card.
- Accessibility target: semantic HTML, useful screen-reader names and announcements, reduced-motion support, no colour-only state, and a high Lighthouse score.

## Room configuration

The permanent creator/host controls:

| Option | Contract |
|---|---|
| Room name | Short plain text; no rich text. |
| Set | Selector may be visible, but Omens of the Third Age is the only enabled MVP value. |
| Password | Optional. Never placed in the URL query/path; `Copy link + password` uses the fragment. |
| Timers | On by default, using the official judge schedule [FAB-2]. |
| Pool visibility | When hidden, drafters see prior picks only in the one-minute reviews; spectators always see their selected POV's pool. |
| Spectators | Host may disallow them. The host still occupies one of the 16 participant identities. |
| Seat randomization | Enabled by default immediately before start. A host seat edit visibly disables pending auto-randomization; the host can re-enable it or explicitly randomize now. This interpretation needs captain confirmation (DT-4). |

Room limit is 16 simultaneous participant identities, of which at most eight are drafting seats. A host can be a drafter or spectator.

## Identity, invitation, and host rules

- No accounts. A temporary display name is generated and the join flow prompts for an override.
- A browser receives a high-entropy local identity credential. The same browser profile reclaims its identity and seat after reconnecting.
- A new browser is a new identity. During a draft it joins as a spectator, if allowed, and only the host can place it into a vacated draft seat.
- The room creator remains host permanently. There is no transfer, election, or recovery key.
- If the host disconnects, the draft process remains server-owned and host controls are unavailable until that identity reconnects.
- `Copy link` omits the password. `Copy link + password` encodes it in a URL fragment. The client reads it locally, authenticates over TLS, then removes it from the address bar. Threat limits are in [security.md](security-and-privacy.md#passwords-and-invitation-links).

## Seating contract

### Before start

- The host sees exactly eight numbered, draggable seat cards. Empty positions render as cutout placeholders.
- A separate row contains spectator cards.
- Dragging to an empty seat moves a participant; dragging onto an occupied seat swaps them; dragging between seats and spectators is allowed.
- Every drag operation has a keyboard equivalent: a `Move` action opens a destination list and announces move/swap results.
- Starting requires 2–8 occupied seat positions. Only occupied positions become the initial circular draft ring; unused lobby positions are skipped and receive no packs.
- Seat order randomizes just before pack generation while auto-randomization remains enabled.

### After start

- The draft ring and its order are immutable.
- Disconnecting does not vacate a seat.
- The host may remove any non-host occupant, leaving that existing draft seat empty. The permanent host cannot be removed. The seat's pool, pack, and pack pipeline stay attached.
- The host may move a spectator into a vacated draft seat. The participant inherits that seat's complete pool, current pack, and future packs.
- Whether removal clears or retains an existing queued pick is an unresolved implementation gate (DT-6). If retained, its card identity remains hidden from the replacement, who may replace it. Post-start removal/fill must not ship until the captain chooses a policy.
- Empty or disconnected draft seats use the same deadline random fallback as any seat with no queued selection. This is timeout resolution, not a bot.
- The host cannot create a new drafting seat from one of the unused lobby positions after start.

## Draft experience

- Three packs are generated for every initial draft seat. Physical boosters are generated as 16 cards, then their rear two cards are removed unseen and without replacement [FAB-3][FAB-4].
- Visible packs begin with 14 cards and pass left, right, left [FAB-1][FAB-2].
- A player sees their current pack, their own queued selection, public queued/not-queued status for seats, and their pool only when the option permits.
- Clicking/tapping or pressing Enter on a card queues it provisionally. Selecting another replaces it. There is no explicit unqueue command.
- No other participant, including a spectator watching that POV, receives the selected card identity. They see only `has queued`.
- At a deadline, the server commits the queued card or uniformly selects a random remaining card if none is queued, regardless of connection state.
- The final single card in a pack is assigned automatically; the official schedule gives it no pick interval [FAB-2].
- With timers on, when all readiness-eligible humans have queued and more than five seconds remain, the deadline is shortened once to five seconds from that moment. Picks remain replaceable.
- With timers off, there is no pick deadline until all readiness-eligible humans have queued; that starts the same five-second confirmation. Empty/disconnected-seat readiness is a captain decision (DT-5); the recommended rule excludes them from readiness and random-fills them at confirmation.
- Host pause freezes any pick/review deadline. Queues may still be changed while paused. Resume reconstructs the remaining duration and then applies any five-second acceleration condition.
- Reviews between packs 1–2 and 2–3 last one minute [FAB-2]. They occur even if pick timers are disabled.
- The timer trends continuously from white to red by elapsed percentage and also exposes text/icon/progress semantics.

## Spectators

- May join/leave mid-draft when allowed, without changing the draft ring.
- Select a player POV live.
- Receive that seat's current pack and complete pool, even when pool hiding applies to the drafter.
- Never receive its queued card identity.
- Do not consume packs and cannot queue picks or use host controls unless the spectator is also the host.
- Mid-draft joining does not materially complicate the recommended one-room/one-Durable-Object architecture; its main effects are one WebSocket connection, one projected snapshot, and outgoing broadcasts. See [architecture.md](architecture.md#per-room-budget).

## Completion

- A completed room remains available for one hour, then all room storage is deleted and sockets are closed.
- `Create in Fabrary` opens the current public import deep link with repeated card identifiers, `format=Draft`, and a pool name. It pre-populates an import form; it does not bypass Fabrary sign-in or hero selection [FABR-1][FABR-2].
- The fallback copies a Fabrary-accepted text list and opens `https://fabrary.net/decks?tab=import`.
- There is no internal deck construction, legality solver, or gameplay.

## Status feed

Visible to everyone and limited to material events: join, explicit leave, disconnect/reconnect, start, pause/resume, seat changes/removal/fill, intermission, and completion. It omits routine picks, queued card identities, and chat. Keep a bounded recent history rather than an audit/replay log.

## Non-goals

No accounts, bots, general chat, matchmaking, rankings, tournaments, replay system, anti-collusion guarantees, internal deckbuilder, game simulator, paid service, app-store/native mobile app, or multiple-set implementation. Strong secrecy against a determined user modifying their browser is deferred, but server authority and role-projected data are not.
