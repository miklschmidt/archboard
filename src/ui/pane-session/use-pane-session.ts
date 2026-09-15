// One pane's session, as a React hook keyed by pane. Everything that makes a
// pane be a client of the canvas server lives in the pane core; this hook owns
// the React state the shell renders from and the lifecycle around it. Hosting a
// second pane is mounting a second session, not copying any of this.

import { useCallback, useEffect, useState } from "react";

import { createPaneCore, type PaneCore } from "@/ui/pane-session/core";
import { usePaneContact, type PaneContact } from "@/ui/pane-session/hooks/use-pane-contact";
import type { PaneReading } from "@/ui/pane-session/lib/pane-reading";
import {
	UNKNOWN_HOLDER,
	type PaneSession,
	type PaneSessionOptions,
	type TakeBackResult,
} from "@/ui/pane-session/lib/session-contracts";
import type { WorkbenchTransportPort } from "@/ui/pane-session/workbench-port";
import type { BoardIdentity, DoingEntry, LockHolder } from "@/ui/types";

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
	/** Where the server pointed the pane; a drill-down does not move it. */
	openedKey: string | null;
	setOpened: (key: string | null) => void;
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
	const [openedKey, setOpened] = useState<string | null>(null);
	// It starts as somebody else's until the server says otherwise: a pane that
	// has not been told does not read the board as free (ADR 0016).
	const [heldBy, setHeldBy] = useState<LockHolder | null>(UNKNOWN_HOLDER);
	const [doing, setDoing] = useState<DoingEntry[]>([]);
	return {
		contact,
		setConnected,
		board,
		setBoard,
		openedKey,
		setOpened,
		heldBy,
		setHeldBy,
		doing,
		setDoing,
	};
}

/**
 * A mutable cell holding the latest options and the element the pane fills.
 *
 * Outside React state on purpose: the core reads both only at the moment it
 * needs them, and neither is anything a render is derived from. React's own
 * immutability rule is about values a component renders; this is the box those
 * values are handed through.
 */
class PaneBox<Transport extends WorkbenchTransportPort> {
	#options: PaneSessionOptions<Transport>;
	#element: HTMLElement | null = null;

	/**
	 * Hold the first options a pane was mounted with.
	 * @param options The options.
	 */
	constructor(options: PaneSessionOptions<Transport>) {
		this.#options = options;
	}

	/**
	 * The latest options the shell gave this pane.
	 * @returns The options.
	 */
	options(): PaneSessionOptions<Transport> {
		return this.#options;
	}

	/**
	 * The shell re-optioned this pane.
	 * @param options The options.
	 */
	setOptions(options: PaneSessionOptions<Transport>): void {
		this.#options = options;
	}

	/**
	 * The element the pane fills.
	 * @returns The element, or null before it mounts.
	 */
	element(): HTMLElement | null {
		return this.#element;
	}

	/**
	 * The element the pane fills changed.
	 * @param element The element, or null when it goes.
	 */
	setElement(element: HTMLElement | null): void {
		this.#element = element;
	}
}

/**
 * One pane's entire conversation with the server.
 * @param options What the shell tells the session, and what it wants to hear.
 * @returns The session.
 */
function usePaneSession<Transport extends WorkbenchTransportPort>(
	options: PaneSessionOptions<Transport>,
): PaneSession<Transport> {
	const { paneId } = options;
	const [clientId] = useState(() => mintClientId(paneId));
	const state = useSessionState();
	const [box] = useState(() => new PaneBox<Transport>(options));
	const [core] = useState<PaneCore<Transport>>(() =>
		createPaneCore<Transport>({
			paneId,
			clientId,
			options: box.options.bind(box),
			paneElement: box.element.bind(box),
			workbenchSockets: box.options().createWorkbenchSockets?.() ?? null,
			setConnected: state.setConnected,
			setBoard: state.setBoard,
			setOpened: state.setOpened,
			setHeldBy: state.setHeldBy,
			setDoing: state.setDoing,
		}),
	);

	useEffect(() => {
		box.setOptions(options);
		// What the server hears about this pane may have changed with them.
		core.facetsChanged();
	}, [box, core, options]);

	useEffect(() => {
		core.connect();
		return () => core.dispose();
	}, [core]);

	const attachPaneElement = useCallback(
		(element: HTMLElement | null): void => {
			// Splitting the shell halves a pane, and a pane that reported its old
			// size would put itself in the wrong place on screen.
			box.setElement(element);
			core.paneElementChanged();
		},
		[box, core],
	);
	const takeBack = useCallback((): Promise<TakeBackResult> => core.takeBack(), [core]);
	const openCode = useCallback((subjectId: string): void => core.openCode(subjectId), [core]);
	const readingChanged = useCallback(
		(reading: PaneReading): void => core.readingChanged(reading),
		[core],
	);
	const workbenchTransport = useCallback((): Transport | null => core.workbenchTransport(), [core]);

	return {
		clientId,
		attachPaneElement,
		openedKey: state.openedKey,
		board: state.board,
		connected: state.contact.connected,
		heldBy: state.heldBy,
		doing: state.doing,
		takeBack,
		openCode,
		readingChanged,
		workbenchTransport,
	};
}

export { usePaneSession };
