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
import {
	addPane,
	closePane,
	initialPaneList,
	selectPane,
	type PaneList,
} from "@/ui/application/pane-list";
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
import type { PathFocusOverlay } from "@/ui/path-focus";
import type { RecoveryKind } from "@/ui/shell";
import type { AgentActivityEntry, EditWithdrawalReason, LockHolder, PaneStatus } from "@/ui/types";
import type { BrowserWorkbenchTransport } from "@/ui/workbench-transport";

/** What other owners hear from the panes; bound live each render. */
interface PaneEvents {
	readonly onBoardError: (paneId: string, error: string) => void;
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
		| "onStaleFrontend"
		| "onThemeChange"
		| "onSelection"
		| "onPathFocus"
		| "onPathFocusOverlay"
		| "onCodeTargetNotice"
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
	readonly add: () => void;
	readonly close: (paneId: string) => void;
	readonly select: (paneId: string) => void;
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
	readonly add: () => void;
	readonly close: (paneId: string) => void;
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
		 * A board note could not be rendered.
		 * @param paneId The pane.
		 * @param error The refusal.
		 */
		onBoardError: (paneId: string, error: string): void => {
			events.read().onBoardError(paneId, error);
		},
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
 * @returns The panes, their records and the moves.
 */
function usePanes(): Panes {
	const [list, setList] = useState<PaneList>(initialPaneList);
	const [records, setRecords] = useState<PaneRecords>({});
	const [handles] = useState(() => new PaneHandles());
	const [events] = useState(() => new LiveBinding<PaneEvents>());
	const [recovery] = useState(() => new NoteRecoveryMemory());

	const patch = useCallback((paneId: string, next: Partial<PaneRecord>): void => {
		setRecords((current) => patchRecord(current, paneId, next));
	}, []);
	const add = useCallback((): void => setList(addPane), []);
	const close = useCallback(
		(paneId: string): void => {
			setList((current) => closePane(current, paneId));
			setRecords((current) => dropRecord(current, paneId));
			recovery.forget(paneId);
		},
		[recovery],
	);
	const select = useCallback(
		(paneId: string): void => {
			setList((current) => selectPane(current, paneId));
			handles.session(paneId)?.markInteracted();
		},
		[handles],
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
