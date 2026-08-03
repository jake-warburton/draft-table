# Cloudflare architecture and free-tier budget

External citation IDs resolve in the [research source register](research.md#source-register). Limits were checked 2026-08-03 and must be rechecked before implementation/release.

## Recommendation: one deployment, one room object

```text
Browser
  ├─ static HTML/CSS/JS/data ───────────────┐
  └─ HTTPS + hibernating WebSocket ───────┐ │
                                           ▼ ▼
                              Cloudflare Worker + Static Assets
                                           │ room code → object name
                                           ▼
                              SQLite Durable Object (one per room)
                              ├─ canonical room snapshot
                              ├─ one next-deadline alarm
                              └─ up to 16 hibernatable sockets

Official card images: browser ──direct──> LSS public S3
Fabrary: explicit completion action ───> public import UI
```

Use a single Worker project to serve static assets and implement small HTTP/WebSocket routes. Avoid Pages because Workers Static Assets are free/unlimited, store assets without extra charge, and remove an unnecessary deployment surface [CF-2]. Pages would also work (500 builds/month, 20,000 files, 25 MiB/file), but Pages Functions consume Workers quotas and offer no MVP advantage [CF-3].

Use one SQLite-backed Durable Object per short room code. Free Workers supports SQLite-backed Durable Objects; legacy KV-backed objects are unavailable on Free [CF-4]. Do not add D1, KV, R2, Queues, a pub/sub service, or a second Worker.

## Monorepo boundary

The approved npm-workspaces TypeScript scaffold now establishes these boundaries:

- `packages/engine`: pure deterministic draft/collation/state transitions; zero platform dependencies.
- `packages/contracts`: protocol/domain view contracts and boundary validation.
- `packages/set-omens`: Omens-specific build-time source identity, checksum, and strict Settings-envelope and CustomCards-schema boundaries; aggregate fixture enforcement, source reconciliation, layout/pool import, and reviewed generated snapshots follow only after separate review.
- `apps/web`: static browser client.
- `apps/server`: thin Worker router and Durable Object adapter.

Only the neutral browser shell plus the Omens checksum and strict Settings-envelope and CustomCards-schema boundaries are implemented; aggregate fixtures, source reconciliation, layouts, pools, import, and snapshots remain unimplemented, and the other boundaries remain empty. Keep the server plain rather than adding a general web framework. Select a small client rendering approach only after a bundle/accessibility spike; do not let a framework enter engine/contracts.

## Why Durable Objects fit

- A room needs one serial authority for picks, deadlines, passing, and visibility.
- A single object supports thousands of WebSocket clients; 16 is far below capability [CF-6].
- Hibernation keeps clients connected, discards in-memory state after idle, and stops duration charges while eligible [CF-4][CF-6][CF-8].
- SQLite snapshot storage reconstructs after hibernation/deploy disconnects.
- One alarm wakes the object for the next pick/review/expiry. Alarms are at-least-once, so the state machine is idempotent [CF-7].

Never use `setInterval` for countdowns. Clients animate from an absolute server deadline; one alarm performs the authoritative transition. Standard timers/outbound sockets prevent hibernation, while an idle object using hibernation APIs can sleep after roughly 10 seconds [CF-6][CF-8].

## Current relevant Free limits

| Resource | Current Free allowance/limit | Design response |
|---|---:|---|
| Worker requests | 100,000/day, reset 00:00 UTC [CF-1] | Static asset hits bypass this; dynamic create/upgrade only. |
| Worker CPU | 10 ms/request [CF-1] | No SSR, image processing, heavy KDF, or whole-room repeated serialization. Profile transitions. |
| Worker memory | 128 MB/isolate [CF-1] | Omens-only compact data; stream/avoid all-card data. |
| Worker bundle | 3 MB compressed [CF-1] | Keep card images remote and server dependencies minimal. |
| Static assets | Requests free/unlimited, storage no extra cost [CF-2] | Serve client/snapshot directly; avoid `run_worker_first` for asset paths. |
| Static files | 20,000/version; 25 MiB/file [CF-1] | Expected app is far smaller. |
| Durable Object requests | 100,000/day [CF-4] | Hibernating sockets; incoming messages receive 20:1 billing ratio. |
| DO duration | 13,000 GB-s/day [CF-4] | Hibernation API; no standard accepted socket/timers. |
| DO SQLite reads/writes | 5M rows read/day; 100,000 rows written/day [CF-4] | One snapshot row, persist only authoritative mutations. Writes are expected material constraint. |
| DO storage | 5 GB/account; 1 GB/object on Free [CF-4][CF-5] | Delete abandoned/completed state; room state target <100 KiB. |
| DO incoming WS frame | 32 MiB [CF-5] | App command cap 16 KiB; protocol has no bulk uploads. |
| DO throughput | Soft 1,000 requests/s/object [CF-5] | 16-person room is orders below; batch outgoing deltas. |
| WebSocket billing | Connection is a request; incoming messages count 20:1; outgoing messages and protocol pings are free [CF-4] | No app heartbeat spam; use protocol ping/pong and deltas. |
| Alarm | One scheduled alarm/object; alarm invocation billed; `setAlarm` is one row write [CF-4][CF-7] | Store logical next event/generation; one alarm only. |

Free overages fail rather than silently billing [CF-4]. There is no availability/SLA guarantee assumed.

## Per-room budget

These are conservative design estimates, not measured implementation results. Validate them in a canary before launch.

### Stored state

A room has 336 visible physical card instances (`8 × 3 × 14`) at maximum, plus 48 compact removed-rear marker references, eight seats, 16 participants, queues, RNG states, config, and at most 100 feed items. Store IDs/indices rather than repeated card/recipe objects. Target:

- canonical serialized room snapshot: **under 100 KiB**;
- per-WebSocket serialized attachment: **under 1 KiB** (limit is 16,384 bytes [CF-6]);
- protocol command: **under 16 KiB**;
- one SQLite row safely below the 2 MB row/value limit [CF-5].

At 100 KiB, even 10,000 undeleted rooms would approach 1 GB, so cleanup—not per-room size—is the storage risk. Completed deletion after one hour and explicit-all-left deletion are mandatory. All-disconnected lobbies delete after 30 minutes; all-disconnected paused started drafts and all-disconnected timer-off started drafts waiting with no connected drafter delete after 24 hours. Successful reconnect resets the applicable grace period.

### Request estimate for one full eight-seat draft

Baseline user activity:

- up to 16 initial WebSocket connections;
- 13 decisions per pack × 3 × 8 = **312** incoming queue messages (last card automatic);
- 312 / 20 = about **16 billed WebSocket message requests**;
- 39 pick alarms + 2 review alarms + 1 expiry alarm = **42 alarm requests**;
- create/start/config/reconnect overhead.

A clean room is therefore roughly **75–100 DO request units** plus 16–40 Worker dynamic requests. Outgoing broadcasts do not add DO request charges [CF-4]. The 100,000-request daily limits would allow roughly 1,000 such rooms/day on requests alone; this is not the binding estimate.

### Write estimate

With one snapshot overwrite per authoritative mutation:

- joins/config/start/status: ~20–60 writes;
- 312 initial queue selections;
- up to 39 state commits and roughly 39 next alarms;
- up to 39 acceleration alarm replacements when everyone queues early;
- review/completion/expiry metadata and ordinary reconnects.

Baseline is approximately **450–550 row writes/room**. One replacement selection per player per decision adds 312. The 100,000 daily write allowance therefore supports roughly **180–220 clean rooms/day**, or about **115 rooms/day** with one replacement per pick, before safety margin [CF-4]. This is an estimate: SQLite accounting and actual persistence strategy must be load-tested. Rate-limit pathological selection thrashing per participant without preventing legitimate replacement.

### Duration estimate

Hibernation-eligible objects do not accrue duration even before eviction; incoming events briefly wake them [CF-4]. Do not project a room/day count until measured wall time exists. Acceptance target is:

- p95 engine + persistence + projection handler under the Free 10 ms CPU ceiling;
- object eligible to hibernate after every handler;
- no unbounded serialization proportional to all private views × all clients;
- alert at 50%, 75%, and 90% of daily DO request/write/duration quotas.

## Routing

Minimal dynamic routes:

- `POST /api/rooms` — create code and initialize one room.
- `GET /api/rooms/:code/socket` with `Upgrade: websocket` — validate shape/rate limits, route to object; password is not in the WebSocket upgrade URL.
- optional `GET /api/health` — static/simple version response only if operationally useful.

Everything else is a static asset/SPA fallback. Reject oversized/malformed requests before Durable Object routing so invalid traffic does not consume both Worker and DO requests [CF-6].

## Short codes

Use a CSPRNG-generated, case-insensitive alphabet without ambiguous characters. Recommended eight Crockford-Base32 characters provide 40 random bits; initialization atomically rejects an existing room and retries. Codes make rooms unlisted, not secret. Passwords and rate limits protect against casual enumeration; threat limits are in [security-and-privacy.md](security-and-privacy.md).

## Operational guardrails

- Metrics: room creates, active sockets, transitions, reconnects, alarm lateness/duplicates, command rejection, serialized state bytes, handler CPU/wall time, row reads/writes, quota utilization, image failures sampled client-side only if privacy-approved.
- Logs: no passwords, identity credentials, full pools/packs, invitation fragments, or Fabrary list content.
- Quota response: disable new-room creation with a clear static notice before existing drafts fail; preserve existing room capacity.
- Deployment: WebSockets disconnect on code updates [CF-6]. Deploy only with reconnect tests and compatible state/protocol migrations; do not promise uninterrupted drafts.
- Data: no runtime upstream fetch or parsing of the 120 KiB community source. Build-time output is strict-checksum validated; set snapshot and community-recipe version/checksum are immutable for the lifetime of a room.

## Rejected alternatives

- **One in-memory Worker:** no per-room serialization guarantee, alarm authority, or reconnect reconstruction.
- **Pages + separate Worker:** extra project/routing with no free-tier benefit.
- **D1 global room database:** unnecessary centralized writes/locking; adds a service and quota.
- **KV room state:** eventual consistency and no Free KV-backed DO; wrong authority primitive.
- **Third-party realtime/pub-sub:** paid/external dependency and loss of single authority.
- **Polling/SSE:** more requests and inferior bidirectional pick commands.
- **Image proxy/cache:** bandwidth/storage/rights complexity with no MVP need.
