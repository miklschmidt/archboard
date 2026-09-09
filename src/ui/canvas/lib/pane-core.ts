// One canvas's entire conversation with the server, wired without React; the
// hook in `use-canvas-session.ts` owns React state and hands this the setters.
// Nothing here ever sends a scene: a pane reports a delta against what it has
// seen (`changes.ts`), the server decides what the board becomes, and the pane
// learns the result over the socket like any other client.

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, ExcalidrawImperativeAPI, LibraryItems } from "@excalidraw/excalidraw/types";

import {
	holdBoard,
	publishSelection,
	releaseBoard,
	takeBoardBack,
	type HoldReply,
} from "@/ui/canvas/api";
import { createHoldRenewalDeadline, createPaneReportDeadline } from "@/ui/canvas/canvas-deadlines";
import { createHoldKeeper } from "@/ui/canvas/lib/hold-keeper";
import { createPaneLibrarySync } from "@/ui/canvas/lib/pane-library";
import { createMessageContext } from "@/ui/canvas/lib/pane-message-context";
import { createPaneReportSender } from "@/ui/canvas/lib/pane-report-sender";
import { createPaneStatus } from "@/ui/canvas/lib/pane-status";
import { createPaneSocketConnector, type PaneSocketGeneration } from "@/ui/canvas/lib/pane-socket";
import { attachWorkbenchOwner } from "@/ui/canvas/lib/pane-workbench-attach";
import { createReporting } from "@/ui/canvas/lib/reporting";
import { sceneFromExcalidraw } from "@/ui/canvas/lib/scene-boundary";
import {
	createSceneProjection,
	selectedIds,
	type SceneProjection,
} from "@/ui/canvas/lib/scene-projection";
import { createSelectionPublisher } from "@/ui/canvas/lib/selection-publisher";
import {
	UNKNOWN_HOLDER,
	type CanvasSessionOptions,
	type CanvasTheme,
	type PanePathFocusSnapshot,
	type PaneSelectionSnapshot,
	type TakeBackResult,
} from "@/ui/canvas/lib/session-contracts";
import { handleSocketMessage } from "@/ui/canvas/lib/socket-messages";
import type { WorkbenchTransportPort } from "@/ui/canvas/workbench-port";
import type { CanvasWorkbenchSocketOwner } from "@/ui/canvas/workbench-socket";
import type { PathFocusOverlay } from "@/ui/path-focus";
import type {
	BoardHold,
	BoardIdentity,
	DoingEntry,
	EditWithdrawalReason,
	LockHolder,
	NoteWrittenElsewhere,
	PaneStatus,
} from "@/ui/types";

/** What the core reads from React and writes back to it. */
interface PaneCoreHost<Transport extends WorkbenchTransportPort> {
	readonly paneId: string;
	readonly clientId: string;
	/** The latest options, so a changed callback is heard without re-wiring. */
	readonly options: () => CanvasSessionOptions<Transport>;
	readonly api: () => ExcalidrawImperativeAPI | null;
	readonly paneElement: () => HTMLElement | null;
	readonly workbenchSockets: CanvasWorkbenchSocketOwner<Transport> | null;
	readonly setConnected: (connected: boolean) => void;
	readonly setBoard: (board: BoardIdentity | null) => void;
	readonly setBoardKey: (key: string | null) => void;
	readonly setHeldBy: (holder: LockHolder | null) => void;
	readonly setDoing: (entries: DoingEntry[]) => void;
}

/** The core's surface for the hook. */
interface PaneCore<Transport extends WorkbenchTransportPort> {
	readonly projection: SceneProjection;
	readonly connect: () => void;
	readonly publishStatus: () => void;
	/** The pane's facets the server hears about changed: report again. */
	readonly facetsChanged: () => void;
	readonly paneElementChanged: () => void;
	readonly takeBack: () => Promise<TakeBackResult>;
	readonly handleChange: (elements: readonly ExcalidrawElement[], appState: AppState) => void;
	readonly handleLibraryChange: (items: LibraryItems) => void;
	readonly applyLibrary: (items: LibraryItems) => void;
	readonly markInteracted: () => void;
	readonly flushWithBeacon: () => void;
	readonly workbenchTransport: () => Transport | null;
	readonly dispose: () => void;
}

/**
 * Wire one pane.
 * @param host What the core reads from React and writes back to it.
 * @returns The core.
 */
function createPaneCore<Transport extends WorkbenchTransportPort>(
	host: PaneCoreHost<Transport>,
): PaneCore<Transport> {
	const { paneId, clientId } = host;
	let disposed = false;
	// Whether a socket has ever opened here: what tells a reconnection apart.
	let openedBefore = false;
	/**
	 * Whether this pane is still mounted.
	 * @returns True until disposed.
	 */
	const live = (): boolean => !disposed;
	const paneReportDeadline = createPaneReportDeadline();
	const librarySync = createPaneLibrarySync();

	/**
	 * Tell the shell what this pane is, now.
	 * @param snapshot The pane's status.
	 */
	function onStatus(snapshot: PaneStatus): void {
		host.options().onStatus(snapshot);
	}

	const { live: status, publish: publishStatus } = createPaneStatus({
		paneId,
		clientId,
		api: host.api,
		onStatus,
	});

	/**
	 * The board this pane holds.
	 * @returns Its key, or null.
	 */
	function boardKey(): string | null {
		return status.boardKey;
	}

	/**
	 * Who holds the board when it is not this pane.
	 * @param holder The holder, or null when free or ours.
	 */
	function setHolder(holder: LockHolder | null): void {
		host.setHeldBy(holder);
		host.options().onHolder?.(paneId, status.boardKey, holder);
	}

	/**
	 * Record connection health and say so.
	 * @param connected Whether the pane is registered and connected.
	 */
	function setConnected(connected: boolean): void {
		status.connected = connected;
		host.setConnected(connected);
		publishStatus();
	}

	/**
	 * Whether the person's edits have not all reached the server yet.
	 * @returns True while anything is pending, scheduled or in flight.
	 */
	function pending(): boolean {
		return reporting.hasPendingChanges() || !reporting.settled();
	}

	/**
	 * An agent's claim stands where the person just edited: the note decides (ADR 0022).
	 * @param reply The refusal, with the note's document when it carried one.
	 */
	function onClaimRefused(reply: HoldReply): void {
		reporting.withdrawForClaim(reply);
	}

	const holdKeeper = createHoldKeeper({
		clientId,
		boardKey,
		pending,
		deadline: createHoldRenewalDeadline(),
		holdBoard,
		releaseBoard,
		onHolder: setHolder,
		onClaimRefused,
		unknownHolder: UNKNOWN_HOLDER,
	});

	/**
	 * Remember whether the board has stopped saving (ADR 0006).
	 * @param hold The hold, or null when it is saving again.
	 */
	function setHold(hold: BoardHold | null): void {
		status.hold = hold;
	}

	/**
	 * The person's unwritten edit was withdrawn and the note's state shown.
	 * @param reason Why: the note moved, or a claim stands.
	 */
	function editsWithdrawn(reason: EditWithdrawalReason): void {
		host.options().onEditsWithdrawn?.(paneId, status.boardKey, reason);
	}

	/**
	 * The note version the pane states on its writes changed; the shell's own
	 * writes for this pane state it too.
	 * @param version The version, or null.
	 */
	function noteVersionChanged(version: number | null): void {
		status.noteVersion = version;
	}

	const reporting = createReporting({
		clientId,
		api: host.api,
		boardKey,
		takeHold: holdKeeper.takeHold,
		releaseIfIdle: holdKeeper.releaseIfIdle,
		noteChange,
		publishStatus: publishAll,
		setHold,
		editsWithdrawn,
		noteVersionChanged,
		stage: host.paneElement,
	});

	/**
	 * Publish the selection to the server.
	 * @param ids The selected ids.
	 */
	async function sendSelection(ids: readonly string[]): Promise<void> {
		await publishSelection(ids, clientId);
	}

	const selection = createSelectionPublisher({ send: sendSelection });

	/**
	 * The theme the shell chose.
	 * @returns The theme.
	 */
	function theme(): CanvasTheme {
		return host.options().theme;
	}

	/**
	 * Excalidraw's own menu changed the theme.
	 * @param next The theme.
	 */
	function onThemeChange(next: CanvasTheme): void {
		host.options().onThemeChange?.(next);
	}

	/**
	 * The selection changed.
	 * @param id The pane.
	 * @param snapshot The selection.
	 */
	function onSelection(id: string, snapshot: PaneSelectionSnapshot): void {
		host.options().onSelection?.(id, snapshot);
	}

	/**
	 * Path focus changed.
	 * @param id The pane.
	 * @param snapshot The focus.
	 */
	function onPathFocus(id: string, snapshot: PanePathFocusSnapshot): void {
		host.options().onPathFocus?.(id, snapshot);
	}

	/**
	 * The overlay changed.
	 * @param id The pane.
	 * @param overlay The overlay, or null.
	 */
	function onPathFocusOverlay(id: string, overlay: PathFocusOverlay | null): void {
		host.options().onPathFocusOverlay?.(id, overlay);
	}

	const projection = createSceneProjection({
		paneId,
		api: host.api,
		boardKey,
		stage: host.paneElement,
		theme,
		onThemeChange,
		onSelection,
		onPathFocus,
		onPathFocusOverlay,
	});

	/** Status changed and the displayed scene may have too. */
	function publishAll(): void {
		publishStatus();
		schedulePaneReport(false);
	}

	/** The board changed under this pane, from either direction. */
	function noteChange(): void {
		status.lastChangeAt = new Date().toISOString();
		publishAll();
	}

	/**
	 * Report what this pane shows, after the debounce or now.
	 * @param immediate Send now rather than after `PANE_DEBOUNCE_MS`.
	 */
	function schedulePaneReport(immediate: boolean): void {
		// A pane being removed has nothing to say about its displayed scene.
		if (!disposed) {
			paneReportDeadline.schedule(paneReports.send, immediate);
		}
	}

	/**
	 * This pane is on a board: the one the server addressed to it.
	 * @param key The board key.
	 * @param identity Its identity, when the server sent one.
	 */
	function adoptBoard(key: string | undefined, identity: BoardIdentity | undefined): void {
		if (key === undefined || key === "") {
			return;
		}
		const changed = status.boardKey !== key;
		if (changed) {
			leaveBoard();
		}
		status.boardKey = key;
		status.board = identity ?? { board: key, variant: "current" };
		host.setBoardKey(key);
		host.setBoard(status.board);
		if (changed) {
			// The board we are arriving at is somebody else's until we are told it
			// is not; the server sends that immediately behind the board (ADR 0016).
			setHolder(UNKNOWN_HOLDER);
			projection.boardChanged();
		}
		publishStatus();
		// Immediately, not on the debounce: `panes` is read every turn.
		schedulePaneReport(true);
	}

	/**
	 * Reports scheduled for the previous board cannot run on the next board,
	 * and a hold belongs to the board it was taken on.
	 */
	function leaveBoard(): void {
		reporting.dispatch({ type: "board_adopted" });
		holdKeeper.boardLeft();
		selection.reset();
	}

	/** A hold recovery ended the gesture: the board is saving again. */
	function releaseRecoveredHold(): void {
		status.hold = null;
		holdKeeper.recover();
		publishStatus();
	}

	/**
	 * The note was written elsewhere, or agrees again (TASK-062).
	 * @param notice The notice, or null.
	 */
	function setWrittenElsewhere(notice: NoteWrittenElsewhere | null): void {
		status.writtenElsewhere = notice;
	}

	/**
	 * What an agent said it was doing (TASK-095).
	 * @param entries The last few, oldest first.
	 */
	function setDoing(entries: DoingEntry[]): void {
		status.doing = entries;
		host.setDoing(entries);
	}

	const messageContext = createMessageContext<Transport>({
		paneId,
		clientId,
		options: host.options,
		api: host.api,
		boardKey,
		reporting,
		holdKeeper,
		adoptBoard,
		noteChange,
		publishStatus,
		setHold,
		setWrittenElsewhere,
		setDoing,
		setHolder,
		releaseRecoveredHold,
	});

	/**
	 * Attach the workbench to a freshly registered socket, if this pane carries one.
	 * @param generation The socket generation that opened.
	 */
	function attachWorkbench(generation: PaneSocketGeneration): void {
		const sockets = host.workbenchSockets;
		if (sockets !== null) {
			attachWorkbenchOwner({ sockets, generation, connector, live, publishStatus });
		}
	}

	/**
	 * The socket opened. The immediate pane report resolves the registration
	 * only after the server has accepted this socket's pane; a workbench
	 * subscription before that point is refused by the gateway.
	 * @param generation The socket generation.
	 */
	function socketOpened(generation: PaneSocketGeneration): void {
		attachWorkbench(generation);
		const returning = openedBefore;
		openedBefore = true;
		status.connected = true;
		host.setConnected(true);
		// The server retires a pane when its socket closes, so a reconnection
		// re-announces this one even though nothing about it changed.
		paneReports.forget();
		publishAll();
		// Only for a socket that came back: what changed while it was down was
		// never announced, so whoever caches an answer from this server is told
		// to ask again (TASK-167). The first connection has nothing stale yet.
		if (returning) {
			host.options().onPaneReconnected?.(paneId);
		}
	}

	/**
	 * A message arrived.
	 * @param data The message.
	 */
	function socketMessage(data: Parameters<typeof handleSocketMessage>[1]): void {
		if (host.api()) {
			void handleSocketMessage(messageContext, data);
		}
	}

	/** The current socket closed or errored. */
	function socketLost(): void {
		setConnected(false);
	}

	/**
	 * A socket closed, current or not; the workbench must release it either way.
	 * @param socket The socket.
	 */
	function socketRetired(socket: WebSocket): void {
		void host.workbenchSockets?.detach(socket).catch(() => undefined);
	}

	const connector = createPaneSocketConnector(clientId, {
		opened: socketOpened,
		message: socketMessage,
		closed: socketLost,
		retired: socketRetired,
		errored: socketLost,
	});

	/**
	 * Whether this pane is the primary one.
	 * @returns True when primary.
	 */
	function primary(): boolean {
		return host.options().primary;
	}

	/**
	 * Whether this pane is the one the human last touched.
	 * @returns True when focused.
	 */
	function focused(): boolean {
		return host.options().focused;
	}

	const paneReports = createPaneReportSender({
		paneId,
		clientId,
		api: host.api,
		boardKey,
		paneElement: host.paneElement,
		primary,
		focused,
		connector,
		setConnected,
		listeners: host.options,
	});

	/**
	 * The person releases an agent's claim on their board: the one explicit
	 * control over a claimed board (ADR 0022). Nothing is undone; the board goes
	 * to nobody, and the agent is told once that it lost the board.
	 * @returns Whether the claim was released.
	 */
	async function takeBack(): Promise<TakeBackResult> {
		const target = status.boardKey;
		try {
			await takeBoardBack(target, clientId);
			if (status.boardKey !== target) {
				return { outcome: "failure" };
			}
			// Released, or nobody claimed it any more: the board is free either
			// way, and the broadcast says so too.
			setHolder(null);
			return { outcome: "success" };
		} catch {
			return { outcome: "failure" };
		}
	}

	/**
	 * Excalidraw's onChange: camera, selection and content alike.
	 * @param elements The elements Excalidraw supplied.
	 * @param appState Excalidraw's app state.
	 */
	function handleChange(elements: readonly ExcalidrawElement[], appState: AppState): void {
		projection.changed(appState);
		// A pane nobody has touched does not speak for the human (a fresh second pane must not wipe a selection).
		if (reporting.userInteracted()) {
			selection.publish(selectedIds(appState));
		}
		// Classify content from what Excalidraw supplied before any hold or report; a pan never takes a board.
		reporting.sceneChanged(sceneFromExcalidraw(elements));
		// Scrolling and zooming reach the server nowhere else.
		schedulePaneReport(false);
	}

	/**
	 * Excalidraw reported its palette.
	 * @param items The palette.
	 */
	function handleLibraryChange(items: LibraryItems): void {
		librarySync.reported(items);
		host.options().onLibraryChange?.(items);
	}

	/**
	 * Push the shell's palette into this pane's Excalidraw.
	 * @param items The palette.
	 */
	function applyLibrary(items: LibraryItems): void {
		librarySync.apply(host.api(), items);
	}

	/** The person touched the pane. */
	function markInteracted(): void {
		reporting.dispatch({ type: "user_interacted" });
	}

	/** The pane's facets the server hears about changed. */
	function facetsChanged(): void {
		schedulePaneReport(false);
	}

	/** The element the canvas fills changed or resized. */
	function paneElementChanged(): void {
		schedulePaneReport(false);
		projection.refreshOverlay();
	}

	/**
	 * The transport retained by the current canvas socket generation.
	 * @returns The transport, or null.
	 */
	function workbenchTransport(): Transport | null {
		return host.workbenchSockets?.current()?.transport ?? null;
	}

	/** The pane is closing. */
	function dispose(): void {
		disposed = true;
		reporting.dispatch({ type: "reports_cancelled" });
		selection.dispose();
		paneReportDeadline.cancel();
		holdKeeper.dispose();
		// Closing the socket is also how this pane stops being reported: the
		// server drops it on the close.
		const sockets = host.workbenchSockets;
		if (sockets === null) {
			connector.close();
			return;
		}
		void sockets.dispose().finally(connector.close);
	}

	return {
		projection,
		connect: connector.connect,
		publishStatus,
		facetsChanged,
		paneElementChanged,
		takeBack,
		handleChange,
		handleLibraryChange,
		applyLibrary,
		markInteracted,
		flushWithBeacon: reporting.flushWithBeacon,
		workbenchTransport,
		dispose,
	};
}

export { createPaneCore, type PaneCore, type PaneCoreHost };
