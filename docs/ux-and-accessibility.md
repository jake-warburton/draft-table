# UX, state flows, and accessibility

External citation IDs resolve in the [research source register](research.md#source-register).

## Experience principles

- Keep copy short, literal, and adjacent to the action it explains.
- Prefer native landmarks, headings, forms, buttons, lists, progress elements, and dialogs over generic clickable containers.
- Never encode queued, disconnected, Rainbow Foil, paused, warning, or deadline urgency by colour alone.
- Make server state visible: room role, connection state, phase, pass direction, pick count, deadline, and whether a queue is provisional.
- Never show another drafter's selected card.
- Make failure recoverable without reload: rejected command, stale state, lost socket, failed image, clipboard denial, and Fabrary deep-link fallback.

## End-to-end flow

### 1. Landing and create/join

- `Create room` and `Join room` are the primary actions.
- Creating asks for display name, optional password, and the four host options; the room's identity is its auto-assigned code. Omens is the only enabled set.
- Joining from a share URL shows the generated temporary name in an editable field before submitting.
- A fragment password is read locally and never echoed on screen by default. After the first authentication attempt, remove it with `history.replaceState`.
- Errors distinguish room not found/expired, wrong password, participant limit, spectators disabled, and incompatible protocol.

### 2. Lobby

Page order: room heading/share actions, host configuration, eight-seat board, spectators, participant/status summary, status feed.

Each seat is an ordered-list item with a visible seat number and either:

- a participant card with name, role/host badge, connection state, and `Move`; or
- a visible/focusable empty cutout labelled `Empty seat N`.

Pointer/touch drag is an enhancement. Keyboard and screen-reader users activate `Move <name>`, select `Seat 1`…`Seat 8` or `Spectators`, and confirm a swap if occupied. Announce `Moved Alex to seat 3` or `Swapped Alex and Sam` in a polite live region. Escape cancels. Do not require a spatial drag gesture.

The start area states occupied drafter count and blockers. Pending start-time randomization is visible. The first manual move/swap turns it off and announces that change. `Randomize now` immediately applies a server-owned shuffle and visibly turns pending start-time randomization off; `Randomize at start` explicitly re-enables it.

### 3. Draft pick

Recommended document order:

1. room/phase heading and connection status;
2. timer and pause state;
3. seat strip with queued/not-queued state and pass direction;
4. current pack heading and card buttons;
5. own pool (or explicit hidden message);
6. status feed.

Every card is a native button in a semantic list. Its accessible name includes card name, pitch, cost when present, type, and treatment. The image uses empty alt text when the same information is in the button label. Tab traverses cards and controls; Enter queues the focused card. `aria-pressed=true`, a check icon, border/shape change, and visible `Queued` text identify the local provisional choice. Selecting another atomically updates both buttons and announces the new choice.

Do not reorder cards when one is selected. Keep focus on the activated card. When a new pack arrives, move focus to a concise phase heading and announce `Pack 2, pick 4, 11 cards, passing right`; do not unexpectedly focus the first card.

Image failure leaves a fixed-aspect placeholder containing the card name. The user can still queue it.

### 4. Timer and pause

- Render an absolute server deadline locally with a `progress` element or equivalent `role=progressbar`, visible seconds, and a clock/urgency icon.
- White-to-red interpolation is supplemental. Add persistent text (`Time remaining`) and non-colour urgency states (`Half time`, `Final 10 seconds`, `Final 5 seconds`).
- Avoid announcing every animation frame. Use a polite live region only at meaningful thresholds and pause/resume/deadline.
- `prefers-reduced-motion: reduce` removes sweeping, pulse, card movement, and drag animations; the numeric/progress state still changes.
- Pause displays a prominent `Paused` heading/icon and frozen time. Card queue changes remain usable. Only the connected host sees pause/resume controls.

### 5. Review

A full-width phase, not a modal trap:

- heading `Pack 1 review` or `Pack 2 review`;
- one-minute timer [FAB-2];
- complete own pool grouped predictably (for example class/talent, then name/pitch) without changing source identity;
- next pass direction;
- spectators retain POV selector and full selected pool.

At review end, announce the next pack and restore draft layout. With pool hiding enabled, replace the pool with `Pool hidden until the next review`; do not leave cards hidden only with CSS.

### 6. Spectator POV

Display a persistent `Spectating` role label and a labelled player selector. Changing POV requests a new server projection, shows a loading state, then replaces pack/pool together at one state version. It never highlights that player's queued card. The selector remains keyboard-operable and does not masquerade as tabs when it behaves as a single-select control.

### 7. Completion

Show pool summary and two clear actions:

1. `Create in Fabrary`—open the pre-populated import URL [FABR-1][FABR-2]. Explain briefly that sign-in and hero selection may be required.
2. `Copy Fabrary list`—always available. On success announce `List copied`; on denial reveal a selected text area and `Open Fabrary import`.

Show room expiry as `Available until <local time>` and announce terminal closure.

## Visual treatment

- Use original product styling; do not imitate official FAB frames, logos, set marks, backgrounds, or trade dress.
- Card art is the only official visual asset.
- Rainbow Foil uses a restrained, consistent CSS art treatment that does not reduce text/image contrast, plus a foil/spark icon next to the card name and the visible text/accessible name `Rainbow Foil`.
- Connection uses icon + text (`Connected`, `Disconnected`), queue uses icon + text, and pass direction uses an arrow + `Left`/`Right`.
- Minimum touch targets 44×44 CSS pixels where practical; cards may be larger.
- Avoid hover-only information and horizontal page scroll. Card grids may use contained, labelled horizontal scrolling on small phones only as a secondary adaptation.

## Responsive behavior

- Desktop: seat strip and pack/pool columns can coexist.
- Tablet: pack stays primary; pool collapses below or into a labelled disclosure when allowed.
- Phone: one-column pack, compact seat status, sticky timer/queued summary, and no loss of commands. Seat arrangement may switch from spatial board to ordered destination controls.
- Test portrait/landscape tablet dimensions and zoom to 200% without obscured controls.

## Status and live regions

- Connection and command errors: assertive only when action is blocked; otherwise polite.
- Status feed: `role=log`, polite, additions only, bounded entries, timestamps exposed in readable text.
- Pick threshold/phase announcements: one dedicated polite region.
- Avoid nested live regions and full-region replacement that rereads the whole page.

## Accessibility acceptance checklist

- Complete create → lobby → seat → three-pack draft → Fabrary flow without pointer/touch.
- Every interactive element has a stable accessible name, role, state, and focus indicator.
- Card selection works with Tab + Enter exactly as specified.
- Seat movement/swap is equivalent without drag.
- Screen-reader accessibility tree exposes phase, timer, local queue, pass direction, pool visibility, role, and connection state.
- No projected DOM/network payload contains another player's selected card.
- Rainbow Foil, urgency, queue, disconnect, and errors remain distinguishable in grayscale/high contrast.
- Reduced motion produces no nonessential movement.
- Automated axe checks have no serious/critical issues; manual VoiceOver/Safari and NVDA/Firefox or NVDA/Chrome smoke checks pass.
- Lighthouse budgets and keyboard tests pass at desktop/tablet sizes; image failures and 200% zoom remain usable.
