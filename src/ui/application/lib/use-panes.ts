// The panes as React state: the list, the records collected from each
// session, and the one stable host every session reports into. Callbacks that
// belong to other owners (boards, notices, library, theme, workbench) are
// bound live each render, so a session never has to be re-optioned for them.

import type { LibraryItems } from "@excalidraw/excalidraw/types";
import { useCallback, useMemo, useState } from "react";

import type { CodeTargetNotice } from "@/shared/code-target";
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
import type { LockHolder, PaneStatus } from "@/ui/types";
import type { BrowserWorkbenchTransport } from "@/ui/workbench-transport";

/** What other owners hear from the panes; bound live each render. */
interface PaneEvents {
	readonly onBoardError: (paneId: string, error: string) => void;
	readonly onStaleFrontend: (message: string) => void;
	readonly onCodeTargetNotice: (notice: CodeTargetNotice) => void;
	readonly onThemeChange: (theme: CanvasTheme) => void;
	readonly onLibraryChanged: (items: LibraryItems) => void;
	readonly onLibraryChange: (items: LibraryItems) => void;
	readonly onPaneStateAccepted: () => void;
	/** A pane's status was published; the workbench re-reads its transport. */
	readonly onStatusPublished: (paneId: string) => void;
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
	>
> & {
	/** A board note could not be rendered in one pane. */
	readonly onBoardError: (paneId: string, error: string) => void;
	readonly onSession: (paneId: string, session: PaneSession | null) => void;
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

/**
 * The events the host forwards to, replaced each render. A method rather
 * than a ref because the host reads it from callbacks, never from render.
 */
class LiveEvents {
	#current: PaneEvents | null = null;

	/**
	 * Bind the current events.
	 * @param events The events.
	 */
	bind(events: PaneEvents): void {
		this.#current = events;
	}

	/**
	 * The current events.
	 * @returns The events.
	 * @throws {Error} When nothing was bound; sessions only call after the first render.
	 */
	read(): PaneEvents {
		if (this.#current === null) {
			throw new Error("The pane events are bound after the first render.");
		}
		return this.#current;
	}
}

/** The setters the host writes through. */
interface HostSetters {
	readonly patch: (paneId: string, patch: Partial<PaneRecord>) => void;
	readonly events: LiveEvents;
	readonly handles: PaneHandles;
	readonly add: () => void;
	readonly close: (paneId: string) => void;
}

/**
 * The one host every session reports into.
 * @param setters Where the host writes.
 * @returns The host.
 */
function createPaneHost(setters: HostSetters): PaneHost {
	const { patch, events, handles } = setters;
	/**
	 * A pane said what it is.
	 * @param status The status.
	 */
	function onStatus(status: PaneStatus): void {
		patch(status.paneId, { status });
		events.read().onStatusPublished(status.paneId);
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
		onSession,
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
	const [events] = useState(() => new LiveEvents());

	const patch = useCallback((paneId: string, next: Partial<PaneRecord>): void => {
		setRecords((current) => patchRecord(current, paneId, next));
	}, []);
	const add = useCallback((): void => setList(addPane), []);
	const close = useCallback((paneId: string): void => {
		setList((current) => closePane(current, paneId));
		setRecords((current) => dropRecord(current, paneId));
	}, []);
	const select = useCallback(
		(paneId: string): void => {
			setList((current) => selectPane(current, paneId));
			handles.session(paneId)?.markInteracted();
		},
		[handles],
	);
	const [host] = useState(() => createPaneHost({ patch, events, handles, add, close }));
	const bindEvents = useCallback((next: PaneEvents): void => events.bind(next), [events]);
	const active = recordFor(records, list.activePaneId);
	return useMemo(
		() => ({ list, records, handles, host, add, close, select, patch, active, bindEvents }),
		[list, records, handles, host, add, close, select, patch, active, bindEvents],
	);
}

export { usePanes, type PaneEvents, type PaneHost, type Panes };
