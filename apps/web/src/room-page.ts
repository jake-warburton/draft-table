/**
 * The page's room mode: forms in front, one connection behind, the same table throughout.
 *
 * Create or join hands the page to a RoomClient; every server frame folds into one plain state
 * object and one render pass drives the same pack, pool, status, and export regions the solo
 * table uses. The solo table stands down while a room is live and comes back when it ends.
 * Entropy, storage, sockets, and clocks are the browser's own; this module only wires them.
 */

import type { DraftCard } from "@draft-table/draft";

import { FABRARY_IMPORT_URL, fabraryEntries, fabraryImportLink, fabraryTextList } from "./fabrary.ts";
import { POOL_GROUPINGS, groupPool, type PoolGrouping } from "./pool.ts";
import { remainingMs, type ServerFrame } from "./protocol.ts";
import { RoomClient, type DriverSocket, type DriverStatus } from "./room-client.ts";
import { createRoom, readTypedCode, socketUrl } from "./rooms.ts";
import { cardControl, identities, poolGroup } from "./table-render.ts";

interface PublicParticipant {
  readonly id: string;
  readonly name: string;
  readonly host: boolean;
  readonly connected: boolean;
  readonly seat: number | null;
}

interface PublicSeat {
  readonly seatId: string;
  readonly participantId: string | null;
  readonly connected: boolean;
  readonly hasQueued: boolean;
}

interface PrivateView {
  readonly seatId: string;
  readonly pack: { readonly id: string; readonly cards: readonly DraftCard[] } | null;
  readonly pool: readonly DraftCard[] | null;
  readonly queued: string | null;
}

interface RoomPageState {
  code: string;
  selfId: string | null;
  phase: "lobby" | "picking" | "review" | "complete";
  participants: readonly PublicParticipant[];
  seats: readonly PublicSeat[];
  round: number;
  pick: number;
  packSize: number;
  passDirection: string;
  deadlineAt: number | null;
  view: PrivateView | null;
  grouping: PoolGrouping;
  notice: string;
}

const LOBBY_SEAT_COUNT = 8;

export interface RoomPageRegions {
  element(selector: string): HTMLElement;
  /** The solo table stands down while a room is live. */
  setSoloActive(active: boolean): void;
}

export const initRoomsPage = (regions: RoomPageRegions): void => {
  const el = regions.element;
  const roomStatus = el("#room-status");
  const roomsSection = el("#rooms");
  const roomControls = el("#room-controls");
  const forms = el("#room-forms");
  const lobby = el("#room-lobby");
  const codeLabel = el("#room-code");
  const share = el("#room-share");
  const seatList = el("#lobby-seats");
  const spectatorList = el("#lobby-spectators");
  const hintRegion = el("#lobby-hint");
  const randomizeControl = el("#lobby-randomize");
  const startControl = el("#lobby-start");
  const leaveControl = el("#room-leave");
  const deadlineRegion = el("#room-deadline");
  const deadlineBar = el("#deadline-bar") as HTMLProgressElement;
  const deadlineSeconds = el("#deadline-seconds");
  const packSection = el("#pack-section");
  const poolSection = el("#pool-section");
  const packRegion = el("#pack");
  const statusRegion = el("#status");
  const draftingHeading = el("#drafting-heading");
  const reviewHeading = el("#review-heading");
  const reviewPack = el("#review-pack");
  const continueControl = el("#continue");
  const roundNumber = el("#round");
  const pickNumber = el("#pick");
  const poolRegion = el("#pool");
  const poolGroupingRegion = el("#pool-grouping");
  const poolCount = el("#pool-count");
  const exportRegion = el("#export");
  const exportLink = el("#export-link");
  const exportList = el("#export-list") as HTMLTextAreaElement;

  let client: RoomClient | null = null;
  let state: RoomPageState | null = null;
  let deadlineTicker: number | null = null;
  let deadlineTotalMs = 0;

  const self = (): PublicParticipant | undefined =>
    state?.participants.find(({ id }) => id === state?.selfId);

  /**
   * The invite is the page's own address with the code attached; the password, when there is
   * one, never enters it. Built once per room, not per render, so copying is never interrupted.
   */
  const renderShare = (code: string): void => {
    const link = `${location.protocol}//${location.host}/?join=${code}`;
    const address = document.createElement("input") as HTMLInputElement;
    address.setAttribute("readonly", "");
    address.setAttribute("aria-label", "Invite link");
    address.value = link;
    const copy = document.createElement("button");
    copy.setAttribute("type", "button");
    copy.textContent = "Copy invite link";
    const copyStatus = document.createElement("span");
    copyStatus.setAttribute("role", "status");
    copy.onclick = () => {
      address.select();
      const copied = navigator.clipboard?.writeText(link);
      if (copied === undefined) {
        copyStatus.textContent = "Your browser would not copy it. The link is selected, so copy it yourself.";
        return;
      }
      copied.then(
        () => { copyStatus.textContent = "Copied."; },
        () => { copyStatus.textContent = "Your browser would not copy it. The link is selected, so copy it yourself."; }
      );
    };
    const caveat = document.createElement("span");
    caveat.textContent = "Anyone with the link can knock. The password, if any, travels separately.";
    share.replaceChildren(address, copy, copyStatus, caveat);
  };

  /** Which participant is mid-drag; the closure, not the drag payload, is the real carrier. */
  let dragging: string | null = null;

  /** One seat move, exactly as the room expects it; the server owns the swap semantics. */
  const sendMove = (participantId: string, destination: number | "spectators"): void => {
    client?.send("move_participant", { participantId, destination });
  };

  const participantLabel = (occupant: PublicParticipant): string =>
    `${occupant.name}${occupant.host ? " (host)" : ""}${occupant.connected ? "" : " — away"}`;

  /** The no-mouse path to the same moves: a picker beside each name, host only. */
  const seatPicker = (occupant: PublicParticipant): HTMLElement => {
    const picker = document.createElement("select") as HTMLSelectElement;
    picker.className = "seat-move";
    picker.setAttribute("aria-label", `Move ${occupant.name}`);
    for (let position = 0; position < LOBBY_SEAT_COUNT; position += 1) {
      const option = document.createElement("option");
      option.setAttribute("value", String(position));
      option.textContent = `Seat ${position + 1}`;
      picker.append(option);
    }
    const spectate = document.createElement("option");
    spectate.setAttribute("value", "spectators");
    spectate.textContent = "Spectators";
    picker.append(spectate);
    picker.value = occupant.seat === null ? "spectators" : String(occupant.seat);
    picker.onchange = () => {
      sendMove(occupant.id, picker.value === "spectators" ? "spectators" : Number(picker.value));
    };
    return picker;
  };

  /** A row the host can pick up: the name travels by closure, never by payload. */
  const draggableRow = (item: HTMLElement, occupant: PublicParticipant): void => {
    item.setAttribute("draggable", "true");
    item.ondragstart = (event: DragEvent) => {
      dragging = occupant.id;
      event.dataTransfer?.setData("text/plain", occupant.name);
    };
    item.ondragend = () => { dragging = null; };
  };

  /** A place the host can put someone down; a drop nobody started does nothing. */
  const dropTarget = (item: HTMLElement, destination: number | "spectators"): void => {
    item.ondragover = (event: DragEvent) => { event.preventDefault(); };
    item.ondrop = (event: DragEvent) => {
      event.preventDefault();
      if (dragging !== null) sendMove(dragging, destination);
      dragging = null;
    };
  };

  const renderLobby = (): void => {
    if (state === null) return;
    codeLabel.textContent = state.code;
    const hosting = self()?.host === true;
    const seated = new Map(state.participants.filter((entry) => entry.seat !== null)
      .map((entry) => [entry.seat as number, entry]));
    seatList.replaceChildren(...Array.from({ length: LOBBY_SEAT_COUNT }, (unused, position) => {
      const item = document.createElement("li");
      const occupant = seated.get(position);
      if (occupant === undefined) {
        item.textContent = "Empty seat";
      } else {
        const name = document.createElement("span");
        name.className = "seat-name";
        name.textContent = participantLabel(occupant);
        item.append(name);
        if (hosting) {
          draggableRow(item, occupant);
          item.append(seatPicker(occupant));
        }
      }
      if (hosting) dropTarget(item, position);
      return item;
    }));
    spectatorList.replaceChildren(...state.participants.filter((entry) => entry.seat === null)
      .map((entry) => {
        const item = document.createElement("li");
        const name = document.createElement("span");
        name.className = "seat-name";
        name.textContent = participantLabel(entry);
        item.append(name);
        if (hosting) {
          draggableRow(item, entry);
          item.append(seatPicker(entry));
        }
        return item;
      }));
    if (hosting) dropTarget(spectatorList, "spectators");
    hintRegion.hidden = !hosting;
    randomizeControl.hidden = !hosting;
    startControl.hidden = !hosting;
  };

  const renderDraft = (): void => {
    if (state === null) return;
    const review = state.phase === "review";
    const complete = state.phase === "complete";
    roundNumber.textContent = String(state.round);
    pickNumber.textContent = String(state.pick);
    draftingHeading.hidden = review;
    reviewHeading.hidden = !review;
    reviewPack.textContent = String(Math.max(1, state.round - 1));
    continueControl.hidden = true;
    const queuedNote = state.view?.queued === null ? "Choose a card." : "Queued. You may still change it.";
    statusRegion.textContent = complete
      ? "Draft complete. Your pool is below."
      : review
        ? `Pack ${Math.max(1, state.round - 1)} drafted. Review your pool; pack ${state.round} arrives shortly.`
        : `Round ${state.round}, pick ${state.pick}. ${queuedNote} Packs pass ${
            state.passDirection === "left" ? "to the left" : "to the right"}.`;

    const pack = review || complete ? [] : state.view?.pack?.cards ?? [];
    packRegion.replaceChildren(...pack.map((card) => {
      const control = cardControl(card, () => {
        if (client === null || state === null) return;
        client.send("queue_pick", { round: state.round, pick: state.pick, cardInstanceId: card.instanceId });
      });
      // The queued card stays visibly chosen across re-renders and replacements.
      control.setAttribute("aria-pressed", String(card.instanceId === state?.view?.queued));
      return control;
    }));

    const pool = state.view?.pool ?? null;
    poolCount.textContent = pool === null ? "hidden" : String(pool.length);
    poolGroupingRegion.hidden = pool === null;
    poolGroupingRegion.replaceChildren(...(pool === null ? [] : POOL_GROUPINGS.map((choice) => {
      const control = document.createElement("button");
      control.setAttribute("type", "button");
      control.className = "grouping";
      control.setAttribute("aria-pressed", String(choice.id === state?.grouping));
      control.textContent = choice.label;
      control.onclick = () => {
        if (state !== null) state.grouping = choice.id;
        render();
      };
      return control;
    })));
    poolRegion.replaceChildren(...(pool === null
      ? [(() => {
          const notice = document.createElement("p");
          notice.className = "pool-hidden";
          notice.textContent = "Pool hidden until the next review";
          return notice;
        })()]
      : groupPool(pool, state.grouping, identities).map(({ label, cards }) => poolGroup(label, cards))));

    exportRegion.hidden = !complete || pool === null;
    if (complete && pool !== null) {
      const entries = fabraryEntries(pool, identities);
      exportList.value = fabraryTextList(entries);
      exportLink.setAttribute("href", fabraryImportLink(entries) ?? FABRARY_IMPORT_URL);
    }
  };

  const renderDeadline = (): void => {
    if (state === null || state.deadlineAt === null || client === null || state.phase === "complete") {
      deadlineRegion.hidden = true;
      if (deadlineTicker !== null) {
        clearInterval(deadlineTicker);
        deadlineTicker = null;
      }
      return;
    }
    deadlineRegion.hidden = false;
    const update = (): void => {
      if (state === null || state.deadlineAt === null || client === null) return;
      const left = remainingMs(client.clockEstimate(), state.deadlineAt, Date.now());
      deadlineSeconds.textContent = `${Math.ceil(left / 1000)}s`;
      deadlineBar.max = 1000;
      deadlineBar.value = deadlineTotalMs <= 0 ? 0 : Math.round((left / deadlineTotalMs) * 1000);
    };
    update();
    if (deadlineTicker === null) {
      deadlineTicker = setInterval(update, 250) as unknown as number;
    }
  };

  const render = (): void => {
    if (state === null) return;
    const inLobby = state.phase === "lobby";
    const complete = state.phase === "complete";
    forms.hidden = true;
    lobby.hidden = !inLobby;
    // Each phase is its own screen: the lobby lives in the rooms section, the draft owns the
    // table, and completion is the results page — pool and hand-off, no pack, no forms.
    roomsSection.hidden = !inLobby;
    regions.setSoloActive(false);
    packSection.hidden = inLobby || complete;
    poolSection.hidden = inLobby;
    if (inLobby) {
      packRegion.replaceChildren();
      exportRegion.hidden = true;
      renderLobby();
      statusRegion.textContent = state.notice;
    } else {
      renderDraft();
    }
    renderDeadline();
  };

  const applyFrame = (frame: ServerFrame): void => {
    if (state === null) return;
    const payload = frame.payload as Record<string, unknown>;
    switch (frame.type) {
      case "hello_ack": {
        const selfInfo = payload.self as { id?: string } | undefined;
        if (typeof selfInfo?.id === "string") state.selfId = selfInfo.id;
        return;
      }
      case "snapshot": {
        state.phase = payload.phase as RoomPageState["phase"];
        state.participants = (payload.participants ?? []) as PublicParticipant[];
        const draft = payload.draft as Record<string, unknown> | undefined;
        if (draft !== undefined) {
          state.round = draft.round as number;
          state.pick = draft.pick as number;
          state.packSize = draft.packSize as number;
          state.passDirection = draft.passDirection as string;
          state.seats = (draft.seats ?? []) as PublicSeat[];
        }
        if (typeof payload.deadlineAt === "number" || payload.deadlineAt === null) {
          state.deadlineAt = payload.deadlineAt as number | null;
          // A joiner or reconnector learns the deadline from the snapshot alone, so the bar
          // measures from whatever remains at arrival rather than staying empty.
          if (state.deadlineAt !== null && client !== null) {
            deadlineTotalMs = Math.max(0, remainingMs(client.clockEstimate(), state.deadlineAt, Date.now()));
          }
        }
        break;
      }
      case "participants_changed":
      case "seat_layout_changed":
        state.participants = (payload.participants ?? state.participants) as PublicParticipant[];
        break;
      case "phase_changed": {
        state.phase = payload.phase as RoomPageState["phase"];
        state.round = payload.round as number;
        state.pick = payload.pick as number;
        state.packSize = payload.packSize as number;
        state.passDirection = payload.passDirection as string;
        state.seats = (payload.seats ?? []) as PublicSeat[];
        break;
      }
      case "deadline_changed": {
        state.deadlineAt = (payload.deadlineAt ?? null) as number | null;
        if (state.deadlineAt !== null && client !== null) {
          deadlineTotalMs = Math.max(0, remainingMs(client.clockEstimate(), state.deadlineAt, Date.now()));
        }
        break;
      }
      case "queue_status_changed": {
        const seatId = payload.seatId as string;
        state.seats = state.seats.map((seat) =>
          seat.seatId === seatId ? { ...seat, hasQueued: payload.hasQueued === true } : seat);
        break;
      }
      case "private_pack_pool":
        state.view = payload as unknown as PrivateView;
        break;
      case "ack":
        if (typeof payload.queued === "string" && state.view !== null) {
          state.view = { ...state.view, queued: payload.queued };
        }
        break;
      case "error":
        state.notice = `The room said no: ${String(payload.code ?? "unknown")}.`;
        roomStatus.textContent = state.notice;
        return;
      case "room_closed":
        endRoom("The room closed.");
        return;
      default:
        return;
    }
    render();
  };

  const endRoom = (message: string): void => {
    if (deadlineTicker !== null) {
      clearInterval(deadlineTicker);
      deadlineTicker = null;
    }
    deadlineTotalMs = 0;
    packSection.hidden = false;
    poolSection.hidden = false;
    client?.stop("done");
    client = null;
    state = null;
    forms.hidden = false;
    lobby.hidden = true;
    roomsSection.hidden = false;
    roomControls.hidden = true;
    deadlineRegion.hidden = true;
    roomStatus.textContent = message;
    regions.setSoloActive(true);
  };

  const onStatus = (status: DriverStatus): void => {
    switch (status.state) {
      case "connecting":
        roomStatus.textContent = "Connecting…";
        return;
      case "connected":
        roomStatus.textContent = "Connected.";
        return;
      case "reconnecting":
        roomStatus.textContent = "Connection lost. Trying again…";
        return;
      case "superseded":
        endRoom("This room is open in a newer tab; this one stepped aside.");
        return;
      case "refused":
        endRoom(status.reason === "wrong_password"
          ? "That password was not right."
          : `The room turned this join away (${status.reason}).`);
        return;
      case "closed":
        if (state !== null) endRoom("Left the room.");
        return;
      default:
        return;
    }
  };

  const enterRoom = (code: string, hello: { name?: string; password?: string; hostClaim?: string }): void => {
    deadlineTotalMs = 0;
    state = {
      code,
      selfId: null,
      phase: "lobby",
      participants: [],
      seats: [],
      round: 1,
      pick: 1,
      packSize: 14,
      passDirection: "left",
      deadlineAt: null,
      view: null,
      grouping: "number",
      notice: "Waiting for the room…"
    };
    roomControls.hidden = false;
    renderShare(code);
    client = new RoomClient(code, hello, {
      openSocket: (roomCode) =>
        new WebSocket(socketUrl(location.protocol, location.host, roomCode)) as unknown as DriverSocket,
      now: () => Date.now(),
      schedule: (callback, delayMs) => {
        const timer = setTimeout(callback, delayMs);
        return () => clearTimeout(timer);
      },
      loadStored: (key) => localStorage.getItem(key),
      store: (key, value) => localStorage.setItem(key, value),
      onFrame: applyFrame,
      onStatus
    });
    client.connect();
    render();
  };

  (el("#create-form") as HTMLFormElement).onsubmit = (event) => {
    event.preventDefault();
    const name = (el("#create-name") as HTMLInputElement).value.trim();
    const password = (el("#create-password") as HTMLInputElement).value;
    const options = {
      ...(name === "" ? {} : { name }),
      ...(password === "" ? {} : { password }),
      timers: (el("#create-timers") as HTMLInputElement).checked,
      poolHidden: (el("#create-pool-hidden") as HTMLInputElement).checked,
      spectators: (el("#create-spectators") as HTMLInputElement).checked
    };
    roomStatus.textContent = "Creating the room…";
    void createRoom(options, (path, init) => fetch(path, init)).then((outcome) => {
      if (!outcome.ok) {
        roomStatus.textContent = outcome.reason === "invalid"
          ? "The room settings were not accepted."
          : outcome.reason === "unavailable"
            ? "No room code was free; try again."
            : "Creating the room failed. Is the server reachable?";
        return;
      }
      enterRoom(outcome.code, {
        hostClaim: outcome.hostClaim,
        ...(password === "" ? {} : { password })
      });
    });
  };

  (el("#join-form") as HTMLFormElement).onsubmit = (event) => {
    event.preventDefault();
    const code = readTypedCode((el("#join-code") as HTMLInputElement).value);
    if (code === null) {
      roomStatus.textContent = "That is not a room code. Codes are eight letters and numbers.";
      return;
    }
    const name = (el("#join-name") as HTMLInputElement).value.trim();
    const password = (el("#join-password") as HTMLInputElement).value;
    enterRoom(code, {
      ...(name === "" ? {} : { name }),
      ...(password === "" ? {} : { password })
    });
  };

  randomizeControl.onclick = () => {
    client?.send("set_seat_randomization", { mode: "randomize_now" });
  };
  startControl.onclick = () => {
    if (client === null || state === null) return;
    client.send("start_draft", { expectedStateVersion: client.lastSeenVersion() ?? 0 });
  };
  leaveControl.onclick = () => {
    client?.leave();
    endRoom("Left the room.");
  };

  // An invite link opens on the door with the join form already filled in. Whatever the link
  // carried is read the same forgiving way as typed codes, and a link that does not hold a
  // real code changes nothing — its text is never echoed anywhere.
  const invited = readTypedCode(new URLSearchParams(globalThis.location?.search ?? "").get("join") ?? "");
  if (invited !== null) {
    (el("#join-code") as HTMLInputElement).value = invited;
    roomStatus.textContent = `You are invited to room ${invited}. Add your name if you like, then join.`;
    (el("#join-name") as HTMLInputElement).focus();
  }
};
