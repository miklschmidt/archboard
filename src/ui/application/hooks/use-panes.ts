// The panes as React state: the list, the records collected from each
// session, and the one stable host every session reports into. Callbacks that
// belong to other owners (boards, notices, library, theme, workbench) are
// bound live each render, so a session never has to be re-optioned for them.

import type { LibraryItems } from "@excalidraw/excalidraw/types";
import { useCallback, useMemo, useState } from "react";

import type { CodeTargetNotice } from "@/shared/code-target";
import { LiveBinding } from "@/ui/application/lib/live-binding";
import {
	NoteRecoveryMemory,
	type NoteStateChange,
	type PendingRecovery,
} from "@/ui/application/note-recovery";
import { initialPaneList, type PaneList } from "@/ui/application/pane-list";
import { createPaneMoves } from "@/ui/application/pane-moves";
import { PaneHandles, type PaneSession } from "@/ui/application/lib/pane-handles";
import {
	dropRecord,
	patchRecord,
	recordFor,
	type PaneRecord,
	type PaneRecords,
} from "@/ui/application/pane-records";
import type {
	CanvasSessionOptions,
	CanvasTheme,
	PanePathFocusSnapshot,
	PaneSelectionSnapshot,
} from "@/ui/canvas/use-canvas-session";
import type { BoardMove } from "@/ui/canvas/board-links";
import type { PathFocusOverlay } from "@/ui/path-focus";
import type { RecoveryKind } from "@/ui/shell";
import type { AgentActivityEntry, EditWithdrawalReason, LockHolder, PaneStatus } from "@/ui/types";
import type { BrowserWorkbenchTransport } from "@/ui/workbench-transport";

/** What other owners hear from the panes; bound live each render. */
interface PaneEvents {
	readonly onBoardError: (paneId: string, error: string) => void;
	readonly onBoardLinkError: (error: string) => void;
	/**
	 * A pane is following a board link; whether it may move is one rule for
	 * every surface, and when it may, its command waits its turn (TASK-166).
	 */
	readonly onBoardOpenRequested: (paneId: string, boardKey: string) => Promise<BoardMove | null>;
	/** Which boards an agent is working on, across the server (ADR 0022). */
	readonly onAgentActivity: (activity: readonly AgentActivityEntry[]) => void;
	/** A pane withdrew the person's unwritten edit and shows the note's state (ADR 0022). */
	readonly onEditsWithdrawn: (
		paneId: string,
		boardKey: string | null,
		reason: EditWithdrawalReason,
	) => void;
	readonly onStaleFrontend: (message: string) => void;
	readonly onCodeTargetNotice: (notice: CodeTargetNotice) => void;
	readonly onThemeChange: (theme: CanvasTheme) => void;
	readonly onLibraryChanged: (items: LibraryItems) => void;
	readonly onLibraryChange: (items: LibraryItems) => void;
	readonly onPaneStateAccepted: () => void;
	/** A pane's socket came back after being lost; nothing it cached is trustworthy. */
	readonly onPaneReconnected: (paneId: string) => void;
	/** A pane has gone and the server has dropped it; the inventory has moved. */
	readonly onPaneRetired: (paneId: string) => void;
	/** A pane's status was published; the workbench re-reads its transport. */
	readonly onStatusPublished: (paneId: string) => void;
	/**
	 * A pane's note state began or ended (ADR 0006, TASK-062), after the
	 * status was patched in and before that patch has rendered.
	 */
	readonly onNoteState: (paneId: string, status: PaneStatus, change: NoteStateChange) => void;
	/** A pane reported its session, or went. */
	readonly onSession: (paneId: string, session: PaneSession | null) => void;
}

/** The session callbacks every pane shares; stable for the application's life. */
type PaneHost = Required<
	Pick<
		CanvasSessionOptions<BrowserWorkbenchTransport>,
		| "onStatus"
		| "onHolder"
		| "onLibraryChanged"
		| "onLibraryChange"
		| "onLayoutRequest"
		| "onPaneStateAccepted"
		| "onPaneReconnected"
		| "onPaneRetired"
		| "onStaleFrontend"
		| "onThemeChange"
		| "onSelection"
		| "onPathFocus"
		| "onPathFocusOverlay"
		| "onCodeTargetNotice"
		| "onBoardLinkError"
		| "onBoardOpenRequested"
		| "onAgentActivity"
		| "onEditsWithdrawn"
	>
> & {
	/** A board note could not be rendered in one pane. */
	readonly onBoardError: (paneId: string, error: string) => void;
	readonly onSession: (paneId: string, session: PaneSession | null) => void;
	/** The first note state whose dialog has not been shown, from the statuses heard. */
	readonly pendingRecovery: () => PendingRecovery | null;
	/** A note state's dialog was shown; `marker` is the hold's `since` or the write's `writtenAt`. */
	readonly recoveryShown: (paneId: string, kind: RecoveryKind, marker: string) => void;
};

/** The panes, their records, the handles and the moves. */
interface Panes {
	readonly list: PaneList;
	readonly records: PaneRecords;
	readonly handles: PaneHandles;
	readonly host: PaneHost;
	/** Open the second pane; false when there is no pane to open. */
	readonly add: () => boolean;
	/** Close a pane; false when the list refuses, and nothing is forgotten. */
	readonly close: (paneId: string) => boolean;
	/** Focus a pane; false when it is already the focused one. */
	readonly select: (paneId: string) => boolean;
	readonly patch: (paneId: string, patch: Partial<PaneRecord>) => void;
	/** The active pane's record. */
	readonly active: PaneRecord;
	/**
	 * Bind the events the host forwards to. Called during render, after the
	 * owners exist, so a callback fired from a child's effect sees them.
	 */
	readonly bindEvents: (events: PaneEvents) => void;
}

/** The setters the host writes through. */
interface HostSetters {
	readonly patch: (paneId: string, patch: Partial<PaneRecord>) => void;
	readonly events: LiveBinding<PaneEvents>;
	readonly handles: PaneHandles;
	readonly recovery: NoteRecoveryMemory;
	readonly add: () => boolean;
	readonly close: (paneId: string) => boolean;
}

/**
 * The one host every session reports into.
 * @param setters Where the host writes.
 * @returns The host.
 */
function createPaneHost(setters: HostSetters): PaneHost {
	const { patch, events, handles, recovery } = setters;
	/**
	 * A pane said what it is. The note state transitions are reported after
	 * the patch, so a handler that opens a dialog sees the status it is for.
	 * @param status The status.
	 */
	function onStatus(status: PaneStatus): void {
		patch(status.paneId, { status });
		const current = events.read();
		current.onStatusPublished(status.paneId);
		for (const change of recovery.observe(status)) {
			current.onNoteState(status.paneId, status, change);
		}
	}
	/**
	 * Who holds a pane's board changed.
	 * @param paneId The pane.
	 * @param _boardKey The board.
	 * @param holder The holder, or null.
	 */
	function onHolder(paneId: string, _boardKey: string | null, holder: LockHolder | null): void {
		// A claim that ends takes its take-back outcome with it: the failure line
		// belongs to the claim it was about, not to the next one.
		patch(paneId, holder === null ? { holder, takeBack: { kind: "idle" } } : { holder });
	}
	/**
	 * The server asks for another pane, or for this one to go.
	 * @param paneId The pane.
	 * @param request Open or close.
	 */
	function onLayoutRequest(paneId: string, request: "open" | "close"): void {
		if (request === "open") {
			setters.add();
		} else {
			setters.close(paneId);
		}
	}
	/**
	 * A pane's selection, projected.
	 * @param paneId The pane.
	 * @param snapshot The selection.
	 */
	function onSelection(paneId: string, snapshot: PaneSelectionSnapshot): void {
		patch(paneId, { selection: snapshot.projection });
	}
	/**
	 * A pane's path focus.
	 * @param paneId The pane.
	 * @param snapshot The focus.
	 */
	function onPathFocus(paneId: string, snapshot: PanePathFocusSnapshot): void {
		patch(paneId, { pathFocus: snapshot.snapshot });
	}
	/**
	 * Where a pane's focused elements are.
	 * @param paneId The pane.
	 * @param overlay The overlay, or null.
	 */
	function onPathFocusOverlay(paneId: string, overlay: PathFocusOverlay | null): void {
		patch(paneId, { overlay });
	}
	/**
	 * A pane reported its session, or went.
	 * @param paneId The pane.
	 * @param session The session, or null.
	 */
	function onSession(paneId: string, session: PaneSession | null): void {
		handles.setSession(paneId, session);
		events.read().onSession(paneId, session);
	}
	return {
		onStatus,
		onHolder,
		/**
		 * Another tab changed the palette.
		 * @param items The palette.
		 */
		onLibraryChanged: (items: LibraryItems): void => {
			events.read().onLibraryChanged(items);
		},
		/**
		 * This pane's Excalidraw changed the palette.
		 * @param items The palette.
		 */
		onLibraryChange: (items: LibraryItems): void => {
			events.read().onLibraryChange(items);
		},
		onLayoutRequest,
		/** The server accepted a changed pane report. */
		onPaneStateAccepted: (): void => {
			events.read().onPaneStateAccepted();
		},
		/**
		 * A pane's socket came back.
		 * @param paneId The pane.
		 */
		onPaneReconnected: (paneId: string): void => {
			events.read().onPaneReconnected(paneId);
		},
		/**
		 * A pane has gone and the server has dropped it.
		 * @param paneId The pane.
		 */
		onPaneRetired: (paneId: string): void => {
			events.read().onPaneRetired(paneId);
		},
		/**
		 * A board note could not be rendered.
		 * @param paneId The pane.
		 * @param error The refusal.
		 */
		onBoardError: (paneId: string, error: string): void => {
			events.read().onBoardError(paneId, error);
		},
		/**
		 * A board link could not be followed.
		 * @param error The refusal.
		 */
		onBoardLinkError: (error: string): void => {
			events.read().onBoardLinkError(error);
		},
		/**
		 * A pane is following a board link.
		 * @param paneId The pane.
		 * @param boardKey The board the person asked for.
		 * @returns Permission to move, or null.
		 */
		onBoardOpenRequested: (paneId: string, boardKey: string): Promise<BoardMove | null> =>
			events.read().onBoardOpenRequested(paneId, boardKey),
		/**
		 * This tab runs a bundle the canvas no longer serves.
		 * @param message What the server said.
		 */
		onStaleFrontend: (message: string): void => {
			events.read().onStaleFrontend(message);
		},
		/**
		 * Excalidraw's own menu changed the theme.
		 * @param theme The theme.
		 */
		onThemeChange: (theme: CanvasTheme): void => {
			events.read().onThemeChange(theme);
		},
		onSelection,
		onPathFocus,
		onPathFocusOverlay,
		/**
		 * A code target could not be opened.
		 * @param notice The failure.
		 */
		onCodeTargetNotice: (notice: CodeTargetNotice): void => {
			events.read().onCodeTargetNotice(notice);
		},
		/**
		 * Which boards an agent is working on.
		 * @param activity The whole snapshot.
		 */
		onAgentActivity: (activity: readonly AgentActivityEntry[]): void => {
			events.read().onAgentActivity(activity);
		},
		/**
		 * A pane withdrew the person's unwritten edit.
		 * @param paneId The pane.
		 * @param boardKey Its board.
		 * @param reason Why.
		 */
		onEditsWithdrawn: (
			paneId: string,
			boardKey: string | null,
			reason: EditWithdrawalReason,
		): void => {
			events.read().onEditsWithdrawn(paneId, boardKey, reason);
		},
		onSession,
		/**
		 * The first note state whose dialog has not been shown.
		 * @returns The pending recovery, or null.
		 */
		pendingRecovery: (): PendingRecovery | null => recovery.pending(),
		/**
		 * A note state's dialog was shown.
		 * @param paneId The pane.
		 * @param kind Which state.
		 * @param marker The state's marker.
		 */
		recoveryShown: (paneId: string, kind: RecoveryKind, marker: string): void => {
			recovery.shown(paneId, kind, marker);
		},
	};
}

/**
 * The panes.
 * @param initial The list to start with, which the address bar seeds from the
 *   URL so a restored comparison mounts both panes in its first render.
 * @returns The panes, their records and the moves.
 */
function usePanes(initial: () => PaneList = initialPaneList): Panes {
	const [list, setList] = useState<PaneList>(initial);
	// The moves read the list as it is when somebody acts, rather than as it was
	// when their callback was made: the pane host keeps these for the
	// application's life, and the server asks it to close panes opened since.
	const [moves] = useState(() => createPaneMoves(list, setList));
	const [records, setRecords] = useState<PaneRecords>({});
	const [handles] = useState(() => new PaneHandles());
	const [events] = useState(() => new LiveBinding<PaneEvents>());
	const [recovery] = useState(() => new NoteRecoveryMemory());

	const patch = useCallback((paneId: string, next: Partial<PaneRecord>): void => {
		setRecords((current) => patchRecord(current, paneId, next));
	}, []);
	const add = useCallback((): boolean => moves.add(), [moves]);
	// A close the list refuses — the last pane, or one that is not open — leaves
	// the pane running, so its record and its unanswered note states stay with
	// it. Only a close that happens forgets anything.
	const close = useCallback(
		(paneId: string): boolean => {
			if (!moves.close(paneId)) {
				return false;
			}
			setRecords((current) => dropRecord(current, paneId));
			recovery.forget(paneId);
			return true;
		},
		[moves, recovery],
	);
	const select = useCallback(
		(paneId: string): boolean => {
			const moved = moves.select(paneId);
			handles.session(paneId)?.markInteracted();
			return moved;
		},
		[handles, moves],
	);
	const [host] = useState(() => createPaneHost({ patch, events, handles, recovery, add, close }));
	const bindEvents = useCallback((next: PaneEvents): void => events.bind(next), [events]);
	const active = recordFor(records, list.activePaneId);
	return useMemo(
		() => ({ list, records, handles, host, add, close, select, patch, active, bindEvents }),
		[list, records, handles, host, add, close, select, patch, active, bindEvents],
	);
}

export { usePanes, type PaneEvents, type PaneHost, type Panes };
