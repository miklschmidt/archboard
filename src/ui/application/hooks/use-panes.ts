// The panes as React state: the list, the records collected from each session,
// and the one stable host every session reports into. Callbacks that belong to
// other owners (boards, notices, theme, workbench) are bound live each render,
// so a session never has to be re-optioned for them.

import { useCallback, useMemo, useState } from "react";

import type { CodeTargetNotice } from "@/shared/code-target";
import { LiveBinding } from "@/ui/application/lib/live-binding";
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
import type { PaneSessionOptions } from "@/ui/pane-session";
import type { AgentActivityEntry, LockHolder, PaneStatus } from "@/ui/types";
import type { BrowserWorkbenchTransport } from "@/ui/workbench-transport";

/** What other owners hear from the panes; bound live each render. */
interface PaneEvents {
	readonly onBoardError: (paneId: string, error: string) => void;
	/** Which boards an agent is working on, across the server (ADR 0022). */
	readonly onAgentActivity: (activity: readonly AgentActivityEntry[]) => void;
	readonly onStaleFrontend: (message: string) => void;
	readonly onCodeTargetNotice: (notice: CodeTargetNotice) => void;
	readonly onPaneStateAccepted: () => void;
	/** A pane's socket came back after being lost; nothing it cached is trustworthy. */
	readonly onPaneReconnected: (paneId: string) => void;
	/** A pane has gone and the server has dropped it; the inventory has moved. */
	readonly onPaneRetired: (paneId: string) => void;
	/** A pane's status was published; the workbench re-reads its transport. */
	readonly onStatusPublished: (paneId: string) => void;
	/** The server moved a pane onto a board, which the address bar records. */
	readonly onBoardAdopted: (paneId: string, boardKey: string) => void;
	/** A pane reported its session, or went. */
	readonly onSession: (paneId: string, session: PaneSession | null) => void;
}

/** The session callbacks every pane shares; stable for the application's life. */
type PaneHost = Required<
	Pick<
		PaneSessionOptions<BrowserWorkbenchTransport>,
		| "onStatus"
		| "onHolder"
		| "onPaneStateAccepted"
		| "onPaneReconnected"
		| "onPaneRetired"
		| "onStaleFrontend"
		| "onCodeTargetNotice"
		| "onAgentActivity"
		| "onBoardAdopted"
	>
> & {
	/** A board could not be shown in one pane. */
	readonly onBoardError: (paneId: string, error: string) => void;
	/**
	 * The server asked the shell for another pane, or for one to go. Carried
	 * with the pane it is about, because a close names the pane to close.
	 * @param paneId The pane that heard the request.
	 * @param request Which way the layout should move.
	 */
	readonly onLayoutRequest: (paneId: string, request: "open" | "close") => void;
	readonly onSession: (paneId: string, session: PaneSession | null) => void;
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
	readonly add: () => boolean;
	readonly close: (paneId: string) => boolean;
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
	 * The server asks for another pane, or for one to go.
	 * @param paneId The pane that heard the request.
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
		 * A board could not be shown.
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
		 * The server moved a pane onto a board.
		 * @param paneId The pane.
		 * @param boardKey The board it is showing now.
		 */
		onBoardAdopted: (paneId: string, boardKey: string): void => {
			events.read().onBoardAdopted(paneId, boardKey);
		},
		onSession,
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

	const patch = useCallback((paneId: string, next: Partial<PaneRecord>): void => {
		setRecords((current) => patchRecord(current, paneId, next));
	}, []);
	const add = useCallback((): boolean => moves.add(), [moves]);
	// A close the list refuses — the last pane, or one that is not open — leaves
	// the pane running, so its record stays with it. Only a close that happens
	// forgets anything.
	const close = useCallback(
		(paneId: string): boolean => {
			if (!moves.close(paneId)) {
				return false;
			}
			setRecords((current) => dropRecord(current, paneId));
			return true;
		},
		[moves],
	);
	const select = useCallback((paneId: string): boolean => moves.select(paneId), [moves]);
	const [host] = useState(() => createPaneHost({ patch, events, handles, add, close }));
	const bindEvents = useCallback((next: PaneEvents): void => events.bind(next), [events]);
	const active = recordFor(records, list.activePaneId);
	return useMemo(
		() => ({ list, records, handles, host, add, close, select, patch, active, bindEvents }),
		[list, records, handles, host, add, close, select, patch, active, bindEvents],
	);
}

export { usePanes, type PaneEvents, type PaneHost, type Panes };
