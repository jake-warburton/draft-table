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
import { cardControl, faceDownDeck, identities, poolGroup } from "./table-render.ts";

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

/** One line of the room's story, exactly as the server's feed records it. */
interface FeedEntry {
  readonly at: number;
  readonly type: string;
  readonly name: string;
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
  feed: readonly FeedEntry[];
}

/** The story box holds this many lines at most, the same bound the server keeps. */
const MAX_FEED_LINES = 100;

/**
 * Every story line in plain words. The box is a log, not a chat: nobody types into it, and a
 * line never carries anything the lobby list does not already show.
 */
const feedLine = (entry: FeedEntry): string => {
  switch (entry.type) {
    case "join": return `${entry.name} joined.`;
    case "reconnect": return `${entry.name} reconnected.`;
    case "disconnect": return `${entry.name} lost their connection.`;
    case "leave": return `${entry.name} left.`;
    case "removed": return `${entry.name} was removed.`;
    case "seats": return `${entry.name} rearranged the seats.`;
    case "start": return `${entry.name} started the draft.`;
    case "review": return "The pack is drafted — review time.";
    case "completion": return "The draft is complete.";
    case "pack": return `Pack ${entry.name} is in hand.`;
    default: return "";
  }
};

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
  const randomizeControl = el("#lobby-randomize");
  const startControl = el("#lobby-start");
  const leaveControl = el("#room-leave");
  const storySection = el("#room-story");
  const feedList = el("#room-feed");
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
    share.replaceChildren(address, copy, copyStatus);
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
    picker.setAttribute("data-picker-for", occupant.id);
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

  /** What the lobby rows are built from; while it holds still, the rows are left alone. */
  let lobbySeating = "";

  const renderLobby = (): void => {
    if (state === null) return;
    codeLabel.textContent = state.code;
    const hosting = self()?.host === true;
    randomizeControl.hidden = !hosting;
    startControl.hidden = !hosting;

    // Frames that change nothing about the people — acks, notices, deadlines — must not tear
    // the rows down: the host may have a picker open, and a rebuild would close it under them.
    const seating = JSON.stringify([state.code, hosting, state.participants.map((entry) =>
      [entry.id, entry.name, entry.host, entry.connected, entry.seat])]);
    if (seating === lobbySeating) return;
    lobbySeating = seating;

    // A genuine change rebuilds, so if the host was mid-pick, the same participant's fresh
    // picker takes the focus back rather than dropping the keyboard on the page body.
    const focusedOn = document.activeElement?.getAttribute("data-picker-for") ?? null;
    const refocus: { picker: HTMLElement | null } = { picker: null };
    const row = (occupant: PublicParticipant): HTMLElement => {
      const item = document.createElement("li");
      const name = document.createElement("span");
      name.className = "seat-name";
      name.textContent = participantLabel(occupant);
      item.append(name);
      if (hosting) {
        draggableRow(item, occupant);
        const picker = seatPicker(occupant);
        if (occupant.id === focusedOn) refocus.picker = picker;
        item.append(picker);
      }
      return item;
    };

    const seated = new Map(state.participants.filter((entry) => entry.seat !== null)
      .map((entry) => [entry.seat as number, entry]));
    seatList.replaceChildren(...Array.from({ length: LOBBY_SEAT_COUNT }, (unused, position) => {
      const occupant = seated.get(position);
      let item: HTMLElement;
      if (occupant === undefined) {
        item = document.createElement("li");
        item.textContent = "Empty seat";
      } else {
        item = row(occupant);
      }
      if (hosting) dropTarget(item, position);
      return item;
    }));
    spectatorList.replaceChildren(...state.participants.filter((entry) => entry.seat === null)
      .map((entry) => row(entry)));
    if (hosting) dropTarget(spectatorList, "spectators");
    refocus.picker?.focus();
  };

  /** A public name for a seat; the board never needs more than the lobby already shows. */
  const seatName = (participantId: string | null): string => {
    if (participantId === null) return "Empty seat";
    return state?.participants.find(({ id }) => id === participantId)?.name ?? "A drafter";
  };

  /**
   * What a spectator watches instead of a pack: the seats around the table, who has picked and
   * who is still thinking, and who has slipped away — all of it public, none of it a card.
   */
  const tableBoard = (): HTMLElement => {
    const board = document.createElement("ol");
    board.className = "table-board";
    board.setAttribute("aria-label", "Seats at the table");
    const picking = state?.phase === "picking";
    for (const seat of state?.seats ?? []) {
      const item = document.createElement("li");
      const name = document.createElement("span");
      name.className = "board-name";
      name.textContent = seatName(seat.participantId);
      item.append(name);
      if (seat.participantId !== null && picking) {
        const mark = document.createElement("span");
        mark.className = seat.hasQueued ? "board-picked" : "board-picking";
        mark.textContent = seat.hasQueued ? "picked" : "picking…";
        item.append(mark);
      }
      if (seat.participantId !== null && !seat.connected) {
        const away = document.createElement("span");
        away.className = "board-away";
        away.textContent = "away";
        item.append(away);
      }
      board.append(item);
    }
    return board;
  };

  const renderDraft = (): void => {
    if (state === null) return;
    const review = state.phase === "review";
    const complete = state.phase === "complete";
    const spectating = self()?.seat === null;
    roundNumber.textContent = String(state.round);
    pickNumber.textContent = String(state.pick);
    draftingHeading.hidden = review;
    reviewHeading.hidden = !review;
    reviewPack.textContent = String(Math.max(1, state.round - 1));
    continueControl.hidden = true;
    const queuedNote = state.view?.queued === null ? "Choose a card." : "Queued. You may still change it.";
    statusRegion.textContent = complete
      ? spectating ? "Draft complete." : "Draft complete. Your pool is below."
      : spectating
        ? `Round ${state.round}, pick ${state.pick}. You are watching from the rail.`
        : review
          ? `Pack ${Math.max(1, state.round - 1)} drafted. Review your pool; pack ${state.round} arrives shortly.`
          : `Round ${state.round}, pick ${state.pick}. ${queuedNote} Packs pass ${
              state.passDirection === "left" ? "to the left" : "to the right"}.`;

    // A spectator needs no pack guard here: they hold no private view, so the pack is already
    // empty, and the board branch below never consults it anyway.
    const pack = review || complete ? [] : state.view?.pack?.cards ?? [];
    packRegion.replaceChildren(...(spectating && !complete ? [tableBoard()] : pack.map((card) => {
      const control = cardControl(card, () => {
        if (client === null || state === null) return;
        client.send("queue_pick", { round: state.round, pick: state.pick, cardInstanceId: card.instanceId });
      });
      // The queued card stays visibly chosen across re-renders and replacements.
      control.setAttribute("aria-pressed", String(card.instanceId === state?.view?.queued));
      return control;
    })));

    const pool = state.view?.pool ?? null;
    // A hidden pool still has a public size: one card per resolved pick this draft.
    const banked = (state.round - 1) * 14 + (state.pick - 1);
    poolCount.textContent = pool === null ? (spectating ? "none" : String(banked)) : String(pool.length);
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
      ? [spectating
          ? (() => {
              const notice = document.createElement("p");
              notice.className = "pool-hidden";
              notice.textContent = "You are watching; there is no pool of your own.";
              return notice;
            })()
          : faceDownDeck(banked)]
      : groupPool(pool, state.grouping, identities).map(({ label, cards }) => poolGroup(label, cards))));

    exportRegion.hidden = !complete || pool === null;
    if (complete && pool !== null) {
      const entries = fabraryEntries(pool, identities);
      exportList.value = fabraryTextList(entries);
      exportLink.setAttribute("href", fabraryImportLink(entries) ?? FABRARY_IMPORT_URL);
    }
  };

  /** New rounds are announced once each; the counter only ever climbs. */
  let announcedPack = 0;

  const appendFeed = (entry: FeedEntry): void => {
    if (state === null) return;
    state.feed = [...state.feed, entry].slice(-MAX_FEED_LINES);
  };

  /** The story box: visible for the whole life of a room, newest line at the bottom. */
  const renderStory = (): void => {
    if (state === null) return;
    storySection.hidden = false;
    feedList.replaceChildren(...state.feed.flatMap((entry) => {
      const words = feedLine(entry);
      if (words === "") return [];
      const item = document.createElement("li");
      item.textContent = words;
      return [item];
    }));
    feedList.scrollTop = feedList.scrollHeight;
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
    renderStory();
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
        state.feed = ((payload.feed ?? []) as FeedEntry[]).slice(-MAX_FEED_LINES);
        const draft = payload.draft as Record<string, unknown> | undefined;
        if (draft !== undefined) {
          state.round = draft.round as number;
          state.pick = draft.pick as number;
          state.packSize = draft.packSize as number;
          state.passDirection = draft.passDirection as string;
          state.seats = (draft.seats ?? []) as PublicSeat[];
        }
        // The server's story never carries the page's own pack line, so a snapshot — a fresh
        // join or a reconnect mid-draft — re-derives it for the round actually in hand, and
        // arms the once-per-round guard so later frames cannot repeat it.
        if (draft !== undefined) {
          announcedPack = state.round;
          if (state.phase === "picking") appendFeed({ at: 0, type: "pack", name: String(state.round) });
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
        // The server's story covers people and milestones; the fresh pack in hand is the one
        // line the page adds itself, exactly once per round.
        if (state.phase === "picking" && state.round > announcedPack) {
          announcedPack = state.round;
          appendFeed({ at: 0, type: "pack", name: String(state.round) });
        }
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
      case "feed_appended":
        appendFeed(payload.event as FeedEntry);
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
    lobbySeating = "";
    packSection.hidden = false;
    poolSection.hidden = false;
    client?.stop("done");
    client = null;
    state = null;
    forms.hidden = false;
    lobby.hidden = true;
    roomsSection.hidden = false;
    roomControls.hidden = true;
    storySection.hidden = true;
    feedList.replaceChildren();
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
    lobbySeating = "";
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
      notice: "Waiting for the room…",
      feed: []
    };
    announcedPack = 0;
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
    // Rooms carry no chosen name; the minted eight-character code is the room's whole identity.
    const password = (el("#create-password") as HTMLInputElement).value;
    const options = {
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
    roomStatus.textContent = `You are invited to room ${invited}.`;
    (el("#join-name") as HTMLInputElement).focus();
  }
};
