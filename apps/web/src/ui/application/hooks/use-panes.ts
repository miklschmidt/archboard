// The panes as React state: the list, the records collected from each session,
// and the one stable callbacks every session reports into. Callbacks that belong to
// other owners (models, notices, theme, workbench) are bound live each render,
// so a session never has to be re-optioned for them.

import { useCallback, useMemo, useState } from "react";

import type { CodeTargetNotice } from "@archboard/code-opener/opening";
import type { BrowserWorkbenchTransport } from "@archboard/codex-realtime-voice/controllers";
import { LiveBinding } from "#ui/application/state/live-binding.ts";
import { initialPaneList, type PaneList } from "#ui/application/rules/pane-list.ts";
import { createPaneMoves } from "#ui/application/state/pane-moves.ts";
import {
	PaneHandles,
	type BrowserWorkbenchMediaOwnerOptions,
	type PaneSession,
} from "#ui/application/state/pane-handles.ts";
import {
	dropRecord,
	patchRecord,
	recordFor,
	type PaneRecord,
	type PaneRecords,
} from "#ui/application/rules/pane-records.ts";
import type { PaneSessionOptions } from "#ui/panes/pane-session/rules/session-contracts.ts";
import type { AgentActivityEntry, PaneStatus } from "#ui/panes/pane-session/rules/session-types.ts";

/** What other owners hear from the panes; bound live each render. */
interface PaneEvents {
	readonly onModelError: (paneId: string, error: string) => void;
	/** Which models an agent is working on in one vault (ADR 0022). */
	readonly onAgentActivity: (vault: string, activity: readonly AgentActivityEntry[]) => void;
	/** A checkout was chosen somewhere, so the repositories are read again (ADR 0050). */
	readonly onRepositoriesChanged: () => void;
	readonly onStaleFrontend: (message: string) => void;
	readonly onCodeTargetNotice: (notice: CodeTargetNotice) => void;
	/** A pane's socket came back after being lost; nothing it cached is trustworthy. */
	readonly onPaneReconnected: (paneId: string) => void;
	/** A pane's status was published; the workbench re-reads its transport. */
	readonly onStatusPublished: (paneId: string) => void;
	/** The server moved a pane onto a model, which the address bar records. */
	readonly onModelAdopted: NonNullable<
		PaneSessionOptions<BrowserWorkbenchTransport>["onModelAdopted"]
	>;
	/** A pane reported its session, or went. */
	readonly onSession: (paneId: string, session: PaneSession | null) => void;
}

/** The session callbacks every pane shares; stable for the application's life. */
type PaneCallbacks = Required<
	Pick<
		PaneSessionOptions<BrowserWorkbenchTransport>,
		| "onStatus"
		| "onPaneReconnected"
		| "onStaleFrontend"
		| "onCodeTargetNotice"
		| "onAgentActivity"
		| "onRepositoriesChanged"
		| "onModelAdopted"
	>
> & {
	/** A model could not be shown in one pane. */
	readonly onModelError: (paneId: string, error: string) => void;
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
	readonly callbacks: PaneCallbacks;
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
	 * Bind the events the callbacks forwards to. Called during render, after the
	 * owners exist, so a callback fired from a child's effect sees them.
	 */
	readonly bindEvents: (events: PaneEvents) => void;
}

/** The setters the callbacks writes through. */
interface CallbackSetters {
	readonly patch: (paneId: string, patch: Partial<PaneRecord>) => void;
	readonly events: LiveBinding<PaneEvents>;
	readonly handles: PaneHandles;
	readonly add: () => boolean;
	readonly close: (paneId: string) => boolean;
}

/**
 * The one callbacks every session reports into.
 * @param setters Where the callbacks writes.
 * @returns The callbacks.
 */
function createPaneCallbacks(setters: CallbackSetters): PaneCallbacks {
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
		onLayoutRequest,
		/**
		 * A pane's socket came back.
		 * @param paneId The pane.
		 */
		onPaneReconnected: (paneId: string): void => {
			events.read().onPaneReconnected(paneId);
		},
		/**
		 * A model could not be shown.
		 * @param paneId The pane.
		 * @param error The refusal.
		 */
		onModelError: (paneId: string, error: string): void => {
			events.read().onModelError(paneId, error);
		},
		/**
		 * This tab runs a bundle the server no longer serves.
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
		 * Which models an agent is working on in one vault.
		 * @param vault The vault.
		 * @param activity The whole snapshot.
		 */
		onAgentActivity: (vault: string, activity: readonly AgentActivityEntry[]): void => {
			events.read().onAgentActivity(vault, activity);
		},
		/** A checkout was chosen somewhere. */
		onRepositoriesChanged: (): void => {
			events.read().onRepositoriesChanged();
		},
		/**
		 * The server moved a pane onto a model.
		 * @param paneId The pane.
		 * @param paneKey The model it is showing now.
		 * @param previousKey The model key it left, or null on first adoption.
		 */
		onModelAdopted: (paneId: string, paneKey: string, previousKey: string | null): void => {
			events.read().onModelAdopted(paneId, paneKey, previousKey);
		},
		onSession,
	};
}

/**
 * The panes.
 * @param initial The list to start with, which the address bar seeds from the
 *   URL so a restored comparison mounts both panes in its first render.
 * @param media What each pane's media owner is made with, read once.
 * @returns The panes, their records and the moves.
 */
function usePanes(
	initial: () => PaneList = initialPaneList,
	media?: BrowserWorkbenchMediaOwnerOptions,
): Panes {
	const [list, setList] = useState<PaneList>(initial);
	// The moves read the list as it is when somebody acts, rather than as it was
	// when their callback was made: the pane callbacks keeps these for the
	// application's life, and the server asks it to close panes opened since.
	const [moves] = useState(() => createPaneMoves(list, setList));
	const [records, setRecords] = useState<PaneRecords>({});
	const [handles] = useState(() => new PaneHandles(media));
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
	const [callbacks] = useState(() => createPaneCallbacks({ patch, events, handles, add, close }));
	const bindEvents = useCallback((next: PaneEvents): void => events.bind(next), [events]);
	const active = recordFor(records, list.activePaneId);
	return useMemo(
		() => ({ list, records, handles, callbacks, add, close, select, patch, active, bindEvents }),
		[list, records, handles, callbacks, add, close, select, patch, active, bindEvents],
	);
}

export { usePanes, type PaneEvents, type PaneCallbacks, type Panes };
