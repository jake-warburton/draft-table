# Security and privacy boundaries

External citation IDs resolve in the [research source register](research.md#source-register).

## Security goals

- Server owns picks, deadlines, packs, passing, seats, roles, randomness, and expiry.
- Clients receive only the projection authorized for their current role/POV.
- Invitation passwords never enter HTTP request paths/queries, application logs, analytics, or status events; browser identity credentials never enter URLs or those outputs.
- No account/profile database and no room data retained beyond its lifecycle.
- Clear unofficial/non-affiliation presentation and compliant image attribution [FAB-6].

## Explicitly deferred

Strong anti-cheat against a determined user controlling their browser is not an MVP guarantee. A spectator is intentionally authorized to view any one player POV and can record it. Collusion, screenshots, multiple devices, browser automation, and out-of-band communication cannot be prevented. This does not justify broadcasting canonical hidden state: other packs, queued selections, credentials, password verifiers, and RNG state remain server-only.

## Identity and host capability

- Generate at least 256 random bits server-side for an identity credential; store only a verifier in room state.
- Store the returned credential in first-party browser storage. It is a bearer secret: XSS, malicious extensions, profile sync, shared OS accounts, or copied storage can steal it.
- Newest connection for the same credential supersedes older sockets to avoid concurrent control.
- Host capability is bound permanently to the creator participant ID; no transfer/recovery/election.
- Never encode host/seat authority only in client state. Every command rechecks canonical participant/phase.
- On host disconnect, do not delegate controls.

## Passwords and invitation links

### Transport and storage

The room password is a casual access gate, not account-grade authentication. The browser reads `#password=<encoded>` locally and sends the value only in the first WSS message over TLS. It is absent from HTTP path/query, request logs, and Referrer headers. Remove it from the visible address with `history.replaceState` after reading.

Store a salted verifier protected with a deployment secret and compare in constant time. Do not log plaintext/verifier. A memory-hard server KDF may not fit the 10 ms Free CPU budget [CF-1]; do not claim offline-brute-force resistance without a measured design. Add per-room/per-network-prefix bounded attempt throttling and generic wrong-password errors.

### Fragment threat limits

A fragment reduces accidental HTTP/referrer disclosure but is still visible to:

- the recipient and anyone they forward it to;
- clipboard managers, browser history/session restore/sync, screenshots, screen sharing, and shoulder surfing;
- browser extensions and any same-page script;
- malicious code introduced by XSS/dependencies.

Draft Table should ship no third-party analytics/ad scripts, use strict CSP, and retain fragment plaintext only in memory. `Copy link + password` should require re-entry after a reload rather than persisting plaintext merely for convenience.

## Room codes and abuse

An eight-character 40-bit random code is unlisted, not authorization. Atomically check collision. Apply conservative creation/join/password/message rate limits, protocol size caps, and participant cap. Do not reveal whether a password-protected room exists differently enough to enable cheap enumeration where practical. Free-tier exhaustion is an availability risk; stop new room creation before existing rooms.

No user-generated rich text. Validate display/room names by Unicode-aware length, strip controls, render only as text, and avoid HTML/Markdown. Status events are enumerated structured data, eliminating chat/spam links.

## Message validation and replay

- JSON only, strict protocol/version/type validation, recommended 16 KiB command cap.
- Validate phase, role, participant, seat, pack membership, and finite/bounded values on every command.
- Bounded command IDs provide idempotency; stale state produces resync/error, never blind application.
- Alarm generation and phase ID make at-least-once alarm delivery safe [CF-7].
- Use unbiased server randomness; client never supplies seed/index.
- Close on repeated malformed/unauthorized traffic with stable non-secret codes.

## Hidden-state projections

Construct a fresh projection per authorization class:

- public room/seat/config/phase/feed;
- owning drafter private pack/pool/own queued ID;
- spectator selected POV pack/pool without queued ID;
- host capabilities but no extra hidden cards.

Never send the canonical state and hide it with CSS. Automated tests inspect WebSocket frames, serialized snapshots, DOM, logs, and error payloads for forbidden IDs. Cache only public serialized fragments; private projection cache keys include participant, POV, phase, and state version.

## Web platform headers

Plan for:

- HTTPS/WSS only; HSTS on custom domain.
- CSP with first-party scripts/styles and explicit LSS image host; no `unsafe-eval`; minimize inline allowances.
- `Referrer-Policy: no-referrer` to reduce image/Fabrary leakage.
- `X-Content-Type-Options: nosniff`.
- restrictive `Permissions-Policy`.
- frame denial (`frame-ancestors 'none'`) unless a reviewed embedding use appears.
- same-origin API; explicit Origin validation on WebSocket upgrade to reduce cross-site socket hijacking.
- no CORS wildcard on mutation/room endpoints.

The password first message must not receive room data before verification.

## Remote images and external navigation

Official images load directly from LSS S3 [DATA-1]. LSS sees a normal browser request including IP and user-agent; disclose this briefly in privacy copy. Use no-referrer, lazy loading, fixed dimensions, safe decoding, and a fallback. Do not accept arbitrary image URLs from room participants.

Fabrary is contacted only after an explicit completion action. Query parameters contain public card identifiers and a user-visible deck name, not room code, participant identity, password, or internal instance IDs. Open external pages with safe opener isolation.

## Data inventory and retention

| Data | Purpose | Location | Retention |
|---|---|---|---|
| Display/room names | Room UX | Room SQLite snapshot + client | Until room deletion |
| Identity verifier | Reconnect/host/seat auth | Room snapshot | Until room deletion |
| Browser credential | Reconnect bearer | First-party browser only | User clears site data or room expiry cleanup hint |
| Password verifier/salt | Optional access | Room snapshot | Until room deletion |
| Pools/packs/queues/RNG state | Authoritative draft | Room snapshot | Until room deletion |
| Status feed | Material room events | Bounded room snapshot | Until room deletion |
| WebSocket attachment | Connection identity/POV | Cloudflare socket attachment | Socket close/room deletion |
| IP/platform metadata | Network/abuse/Cloudflare operation | Cloudflare transient/logs | Minimize; configure/document separately before launch |

No email, payment, account, chat, contacts, precise location, analytics profile, or replay log. Completed rooms delete at one hour. Explicit all-left rooms delete immediately. DT-3 must prevent never-started/paused disconnected storage from persisting indefinitely.

## Logging

Allowed: room code hash, protocol version, command type, safe error code, state version, phase, latency/CPU/size/quota counters. Forbidden: password/fragment/verifier, identity credential, display-name plus IP correlation, canonical packs/pools, queued card ID, seed/RNG state, Fabrary export contents. Redact at the logging API rather than relying on callers.

## LSS and public-repository boundary

Use the exact third-party-app disclaimer required by current LSS terms and `© Legend Story Studios` by card images/footer [FAB-6]. No FAB/LSS/set logos, copied product backgrounds, or trade dress. The terms are revocable and disallow commercial-entity third-party apps; free/open source does not eliminate that risk. DT-2 is a launch gate.

## Threat-focused acceptance cases

- URL fragment absent from HTTP/WS upgrade URL, Referrer, logs, error reporting, and Fabrary link.
- Wrong-password response includes no room membership/state and is throttled.
- Forged host/seat/commit/deadline/POV commands fail without mutation.
- Other drafter's queued ID absent from every non-owner frame and DOM.
- Spectator can obtain only the requested authorized POV projection, not canonical all-packs state.
- Duplicate/replayed command and alarm do not double-award.
- XSS probes in every name render inert text.
- Replaced/removed identity loses seat authority immediately.
- Old socket loses authority after same credential reconnects.
- Cleanup deletes snapshot/feed/verifiers and late alarms cannot resurrect the room.
