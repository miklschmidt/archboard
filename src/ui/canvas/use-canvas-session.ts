// One canvas's session, as a React hook keyed by pane. Everything that makes
// a canvas be the application lives in the pane core; this hook owns the React
// state the shell renders from and the lifecycle around it. Hosting a second
// pane is mounting a second session, not copying any of this.

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, ExcalidrawImperativeAPI, LibraryItems } from "@excalidraw/excalidraw/types";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { CodeTargetNotice } from "@/shared/code-target";
import { createCanvasLinkHandler } from "@/ui/canvas/lib/link-handler";
import { createPaneCore, type PaneCore, type PaneCoreHost } from "@/ui/canvas/lib/pane-core";
import { usePaneContact, type PaneContact } from "@/ui/canvas/use-pane-contact";
import { SessionBox } from "@/ui/canvas/lib/session-box";
import {
	UNKNOWN_HOLDER,
	type CanvasSession,
	type CanvasSessionOptions,
	type CanvasTheme,
	type PanePathFocusSnapshot,
	type PaneSelectionSnapshot,
	type TakeBackResult,
} from "@/ui/canvas/lib/session-contracts";
import type { WorkbenchTransportPort } from "@/ui/canvas/workbench-port";
import { activateCodeTarget } from "@/ui/code-target";
import { agentClaim, type BoardIdentity, type DoingEntry, type LockHolder } from "@/ui/types";

/**
 * A client id for one pane: the pane, plus enough randomness that two tabs
 * on the same pane id do not read as one client.
 * @param paneId The pane.
 * @returns The client id.
 */
function mintClientId(paneId: string): string {
	return `${paneId}-${Math.random().toString(36).slice(2, 8)}`;
}

/** The React state a session renders from. */
interface SessionState {
	contact: PaneContact;
	setConnected: (connected: boolean) => void;
	board: BoardIdentity | null;
	setBoard: (board: BoardIdentity | null) => void;
	boardKey: string | null;
	setBoardKey: (key: string | null) => void;
	heldBy: LockHolder | null;
	setHeldBy: (holder: LockHolder | null) => void;
	doing: DoingEntry[];
	setDoing: (entries: DoingEntry[]) => void;
}

/**
 * The React state a session renders from.
 * @returns The state cells and their setters.
 */
function useSessionState(): SessionState {
	const { contact, setConnected } = usePaneContact();
	const [board, setBoard] = useState<BoardIdentity | null>(null);
	const [boardKey, setBoardKey] = useState<string | null>(null);
	// It starts as somebody else's until the server says otherwise: a pane that
	// has not been told does not read the board as free (ADR 0016).
	const [heldBy, setHeldBy] = useState<LockHolder | null>(UNKNOWN_HOLDER);
	const [doing, setDoing] = useState<DoingEntry[]>([]);
	return {
		contact,
		setConnected,
		board,
		setBoard,
		boardKey,
		setBoardKey,
		heldBy,
		setHeldBy,
		doing,
		setDoing,
	};
}

/**
 * The core's host over a session box and React state.
 * @param paneId The pane.
 * @param clientId The pane's identity to the server.
 * @param box The mutable box, read only when the core is called.
 * @param state The React state setters.
 * @returns The host.
 */
function hostFor<Transport extends WorkbenchTransportPort>(
	paneId: string,
	clientId: string,
	box: SessionBox<Transport>,
	state: SessionState,
): PaneCoreHost<Transport> {
	return {
		paneId,
		clientId,
		/**
		 * The latest options.
		 * @returns The options.
		 */
		options: () => box.options,
		/**
		 * Excalidraw's API once mounted.
		 * @returns The API, or null.
		 */
		api: () => box.api,
		/**
		 * The element the canvas fills.
		 * @returns The element, or null.
		 */
		paneElement: () => box.paneElement,
		workbenchSockets: box.options.createWorkbenchSockets?.() ?? null,
		setConnected: state.setConnected,
		setBoard: state.setBoard,
		setBoardKey: state.setBoardKey,
		setHeldBy: state.setHeldBy,
		setDoing: state.setDoing,
	};
}

/**
 * One canvas's entire conversation with the server.
 * @param options What the shell tells the session, and what it wants to hear.
 * @returns The session.
 */
function useCanvasSession<Transport extends WorkbenchTransportPort>(
	options: CanvasSessionOptions<Transport>,
): CanvasSession<Transport> {
	const { paneId } = options;
	const [clientId] = useState(() => mintClientId(paneId));
	const state = useSessionState();
	const [box] = useState(() => new SessionBox<Transport>(options));
	const [core] = useState<PaneCore<Transport>>(() =>
		createPaneCore<Transport>(hostFor(paneId, clientId, box, state)),
	);

	useEffect(() => {
		box.setOptions(options);
		// What the server hears about this pane may have changed with them.
		core.facetsChanged();
	}, [box, core, options]);

	useEffect(() => {
		window.addEventListener("pagehide", core.flushWithBeacon);
		return () => {
			window.removeEventListener("pagehide", core.flushWithBeacon);
			box.unwatch();
			core.dispose();
		};
	}, [box, core]);

	const attachExcalidraw = useCallback(
		(api: ExcalidrawImperativeAPI): void => {
			box.setApi(api);
			core.connect();
		},
		[box, core],
	);
	const attachPaneElement = useCallback(
		(element: HTMLElement | null): void => {
			// Splitting the shell halves a pane without anything on the canvas
			// changing, and a pane that reported its old size would put itself
			// in the wrong place on screen.
			if (box.watch(element, core.paneElementChanged) && element) {
				core.paneElementChanged();
			}
		},
		[box, core],
	);
	const handleChange = useCallback(
		(elements: readonly ExcalidrawElement[], appState: AppState): void =>
			core.handleChange(elements, appState),
		[core],
	);
	const handleLibraryChange = useCallback(
		(items: LibraryItems): void => core.handleLibraryChange(items),
		[core],
	);
	const applyLibrary = useCallback((items: LibraryItems): void => core.applyLibrary(items), [core]);
	const markInteracted = useCallback((): void => core.markInteracted(), [core]);
	const takeBack = useCallback((): Promise<TakeBackResult> => core.takeBack(), [core]);
	const focusPath = useCallback((): void => core.projection.focusPath(), [core]);
	const exitPathFocus = useCallback((): void => core.projection.exitPathFocus(), [core]);
	const clearSelection = useCallback((): void => core.projection.clearSelection(), [core]);
	const workbenchTransport = useCallback((): Transport | null => core.workbenchTransport(), [core]);
	const onFailure = useCallback(
		(notice: CodeTargetNotice): void => box.options.onCodeTargetNotice?.(notice),
		[box],
	);
	const openCode = useCallback(
		(elementId: string): void => {
			activateCodeTarget({ boardKey: state.boardKey, elementId, onSuccess: noop, onFailure });
		},
		[onFailure, state.boardKey],
	);
	const handleLinkOpen = useMemo(
		() =>
			createCanvasLinkHandler({
				boardKey: state.boardKey,
				clientId,
				onSuccess: noop,
				onFailure,
				/**
				 * Send a board-link failure to the current shell.
				 * @param error The failure and recovery guidance.
				 */
				onBoardLinkError: (error: string): void => {
					box.options.onBoardLinkError?.(error);
				},
			}),
		[box, clientId, onFailure, state.boardKey],
	);

	return {
		clientId,
		attachExcalidraw,
		attachPaneElement,
		boardKey: state.boardKey,
		board: state.board,
		connected: state.contact.connected,
		// An agent's claim makes the board read-only to people while it stands
		// (ADR 0022); a passing write does not, and neither does a socket blip:
		// an edit made out of contact is refused and reconciled like any other,
		// so only contact lost for longer than one reconnect takes the canvas
		// away. UNKNOWN_HOLDER is not a claim, so a fresh pane is editable.
		readOnly: agentClaim(state.heldBy) !== null || state.contact.lost,
		heldBy: state.heldBy,
		doing: state.doing,
		handleChange,
		handleLibraryChange,
		applyLibrary,
		markInteracted,
		takeBack,
		focusPath,
		exitPathFocus,
		clearSelection,
		openCode,
		handleLinkOpen,
		previewController: core.projection.previewController,
		workbenchTransport,
	};
}

/** A success nobody needs to hear about: the opener has already opened. */
function noop(): void {
	// Nothing to do.
}

export {
	useCanvasSession,
	type CanvasSession,
	type CanvasSessionOptions,
	type CanvasTheme,
	type PanePathFocusSnapshot,
	type PaneSelectionSnapshot,
	type TakeBackResult,
};
